import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
	getKanbanRuntimeHost,
	getKanbanRuntimeOrigin,
	getKanbanRuntimePort,
	isKanbanRemoteHost,
} from "../core/runtime-endpoint";

export type CorsDecision =
	| { kind: "allow"; origin: string | null }
	| { kind: "preflight"; origin: string }
	| { kind: "reject"; origin: string };

export interface CorsGateInput {
	method: string | undefined;
	originHeader: string | undefined;
	allowedOrigin: string;
}

const isDev = process.env.NODE_ENV === "development";

function isAllowedDevOrigin(origin: string): boolean {
	if (!isDev) return false;
	// In dev mode, allow any localhost/http(s) origin for remote access
	// This enables access via IP addresses and custom domains
	if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
	if (origin.startsWith("https://localhost:") || origin.startsWith("https://127.0.0.1:")) return true;
	// Allow any non-localhost http origin in dev (for remote IP access with passcode protection)
	if (origin.startsWith("http://")) return true;
	const devHosts = process.env.KANBAN_DEV_HOSTS;
	if (devHosts) {
		for (const host of devHosts.split(",")) {
			const trimmed = host.trim().toLowerCase();
			if (trimmed) {
				const allowedOrigins = [
					`http://${trimmed}`,
					`https://${trimmed}`,
					`http://${trimmed}:4173`,
					`http://${trimmed}:8080`,
				];
				if (allowedOrigins.includes(origin)) return true;
			}
		}
	}
	return false;
}

export function evaluateCors(input: CorsGateInput): CorsDecision {
	const origin = input.originHeader || null;
	const isPreflight = input.method === "OPTIONS";

	if (origin === null) {
		return { kind: "allow", origin: null };
	}

	// When binding to 0.0.0.0, allow any origin (remote access mode)
	// This is consistent with isAllowAllHosts() which allows any Host header
	if (isAllowAllHosts()) {
		if (isPreflight) {
			return { kind: "preflight", origin };
		}
		return { kind: "allow", origin };
	}

	if (origin !== input.allowedOrigin && !isAllowedDevOrigin(origin)) {
		return { kind: "reject", origin };
	}

	if (isPreflight) {
		return { kind: "preflight", origin };
	}

	return { kind: "allow", origin };
}

export interface HostGateInput {
	hostHeader: string | undefined;
	allowedHosts: ReadonlySet<string>;
}

export type HostDecision = { kind: "allow" } | { kind: "reject"; host: string | null };

export function evaluateHost(input: HostGateInput): HostDecision {
	if (!input.hostHeader) {
		return { kind: "reject", host: null };
	}

	// When binding to 0.0.0.0, allow any non-empty Host header
	if (isAllowAllHosts()) {
		return { kind: "allow" };
	}

	if (!input.allowedHosts.has(input.hostHeader.toLowerCase())) {
		return { kind: "reject", host: input.hostHeader };
	}

	return { kind: "allow" };
}

export function getAllowedHostHeaders(): ReadonlySet<string> {
	const port = getKanbanRuntimePort();
	const boundHost = getKanbanRuntimeHost().toLowerCase();

	// When binding to 0.0.0.0, accept any Host header (remote access mode)
	// Return an empty set and use a special check in evaluateHost instead
	if (boundHost === "0.0.0.0") {
		return new Set();
	}

	const allowed = new Set<string>();
	const addHostPort = (host: string) => {
		allowed.add(`${host}:${port}`);
	};

	if (isKanbanRemoteHost()) {
		addHostPort(boundHost);
	}

	// Always allow localhost
	addHostPort("localhost");
	addHostPort("127.0.0.1");

	if (isDev) {
		// Vite dev server ports
		allowed.add("localhost:4173");
		allowed.add("127.0.0.1:4173");
		allowed.add("localhost:8080");
		allowed.add("127.0.0.1:8080");
		// Support custom dev hosts
		const devHosts = process.env.KANBAN_DEV_HOSTS;
		if (devHosts) {
			for (const host of devHosts.split(",")) {
				const trimmed = host.trim().toLowerCase();
				if (trimmed) {
					allowed.add(`${trimmed}:${port}`);
					allowed.add(`${trimmed}:4173`);
					allowed.add(`${trimmed}:8080`);
				}
			}
		}
	}
	return allowed;
}

export function isAllowAllHosts(): boolean {
	const boundHost = getKanbanRuntimeHost().toLowerCase();
	return boundHost === "0.0.0.0";
}

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ");
const ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-Kanban-Workspace-Id"].join(", ");
const PREFLIGHT_MAX_AGE_SECONDS = "600";

function applyAllowedOriginHeaders(res: ServerResponse, origin: string): void {
	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Vary", "Origin");
	res.setHeader("Access-Control-Allow-Credentials", "true");
}

function rejectRequest(res: ServerResponse, message: string): { end: boolean } {
	res.writeHead(403, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify({ error: message }));
	return { end: true };
}

function rejectSocket(socket: Duplex): { end: boolean } {
	socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
	socket.destroy();
	return { end: true };
}

export function handleHttpRequest(req: IncomingMessage, res: ServerResponse): { end: boolean } {
	const hostDecision = evaluateHost({
		hostHeader: req.headers.host,
		allowedHosts: getAllowedHostHeaders(),
	});
	if (hostDecision.kind === "reject") {
		return rejectRequest(res, "Host not allowed.");
	}

	const corsDecision = evaluateCors({
		method: req.method,
		originHeader: req.headers.origin,
		allowedOrigin: getKanbanRuntimeOrigin(),
	});

	switch (corsDecision.kind) {
		case "allow": {
			if (corsDecision.origin !== null) {
				applyAllowedOriginHeaders(res, corsDecision.origin);
			}
			return { end: false };
		}
		case "preflight": {
			applyAllowedOriginHeaders(res, corsDecision.origin);
			res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
			res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
			res.setHeader("Access-Control-Max-Age", PREFLIGHT_MAX_AGE_SECONDS);
			res.writeHead(204);
			res.end();
			return { end: true };
		}
		case "reject": {
			return rejectRequest(res, "Origin not allowed.");
		}
	}
}

export function handleSocketUpgrade(request: IncomingMessage, socket: Duplex): { end: boolean } {
	const hostDecision = evaluateHost({
		hostHeader: request.headers.host,
		allowedHosts: getAllowedHostHeaders(),
	});
	if (hostDecision.kind === "reject") {
		return rejectSocket(socket);
	}

	const corsDecision = evaluateCors({
		method: request.method,
		originHeader: request.headers.origin,
		allowedOrigin: getKanbanRuntimeOrigin(),
	});
	if (corsDecision.kind === "reject") {
		return rejectSocket(socket);
	}

	return { end: false };
}
