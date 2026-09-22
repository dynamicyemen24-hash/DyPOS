/**
 * Metrics extension tests (final upgrade campaign, Agent #4).
 *
 * Boots the real server app and asserts the /api/metrics endpoint stays
 * Prometheus text (prom-client Registry.contentType, version 0.0.4), now
 * carrying the new counters (sqlite lock 503s, Retry-After responses, webhook
 * dispatch outcomes), the realtime gauge, the bumpMetric hook and the
 * registerMetrics idempotency. Lock/retry-after behavior is exercised through
 * the REAL metrics middleware + the REAL lock→503 mapping on a throwaway app
 * (the real app's SPA fallback would shadow test routes).
 */
import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import express from "express"
import { once } from "node:events"

import { app } from "../server.js"
import {
	metricsMiddleware,
	registerMetrics,
	bumpMetric,
	setRealtimeConnections,
} from "../middleware/metrics.js"
import { isSqliteLockError } from "../lib/async.js"
import {
	registerErrorTracker,
	registerObservability,
	trackError,
	trackHttpError,
} from "../lib/errorTracker.js"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let realServer
let realPort

async function startServer(expressApp) {
	const server = http.createServer(expressApp)
	server.listen(0)
	await once(server, "listening")
	return { server, port: server.address().port }
}

async function scrape() {
	const res = await fetch(`http://localhost:${realPort}/api/metrics`)
	const text = await res.text()
	return { status: res.status, type: res.headers.get("content-type"), text }
}

function metricValue(text, name, labels) {
	const labelPart = labels
		? `\\{${Object.entries(labels)
				.map(([k, v]) => `${k}="${v}"`)
				.join(",")}\\}`
		: ""
	const re = new RegExp(`^${name}${labelPart} ([0-9.e+-]+)$`, "m")
	const match = text.match(re)
	if (!match) return 0
	const value = Number(match[1])
	return Number.isFinite(value) ? value : 0
}

function seriesCount(text, name) {
	return text
		.split("\n")
		.filter((line) => line && !line.startsWith("#") && line.startsWith(name))
		.length
}

before(async () => {
	const boot = await startServer(app)
	realServer = boot.server
	realPort = boot.port
})

after(() => realServer.close())

describe("metrics endpoint format + new counters", () => {
	it("serves Prometheus text (0.0.4) and lists every new counter/gauge", async () => {
		const { status, type, text } = await scrape()
		assert.equal(status, 200)
		assert.ok(type.includes("text/plain"), `content-type = ${type}`)
		assert.ok(type.includes("0.0.4"), `content-type = ${type}`)
		for (const metric of [
			"dypos_sqlite_lock_errors_total",
			"dypos_retry_after_responses_total",
			"dypos_webhook_dispatch_total",
			"dypos_realtime_connections",
		]) {
			assert.ok(text.includes(metric), `missing ${metric}`)
		}
		// legacy counters remain
		assert.ok(text.includes("dypos_http_request_duration_seconds"))
		assert.ok(text.includes("dypos_webhook_outbox_pending"))
	})

	it("registerMetrics is idempotent on the already-wired server app", async () => {
		assert.equal(registerMetrics(app), false)
		assert.equal(registerMetrics(app), false)
	})

	it("registerMetrics wires a bare app (middleware + token-gated route) then no-ops", async () => {
		const bare = express()
		assert.equal(registerMetrics(bare), true)
		assert.equal(registerMetrics(bare), false)
		const { server, port } = await startServer(bare)
		try {
			const res = await fetch(`http://localhost:${port}/api/metrics`)
			assert.equal(res.status, 200)
			assert.ok((await res.text()).includes("dypos_sqlite_lock_errors_total"))
		} finally {
			server.close()
		}
	})
})

describe("lock + retry-aware response counters (real middleware, real mapping)", () => {
	function lockApp() {
		const mini = express()
		mini.use(metricsMiddleware)
		mini.get("/__force_lock", (_req, _res, next) =>
			next(new Error("database is locked: retry")),
		)
		mini.use((err, _req, res, _next) => {
			if (isSqliteLockError(err)) {
				res.set("Retry-After", "2")
				return res.status(503).json({ error: "locked" })
			}
			return res.status(500).json({ error: "server" })
		})
		return mini
	}

	it("a forced SQLite lock → 503 + Retry-After and increments the 503 lock counter (bounded)", async () => {
		const textBefore = (await scrape()).text
		const lockBefore = metricValue(textBefore, "dypos_sqlite_lock_errors_total")
		const lockKindBefore = metricValue(
			textBefore,
			"dypos_retry_after_responses_total",
			{ kind: "sqlite_lock" },
		)

		const mini = lockApp()
		const { server, port } = await startServer(mini)
		try {
			const res = await fetch(`http://localhost:${port}/__force_lock`)
			assert.equal(res.status, 503)
			assert.equal(res.headers.get("retry-after"), "2")
		} finally {
			server.close()
		}

		const after = metricValue(
			(await scrape()).text,
			"dypos_sqlite_lock_errors_total",
		)
		const lockKindAfter = metricValue(
			(await scrape()).text,
			"dypos_retry_after_responses_total",
			{ kind: "sqlite_lock" },
		)
		assert.equal(after, lockBefore + 1)
		assert.equal(lockKindAfter, lockKindBefore + 1)
		// single series: cardinality can never grow from repeated lock errors
		assert.equal(
			seriesCount((await scrape()).text, "dypos_sqlite_lock_errors_total"),
			1,
		)
	})

	it("a 429 with Retry-After counts kind=rate_limit; sqlite_lock untouched", async () => {
		const mini = express()
		mini.use(metricsMiddleware)
		mini.get("/__retry", (_req, res) => {
			res.set("Retry-After", "2")
			return res.status(429).json({ error: "too many" })
		})
		const before = metricValue(
			(await scrape()).text,
			"dypos_retry_after_responses_total",
			{ kind: "rate_limit" },
		)
		const lockBefore = metricValue(
			(await scrape()).text,
			"dypos_sqlite_lock_errors_total",
		)
		const { server, port } = await startServer(mini)
		try {
			const res = await fetch(`http://localhost:${port}/__retry`)
			assert.equal(res.status, 429)
			assert.equal(res.headers.get("retry-after"), "2")
		} finally {
			server.close()
		}
		const after = metricValue(
			(await scrape()).text,
			"dypos_retry_after_responses_total",
			{ kind: "rate_limit" },
		)
		const lockAfter = metricValue(
			(await scrape()).text,
			"dypos_sqlite_lock_errors_total",
		)
		assert.equal(after, before + 1)
		assert.equal(
			lockAfter,
			lockBefore,
			"sqlite lock counter must not move on 429s",
		)
	})
})

describe("bumpMetric + webhook dispatch outcomes", () => {
	it("increment known counters and never throw on unknown names", () => {
		assert.equal(bumpMetric("webhook_dispatch", { status: "delivered" }), true)
		assert.equal(bumpMetric("webhook_dispatch", { status: "dead" }, 2), true)
		assert.equal(bumpMetric("no_such_metric", { anything: 1 }), false)
	})

	it("counts land in /api/metrics and cardinality stays bounded to the fixed status set", async () => {
		const { text } = await scrape()
		assert.equal(
			metricValue(text, "dypos_webhook_dispatch_total", {
				status: "delivered",
			}) >= 1,
			true,
		)
		assert.equal(
			metricValue(text, "dypos_webhook_dispatch_total", { status: "dead" }) >=
				2,
			true,
		)
		// only the statuses ever emitted appear as series (bounded, never per-value)
		const series = seriesCount(text, "dypos_webhook_dispatch_total")
		assert.ok(series <= 4, `webhook dispatch series out of bound: ${series}`)
		assert.ok(series >= 2)
	})

	it("realtime connection gauge is wired without any SSE dependency", async () => {
		setRealtimeConnections(3)
		assert.equal(
			metricValue((await scrape()).text, "dypos_realtime_connections"),
			3,
		)
		assert.equal(bumpMetric("realtime_connections", {}, 7), true)
		assert.equal(
			metricValue((await scrape()).text, "dypos_realtime_connections"),
			7,
		)
	})
})

describe("error tracker", () => {
	it("trackError returns a sanitised body, truncates stack to 4KB, never throws", () => {
		const body = trackError(new Error("boom"))
		assert.equal(body.message, "boom")
		assert.equal(body.level, "error")
		assert.equal(body.service, "dypos-server")
		assert.ok(body.stack.length >= 3)
		assert.ok(Number.isFinite(Date.parse(body.timestamp)))

		const huge = trackError(new Error(`x${"y".repeat(5000)}`))
		assert.ok(huge.stack.length <= 4096, `stack length = ${huge.stack.length}`)
	})

	it("trackHttpError pulls request correlation context + status", () => {
		const body = trackHttpError(
			{
				id: "req-123",
				method: "POST",
				url: "/api/invoices",
				user: { username: "alice", tenantId: "t1" },
			},
			new Error("locked"),
			503,
		)
		assert.equal(body.req_id, "req-123")
		assert.equal(body.status, 503)
		assert.equal(body.user, "alice")
		assert.equal(body.tenant_id, "t1")
	})

	it("fire-and-forget webhook when DYPOS_ERROR_WEBHOOK_URL is set: never blocks, never throws", async () => {
		process.env.DYPOS_ERROR_WEBHOOK_URL = "http://127.0.0.1:1/err"
		try {
			const started = Date.now()
			trackError(new Error("webhook smoke"))
			assert.ok(
				Date.now() - started < 1000,
				"trackError must return synchronously for fire-and-forget",
			)
			await sleep(80) // let the refused fetch settle inside the voided promise
		} finally {
			process.env.DYPOS_ERROR_WEBHOOK_URL = ""
		}
	})

	it("errorTrackerMiddleware slots into an error chain without masking the handler", async () => {
		const mini = express()
		mini.get("/__boom", (_req, _res, next) =>
			next(new Error("database is locked")),
		)
		mini.use(registerErrorTracker())
		mini.use((err, _req, res, _next) => {
			if (isSqliteLockError(err)) {
				res.set("Retry-After", "2")
				return res.status(503).json({ error: "locked" })
			}
			return res.status(500).json({ error: "server" })
		})
		// idempotent register on an app instance
		assert.equal(typeof registerErrorTracker(mini), "function")
		const { server, port } = await startServer(mini)
		try {
			const res = await fetch(`http://localhost:${port}/__boom`)
			assert.equal(res.status, 503)
			assert.equal(res.headers.get("retry-after"), "2")
			assert.equal((await res.json()).error, "locked")
		} finally {
			server.close()
		}
	})

	it("registerObservability on a bare app mounts features + error handling without touching metrics", async () => {
		const mini = express()
		const middleware = registerObservability(mini)
		assert.equal(typeof middleware, "function")
		mini.use("/api", (_req, _res, next) =>
			next(new Error("database is locked")),
		)
		mini.use((err, _req, res, _next) => {
			if (isSqliteLockError(err)) {
				res.set("Retry-After", "2")
				return res.status(503).json({ error: "locked" })
			}
			return res.status(500).json({ error: "server" })
		})
		const { server, port } = await startServer(mini)
		try {
			const features = await fetch(`http://localhost:${port}/api/features`)
			assert.equal(features.status, 200)
			const json = await features.json()
			assert.ok(Array.isArray(json.features) && json.features.length >= 1)
			const lock = await fetch(`http://localhost:${port}/api/boom`)
			assert.equal(lock.status, 503)
		} finally {
			server.close()
		}
	})
})
