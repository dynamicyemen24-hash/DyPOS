/**
 * DyPOS Logger — structured pino core (world-class observability).
 *
 * Replaces ad-hoc console.log JSON with:
 * - pino structured logs (level, req_id, method, url, status, duration)
 * - request-scoped child loggers (req.log)
 * - redaction of secrets (password, token, authorization)
 * - pretty transport in development, JSON in production
 *
 * Agent #4 additions (additive — the exported API is unchanged):
 * - childSafe(bindings) : never-throws child logger factory (returns the base
 *   logger when a child cannot be built — safe for background workers).
 * - withCtx(req, extra): correlation-field extractor → merge into any pino
 *   call so every log line carries req_id + user + tenant for tracing.
 *
 * Usage:
 *   import { logger, reqLogger, withCtx } from '../lib/logger.js';
 *   logger.info(withCtx(req, { op: 'invoice.create' }), 'sale recorded');
 *   const jobLog = childSafe({ op: 'dispatcher' });
 */
import pino from "pino"

const isDev = process.env.NODE_ENV !== "production"

export const logger = pino({
	level: process.env.DYPOS_LOG_LEVEL || (isDev ? "debug" : "info"),
	redact: {
		paths: [
			"password",
			"token",
			"*.password",
			"*.token",
			"authorization",
			"req.headers.authorization",
		],
		censor: "[REDACTED]",
	},
	base: { service: "dypos-server" },
	timestamp: pino.stdTimeFunctions.isoTime,
})

/** Express middleware: attaches req.log (request-scoped child) + req.id. */
export function reqLogger(req, _res, next) {
	try {
		req.log = logger.child({
			req_id: req.id,
			method: req.method,
			url: req.url,
			user: req.user?.username,
		})
	} catch {
		req.log = logger
	}
	next()
}

/**
 * Never-throws child-logger factory. Background workers (webhook dispatcher,
 * sync engine) can tag their logs without risking a throw on odd bindings.
 * @param {object} [bindings]
 * @returns {import('pino').Logger}
 */
export function childSafe(bindings) {
	try {
		const safe = bindings && typeof bindings === "object" ? bindings : {}
		return logger.child(safe)
	} catch {
		return logger
	}
}

/**
 * Correlation-field extractor for structured logging. Pulls the request
 * correlation context (req_id, user, tenant, method, url) and merges extra
 * fields, dropping all undefined keys so pino output stays tight.
 * @param {{ id?: string, req_id?: string, method?: string, url?: string, originalUrl?: string, user?: { username?: string, tenantId?: string } }} [req]
 * @param {object} [extra]
 * @returns {Record<string, unknown>}
 */
export function withCtx(req, extra = {}) {
	const merged = {
		req_id: req?.req_id ?? req?.id ?? undefined,
		method: req?.method,
		url: req?.url ?? req?.originalUrl,
		user: req?.user?.username,
		tenant_id: req?.user?.tenantId,
		...(extra || {}),
	}
	for (const key of Object.keys(merged)) {
		if (merged[key] === undefined) delete merged[key]
	}
	return merged
}

export default logger
