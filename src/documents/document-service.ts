// Core service for simple txt document CRUD operations.
// Documents are stored as .txt files on the local filesystem with a JSON index file.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	RuntimeDocumentCreateRequest,
	RuntimeDocumentCreateResponse,
	RuntimeDocumentDeleteRequest,
	RuntimeDocumentDeleteResponse,
	RuntimeDocumentGetRequest,
	RuntimeDocumentGetResponse,
	RuntimeDocumentIndex,
	RuntimeDocumentListRequest,
	RuntimeDocumentListResponse,
	RuntimeDocumentMeta,
	RuntimeDocumentSearchRequest,
	RuntimeDocumentSearchResponse,
	RuntimeDocumentUpdateRequest,
	RuntimeDocumentUpdateResponse,
} from "../core/api-contract";

const DOC_INDEX_VERSION = 1;
const MAX_DOCUMENT_SIZE_BYTES = 1_048_576; // 1 MB

function nowIso(): string {
	return new Date().toISOString();
}

function errorResponse(code: string, msg: string) {
	return { code, msg, data: null } as const;
}

function okResponse<T>(code: string, data: T) {
	return { code, msg: "SUCCESS", data } as const;
}

async function atomicWrite(targetPath: string, content: string): Promise<void> {
	const tmpPath = `${targetPath}.tmp.${randomUUID().slice(0, 8)}`;
	await writeFile(tmpPath, content, "utf-8");
	await rename(tmpPath, targetPath);
}

export interface DocumentServiceDependencies {
	/** Root directory for document storage (e.g. ~/.kanban/documents/) */
	documentsDir: string;
}

export class DocumentService {
	private readonly dir: string;

	constructor(private readonly deps: DocumentServiceDependencies) {
		this.dir = deps.documentsDir;
	}

	// ── Index helpers ──────────────────────────────────────────────────────────

	private indexFilePath(): string {
		return join(this.dir, "index.json");
	}

	private async ensureDir(): Promise<void> {
		await mkdir(this.dir, { recursive: true });
	}

	private async loadIndex(): Promise<RuntimeDocumentIndex> {
		try {
			const raw = await readFile(this.indexFilePath(), "utf-8");
			const parsed = JSON.parse(raw) as RuntimeDocumentIndex;
			if (parsed && typeof parsed === "object" && Array.isArray(parsed.documents)) {
				return parsed as RuntimeDocumentIndex;
			}
		} catch {
			// File missing or corrupt — rebuild from scratch
		}
		return { version: DOC_INDEX_VERSION, documents: [] };
	}

	private async saveIndex(index: RuntimeDocumentIndex): Promise<void> {
		await this.ensureDir();
		await atomicWrite(this.indexFilePath(), JSON.stringify(index, null, 2));
	}

	private async rebuildIndex(): Promise<RuntimeDocumentIndex> {
		// Scan .txt files on disk to rebuild the index
		const { readdir } = await import("node:fs/promises");
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch {
			return { version: DOC_INDEX_VERSION, documents: [] };
		}
		const txtFiles = files.filter((f) => f.endsWith(".txt") && f.length > 4);
		const documents: RuntimeDocumentMeta[] = [];
		for (const fileName of txtFiles) {
			try {
				const filePath = join(this.dir, fileName);
				const stat = await (await import("node:fs/promises")).stat(filePath);
				documents.push({
					id: fileName.slice(0, -4),
					title: fileName.slice(0, -4),
					fileName,
					taskId: null,
					createdBy: "system",
					createdAt: stat.birthtime.toISOString(),
					updatedAt: stat.mtime.toISOString(),
					size: stat.size,
				});
			} catch {
				// skip unreadable files
			}
		}
		return { version: DOC_INDEX_VERSION, documents };
	}

	// ── CRUD ────────────────────────────────────────────────────────────────────

	async createDocument(request: RuntimeDocumentCreateRequest): Promise<RuntimeDocumentCreateResponse> {
		// Validate
		if (!request.title || request.title.trim().length === 0) {
			return errorResponse("DOC_001", "Title must not be empty");
		}
		if (Buffer.byteLength(request.content, "utf-8") > MAX_DOCUMENT_SIZE_BYTES) {
			return errorResponse("DOC_001", "Content exceeds maximum size of 1 MB");
		}

		await this.ensureDir();

		const id = randomUUID();
		const fileName = `${id}.txt`;
		const now = nowIso();

		const meta: RuntimeDocumentMeta = {
			id,
			title: request.title.trim(),
			fileName,
			taskId: request.taskId ?? null,
			createdBy: "user",
			createdAt: now,
			updatedAt: now,
			size: Buffer.byteLength(request.content, "utf-8"),
		};

		// Write content file atomically
		try {
			await atomicWrite(join(this.dir, fileName), request.content);
		} catch {
			return errorResponse("DOC_002", "Failed to write document file to disk");
		}

		// Update index
		const index = await this.loadIndex();
		index.documents.push(meta);
		try {
			await this.saveIndex(index);
		} catch {
			// Best-effort: content already written, index can be rebuilt later
		}

		return okResponse("DOC_000", { id: meta.id, title: meta.title, createdAt: meta.createdAt });
	}

	async getDocument(request: RuntimeDocumentGetRequest): Promise<RuntimeDocumentGetResponse> {
		const index = await this.loadIndex();
		const meta = index.documents.find((d) => d.id === request.documentId);
		if (!meta) {
			return errorResponse("DOC_003", "Document not found");
		}

		try {
			const content = await readFile(join(this.dir, meta.fileName), "utf-8");
			return okResponse("DOC_000", {
				...meta,
				content,
			});
		} catch {
			return errorResponse("DOC_004", "Failed to read document file");
		}
	}

	async updateDocument(request: RuntimeDocumentUpdateRequest): Promise<RuntimeDocumentUpdateResponse> {
		if (!request.title && !request.content) {
			return errorResponse("DOC_001", "At least one of title or content must be provided");
		}

		const index = await this.loadIndex();
		const metaIdx = index.documents.findIndex((d) => d.id === request.documentId);
		if (metaIdx === -1) {
			return errorResponse("DOC_003", "Document not found");
		}

		const meta = index.documents[metaIdx];
		const now = nowIso();

		if (request.title !== undefined) {
			if (request.title.trim().length === 0) {
				return errorResponse("DOC_001", "Title must not be empty");
			}
			meta.title = request.title.trim();
		}

		if (request.content !== undefined) {
			if (Buffer.byteLength(request.content, "utf-8") > MAX_DOCUMENT_SIZE_BYTES) {
				return errorResponse("DOC_001", "Content exceeds maximum size of 1 MB");
			}
			try {
				await atomicWrite(join(this.dir, meta.fileName), request.content);
			} catch {
				return errorResponse("DOC_002", "Failed to write document file to disk");
			}
			meta.size = Buffer.byteLength(request.content, "utf-8");
		}

		meta.updatedAt = now;
		index.documents[metaIdx] = meta;

		try {
			await this.saveIndex(index);
		} catch {
			// Best-effort
		}

		return okResponse("DOC_000", meta);
	}

	async deleteDocument(request: RuntimeDocumentDeleteRequest): Promise<RuntimeDocumentDeleteResponse> {
		const index = await this.loadIndex();
		const metaIdx = index.documents.findIndex((d) => d.id === request.documentId);
		if (metaIdx === -1) {
			return { code: "DOC_003", msg: "Document not found" };
		}

		const meta = index.documents[metaIdx];

		// Remove from index first
		index.documents.splice(metaIdx, 1);
		try {
			await this.saveIndex(index);
		} catch {
			// Best-effort
		}

		// Remove file
		try {
			await rm(join(this.dir, meta.fileName), { force: true });
		} catch {
			// File already gone — that's fine
		}

		return { code: "DOC_000", msg: "SUCCESS" };
	}

	async listDocuments(request?: RuntimeDocumentListRequest): Promise<RuntimeDocumentListResponse> {
		const index = await this.loadIndex();
		let items = index.documents;

		const taskId = request?.taskId;
		if (taskId) {
			items = items.filter((d) => d.taskId === taskId);
		}

		// Sort by updatedAt descending
		items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

		const page = request?.page ?? 1;
		const pageSize = request?.pageSize ?? 20;
		const start = (page - 1) * pageSize;
		const paged = items.slice(start, start + pageSize);

		return {
			code: "DOC_000",
			msg: "SUCCESS",
			data: { items: paged, total: items.length },
		};
	}

	async searchDocuments(request: RuntimeDocumentSearchRequest): Promise<RuntimeDocumentSearchResponse> {
		const index = await this.loadIndex();
		const keyword = request.keyword.toLowerCase();

		// Filter by title match in index
		const titleMatches = index.documents.filter((d) => d.title.toLowerCase().includes(keyword));

		// Also search file content for additional matches
		const contentMatchIds = new Set<string>();
		const { readdir } = await import("node:fs/promises");
		try {
			const files = await readdir(this.dir);
			const txtFiles = files.filter((f) => f.endsWith(".txt"));
			for (const fileName of txtFiles) {
				const docId = fileName.slice(0, -4);
				// Skip if already matched by title
				if (titleMatches.some((d) => d.id === docId)) continue;
				try {
					const content = await readFile(join(this.dir, fileName), "utf-8");
					if (content.toLowerCase().includes(keyword)) {
						contentMatchIds.add(docId);
					}
				} catch {
					// Skip unreadable files
				}
			}
		} catch {
			// Directory not readable
		}

		const matchedIds = new Set([
			...titleMatches.map((d) => d.id),
			...contentMatchIds,
		]);

		let items = index.documents.filter((d) => matchedIds.has(d.id));
		items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

		const page = request?.page ?? 1;
		const pageSize = request?.pageSize ?? 20;
		const start = (page - 1) * pageSize;
		const paged = items.slice(start, start + pageSize);

		return {
			code: "DOC_000",
			msg: "SUCCESS",
			data: { items: paged, total: items.length },
		};
	}

	/** Rebuild index by scanning .txt files on disk. Call on startup for recovery. */
	async repairIndex(): Promise<void> {
		const index = await this.rebuildIndex();
		await this.saveIndex(index);
	}

	/** Get the total number of documents. */
	async countDocuments(): Promise<number> {
		const index = await this.loadIndex();
		return index.documents.length;
	}
}