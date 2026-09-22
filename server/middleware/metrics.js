/**
 * DyPOS Metrics — Prometheus + structured latency histograms.
 * Operational visibility for millions of daily transactions.
 * Exposed at /api/metrics (scraped by Prometheus) and /api/health (JSON).
 *
 * Cardinality-safe: dynamic ids (uuid/numbers) are normalized to :id
 * so Prometheus isn't killed by unbounded label values. Every label set
 * below is fixed and bounded (O(1) cardinality by construction).
 *
 * Extensions (final upgrade campaign, Agent #4):
 *  - lock503            : SQLite lock collisions served as 503 (piggybacks the
 *                         response-aware finish hook — the central error handler
 *                         in server.js maps lock errors to 503 + Retry-After, so
 *                         the middleware observes the signature without touching
 *                         error middleware).
 *  - retryAfter         : any response carrying Retry-After, bucketed by the
 *                         producer kind (sqlite_lock | rate_limit | server).
 *  - webhookDispatch    : outbox dispatcher outcomes by status — wired from
 *                         server/lib/webhooks.js via bumpMetric('webhook_dispatch',
 *                         { status }) by the orchestrator.
 *  - realtimeConnections: SSE connection gauge. OPTIONAL: the realtime SSE route
 *                         may exist (another agent) or not — this gauge is safe
 *                         either way; no import of any SSE module is performed.
 *  - bumpMetric(name, labels, value): generic, never-throws counter/gauge hook
 *                         so background workers (dispatcher, sync) can emit
 *                         metrics without importing prom-client.
 *  - registerMetrics(app): idempotent wiring for apps not already mounted by
 *                         server.js (returns true only when it mounted something).
 */
import client from "prom-client"

const register = new client.Registry()
client.collectDefaultMetrics({ register, prefix: "dypos_" })

export const httpDuration = new client.Histogram({
	name: "dypos_http_request_duration_seconds",
	help: "HTTP request duration in seconds",
	labelNames: ["method", "route", "status"],
	buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
	registers: [register],
})

export const dbQueryDuration = new client.Histogram({
	name: "dypos_db_query_duration_seconds",
	help: "DB query duration",
	labelNames: ["operation"],
	buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
	registers: [register],
})

export const invoicesCounter = new client.Counter({
	name: "dypos_invoices_created_total",
	help: "Total invoices created",
	registers: [register],
})

export const syncCounter = new client.Counter({
	name: "dypos_sync_operations_total",
	help: "Total sync operations",
	labelNames: ["direction", "status"],
	registers: [register],
})

export const authAttempts = new client.Counter({
	name: "dypos_auth_attempts_total",
	help: "Login attempts by outcome",
	labelNames: ["outcome"],
	registers: [register],
})

export const cacheOps = new client.Counter({
	name: "dypos_cache_operations_total",
	help: "Cache hits/misses by tier",
	labelNames: ["result"],
	registers: [register],
})

export const lock503 = new client.Counter({
	name: "dypos_sqlite_lock_errors_total",
	help: "SQLite lock collisions served as 503 (backend busy, retryable)",
	registers: [register],
})

export const retryAfter = new client.Counter({
	name: "dypos_retry_after_responses_total",
	help: "Responses carrying Retry-After by producer kind (bounded label set)",
	labelNames: ["kind"],
	registers: [register],
})

export const webhookDispatch = new client.Counter({
	name: "dypos_webhook_dispatch_total",
	help: "Webhook outbox dispatch outcomes by status (delivered|skipped|dead|failed)",
	labelNames: ["status"],
	registers: [register],
})

export const outboxPending = new client.Gauge({
	name: "dypos_webhook_outbox_pending",
	help: "Webhook outbox PENDING jobs (updated on /api/health)",
	registers: [register],
})

export const outboxDead = new client.Gauge({
	name: "dypos_webhook_outbox_dead",
	help: "Webhook outbox DEAD jobs (updated on /api/health)",
	registers: [register],
})

export const stockLow = new client.Gauge({
	name: "dypos_stock_low_products",
	help: "Products at/below the low-stock threshold (updated on /api/health)",
	registers: [register],
})

/**
 * Realtime SSE connection gauge. The SSE route is optional (another agent may
 * create it) — this gauge is dependency-free; the SSE wiring calls
 * setRealtimeConnections(n) / trackRealtimeConnection(delta) when it exists.
 */
export const realtimeConnections = new client.Gauge({
	name: "dypos_realtime_connections",
	help: "Active realtime (SSE) client connections (0 when route not wired)",
	registers: [register],
})

/** Time a sync DB operation and observe it (never throws). */
export function observeDb(operation, fn) {
	const start = process.hrtime.bigint()
	try {
		return fn()
	} finally {
		try {
			const secs = Number(process.hrtime.bigint() - start) / 1e9
			dbQueryDuration.labels(operation).observe(secs)
		} catch {
			/* ignore */
		}
	}
}

/** Normalize /api/invoices/<uuid> → /api/invoices/:id to bound cardinality */
export function normalizeRoute(req) {
	const base = req.baseUrl || ""
	const p = req.route?.path || req.path || ""
	let full = `${base}${p}`
	// Fallback when route not yet matched: scrub ids from raw path
	if (!req.route?.path) {
		full = (base + (req.path || ""))
			.replace(/\/[0-9a-fA-F-]{8,}/g, "/:id")
			.replace(/\/\d+(?=\/|$)/g, "/:id")
	}
	return full.slice(0, 128)
}

function retryAfterKind(status) {
	if (status === 503) return "sqlite_lock"
	if (status === 429) return "rate_limit"
	return "server"
}

export function metricsMiddleware(req, res, next) {
	const start = process.hrtime.bigint()
	res.on("finish", () => {
		try {
			const duration = Number(process.hrtime.bigint() - start) / 1e9
			const route = normalizeRoute(req)
			// Skip high-frequency health probes from latency histograms to reduce overhead
			if (route === "/api/health" || route === "/api/ready") return
			httpDuration
				.labels(req.method, route, String(res.statusCode))
				.observe(duration)
		} catch {
			/* metrics must never break requests */
		}
		try {
			// Lock/Retry-After visibility piggybacks the response-aware pattern:
			// server.js maps sqlite lock errors to 503 + Retry-After → observable here
			// without touching error middleware. express-rate-limit sets Retry-After on
			// 429 → countable as rate_limit.
			const hasRetryAfter = Boolean(res.getHeader?.("Retry-After"))
			const status = res.statusCode
			if (status === 503 && hasRetryAfter) lock503.inc()
			if (hasRetryAfter) retryAfter.labels(retryAfterKind(status)).inc()
		} catch {
			/* counters must never break requests */
		}
	})
	next()
}

export async function metricsHandler(_req, res) {
	res.set("Content-Type", register.contentType)
	res.end(await register.metrics())
}

/**
 * Generic, never-throws metric hook for background workers (webhook dispatcher,
 * sync engine, realtime route). For counters, `value` is the increment delta
 * (default 1); for gauges, `value` sets the gauge absolutely (default 1).
 * @param {string} name short metric name (e.g. "webhook_dispatch")
 * @param {Record<string, string|number>} labels bounded label values only
 * @param {number} [value]
 * @returns {boolean} true when a known metric was bumped
 */
const metricIndex = new Map([
	["http_duration", httpDuration],
	["db_query_duration", dbQueryDuration],
	["invoices_created", invoicesCounter],
	["sync_operations", syncCounter],
	["auth_attempts", authAttempts],
	["cache_operations", cacheOps],
	["sqlite_lock_errors", lock503],
	["retry_after", retryAfter],
	["webhook_dispatch", webhookDispatch],
	["outbox_pending", outboxPending],
	["outbox_dead", outboxDead],
	["stock_low", stockLow],
	["realtime_connections", realtimeConnections],
])

export function bumpMetric(name, labels = {}, value = 1) {
	const metric = metricIndex.get(name)
	if (!metric) return false
	try {
		if (metric instanceof client.Gauge) {
			metric.set(value)
		} else if (typeof metric.inc === "function") {
			metric.inc(labels, value)
		} else if (typeof metric.observe === "function") {
			metric.observe(value)
		}
		return true
	} catch {
		return false
	}
}

/** SSE wiring: absolute connection count (safe to call when route absent). */
export function setRealtimeConnections(n) {
	try {
		realtimeConnections.set(Number.isFinite(n) ? n : 0)
	} catch {
		/* never throws */
	}
}

/** SSE wiring: connect/disconnect deltas (safe to call when route absent). */
export function trackRealtimeConnection(delta = 0) {
	try {
		realtimeConnections.inc(delta)
	} catch {
		/* never throws */
	}
}

function routerHasPath(app, path) {
	try {
		return (app._router?.stack || []).some(
			(layer) => layer.route && layer.route.path === path,
		)
	} catch {
		return false
	}
}

function routerHasMiddleware(app, fn) {
	try {
		return (app._router?.stack || []).some(
			(layer) => !layer.route && layer.handle === fn,
		)
	} catch {
		return false
	}
}

const registeredApps = new WeakSet()

/**
 * Idempotent observability wiring for an Express app. server.js already mounts
 * the middleware + /api/metrics (token-gated); calling this on that app returns
 * false and mounts nothing. On a bare app it mounts the middleware and the
 * token-gated metrics route.
 * @param {import('express').Express} app
 * @returns {boolean} true when this call mounted something new
 */
export function registerMetrics(app) {
	if (!app || typeof app.use !== "function") return false
	if (registeredApps.has(app)) return false
	let mounted = false
	if (!routerHasMiddleware(app, metricsMiddleware)) {
		app.use(metricsMiddleware)
		mounted = true
	}
	if (!routerHasPath(app, "/api/metrics")) {
		app.get("/api/metrics", async (req, res) => {
			const token = process.env.DYPOS_METRICS_TOKEN
			if (
				token &&
				req.query.token !== token &&
				req.headers["x-metrics-token"] !== token
			) {
				return res.status(403).json({ error: "Forbidden" })
			}
			return metricsHandler(req, res)
		})
		mounted = true
	}
	registeredApps.add(app)
	return mounted
}

export { register }
export default {
	httpDuration,
	dbQueryDuration,
	invoicesCounter,
	syncCounter,
	authAttempts,
	cacheOps,
	lock503,
	retryAfter,
	webhookDispatch,
	outboxPending,
	outboxDead,
	stockLow,
	realtimeConnections,
	observeDb,
	normalizeRoute,
	metricsMiddleware,
	metricsHandler,
	bumpMetric,
	setRealtimeConnections,
	trackRealtimeConnection,
	registerMetrics,
	register,
}
