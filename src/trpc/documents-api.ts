// tRPC handlers for document CRUD operations.
// Delegates all domain logic to DocumentService.

import type { RuntimeTrpcContext } from "./app-router";
import type { DocumentService } from "../documents/document-service";

export interface DocumentsApiDependencies {
	documentService: DocumentService;
}

export function createDocumentsApi(
	deps: DocumentsApiDependencies,
): RuntimeTrpcContext["documentsApi"] {
	const { documentService } = deps;

	return {
		create: async (input) => {
			return await documentService.createDocument(input);
		},
		get: async (input) => {
			return await documentService.getDocument(input);
		},
		update: async (input) => {
			return await documentService.updateDocument(input);
		},
		delete: async (input) => {
			return await documentService.deleteDocument(input);
		},
		list: async (input) => {
			return await documentService.listDocuments(input ?? {});
		},
		search: async (input) => {
			return await documentService.searchDocuments(input);
		},
	};
}

export type DocumentsApi = RuntimeTrpcContext["documentsApi"];