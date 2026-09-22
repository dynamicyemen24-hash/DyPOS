/**
 * DyPOS Error Tracker — central error abstraction.
 *
 * trackError(err, ctx): structured pino log + optional fire-and-forget webhook
 * (DYPOS_ERROR_WEBHOOK_URL, 2s timeout, retry-once on 5xx with a tiny sleep,
 * body: level, service, req_id?, message, stack truncated to 4KB, timestamp).
 * Never blocks, never throws. Zero dependencies (global fetch, Node >= 22.5).
 *
 * registerErrorTracker(app): mounts errorTrackerMiddleware. MUST be registered
 * BEFORE the existing final error handler in server.js (that handler responds
 * and does not call next() — an error middleware registered after it never
 * runs). registerErrorTracker(app) returns the middleware so the orchestrator
 * can also place it manually.
 *
 * registerObservability(app): one-call observability bundle that mounts the
 * features routes + this error handling (metrics wiring stays in
 * registerMetrics(app) / server.js — this bundle deliberately does NOT mount
 * /api/metrics). Idempotent.
 */
import { logger } from "./logger.js"
import { registerFeatures } from "../routes/features.js"

const MAX_STACK = 4096
const MAX_MESSAGE = 2000
const WEBHOOK_TIMEOUT_MS = 2000
const RETRY_SLEEP_MS = 50

const mountedApps = new WeakSet()

function truncateStack(err, message) {
	const raw = err?.stack || message
	return String(raw).slice(0, MAX_STACK)
}

function webhookUrl() {
	return process.env.DYPOS_ERROR_WEBHOOK_URL?.trim()
}

async function postWebhookOnce(url, body) {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
		})
		return res.status
	} catch {
		return null
	}
}

async function deliverWebhook(url, body) {
	try {
		const first = await postWebhookOnce(url, body)
		if (first !== null && first >= 500 && first < 600) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_SLEEP_MS))
			await postWebhookOnce(url, body) // retry once on 5xx
		}
	} catch {
		/* fire-and-forget: never throws, never blocks the request path */
	}
}

/**
 * @param {unknown} err
 * @param {{ level?: 'error'|'warn', service?: string, op?: string, req_id?: string, status?: number, method?: string, url?: string, user?: string, tenant_id?: string }} [ctx]
 * @returns {{ level: string, service: string, message: string, stack: string, timestamp: string }} the sanitised log/webhook body
 */
export function trackError(err, ctx = {}) {
	const message = String(err?.message || err || "unknown error").slice(
		0,
		MAX_MESSAGE,
	)
	const body = {
		level: ctx.level === "warn" ? "warn" : "error",
		service: ctx.service || "dypos-server",
		req_id: ctx.req_id ?? undefined,
		status: Number.isInteger(ctx.status) ? ctx.status : undefined,
		op: ctx.op ?? undefined,
		method: ctx.method,
		url: ctx.url,
		user: ctx.user,
		tenant_id: ctx.tenant_id,
		message,
		stack: truncateStack(err, message),
		timestamp: new Date().toISOString(),
	}
	for (const key of Object.keys(body)) {
		if (body[key] === undefined) delete body[key]
	}
	try {
		logger.error({ ...body }, "error tracked")
	} catch {
		/* logging must never throw */
	}
	const url = webhookUrl()
	if (url) void deliverWebhook(url, body)
	return body
}

/**
 * Request-scoped variant: pulls correlation context (req_id, user, tenant)
 * plus the response status into the tracked error.
 * @param {{ id?: string, headers?: Record<string, unknown>, method?: string, url?: string, originalUrl?: string, user?: { username?: string, tenantId?: string } }} req
 * @param {unknown} err
 * @param {number} [status]
 * @returns {object} sanitised body
 */
export function trackHttpError(req, err, status) {
	return trackError(err, {
		req_id: req?.id || req?.headers?.["x-request-id"],
		method: req?.method,
		url: req?.originalUrl || req?.url,
		user: req?.user?.username,
		tenant_id: req?.user?.tenantId,
		status,
	})
}

export function errorTrackerMiddleware(err, req, res, next) {
	try {
		trackHttpError(req, err, res.statusCode >= 400 ? res.statusCode : undefined)
	} catch {
		/* tracking must never mask the underlying error */
	}
	next(err)
}

/**
 * Mount the error tracker as an error middleware. Must run BEFORE the final
 * handler in server.js (which responds and never calls next).
 * @param {import('express').Express} [app]
 * @returns {import('express').ErrorRequestHandler} the middleware (for manual placement)
 */
export function registerErrorTracker(app) {
	if (app && typeof app.use === "function" && !mountedApps.has(app)) {
		app.use(errorTrackerMiddleware)
		mountedApps.add(app)
	}
	return errorTrackerMiddleware
}

/**
 * One-call observability bundle: features routes + error handling. Metrics are
 * deliberately NOT mounted here (server.js already does; registerMetrics(app)
 * is the standalone idempotent hook if it does not).
 * @param {import('express').Express} app
 * @returns {import('express').ErrorRequestHandler} the mounted error middleware
 */
export function registerObservability(app) {
	registerFeatures(app)
	return registerErrorTracker(app)
}

export default {
	trackError,
	trackHttpError,
	errorTrackerMiddleware,
	registerErrorTracker,
	registerObservability,
}
