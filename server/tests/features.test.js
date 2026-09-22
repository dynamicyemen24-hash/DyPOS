/**
 * Feature-flag tests (final upgrade campaign, Agent #4).
 *
 * Route behavior is exercised on a throwaway Express app whose identity layer
 * mirrors authMiddleware (req.user set from a header) so requireRole('ADMIN')
 * gating is tested exactly as routes/admin.js applies it. Lib tests cover the
 * env > DB > default precedence, the 5s (tunable) read cache, and cache
 * invalidation on write — all against the :memory: DB from tests/setup.js.
 */
import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import express from "express"
import { once } from "node:events"

import featuresRouter from "../routes/features.js"
import {
	isFeatureEnabled,
	setFeatureFlag,
	listFeatures,
	EXPOSED_FEATURE_NAMES,
	resolveFeature,
	clearFeatureCaches,
} from "../lib/features.js"
import { upsertFeature } from "../lib/featuresStore.js"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const INTERNAL = new Set(["DISPATCHER_FANOUT", "TIER2_POSTGRES"])

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
	const role = req.headers["x-test-role"]
	if (role) req.user = { username: "tester", role, tenantId: null }
	next()
})
app.use("/api", featuresRouter)

let server
let port

before(async () => {
	server = http.createServer(app)
	server.listen(0)
	await once(server, "listening")
	port = server.address().port
})

after(() => server.close())

async function reqJson(method, path, body, headers = {}) {
	const res = await fetch(`http://localhost:${port}${path}`, {
		method,
		headers: { "content-type": "application/json", ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await res.text()
	let parsed
	try {
		parsed = JSON.parse(text)
	} catch {
		parsed = text
	}
	return { status: res.status, body: parsed }
}

function getExposed() {
	const all = listFeatures()
	return {
		list: all,
		exposed: all.filter((f) => f.exposed),
		get: (name) => all.find((f) => f.name === name),
	}
}

describe("GT /api/features (public-safe allowlist)", () => {
	it("returns only exposed flags — billing/pricing internals never leak", async () => {
		const res = await reqJson("GET", "/api/features")
		assert.equal(res.status, 200)
		assert.ok(Array.isArray(res.body.features))
		for (const f of res.body.features) {
			assert.equal(
				INTERNAL.has(f.name),
				false,
				`leaked internal flag: ${f.name}`,
			)
			assert.ok(
				EXPOSED_FEATURE_NAMES.includes(f.name),
				`unexpected exposed flag: ${f.name}`,
			)
		}
		assert.ok(res.body.features.some((f) => f.name === "OFFLINE_MODE"))
		assert.ok(res.body.features.some((f) => f.name === "PRINT_SPOOL"))
	})

	it("exposed allowlist constants exclude the internal billing/pricing gates", () => {
		for (const name of EXPOSED_FEATURE_NAMES) {
			assert.equal(INTERNAL.has(name), false)
		}
	})

	it("defaults are ON for exposed flags (no env, no DB row)", async () => {
		const res = await reqJson("GET", "/api/features")
		const print = res.body.features.find((f) => f.name === "PRINT_SPOOL")
		assert.equal(print.enabled, true)
		assert.equal(print.source, "default")
		assert.equal(print.default, true)
	})
})

describe("precedence: env > DB > default", () => {
	it("env OFF overrides an exposed default", async () => {
		process.env.DYPOS_FEATURE_OFFLINE_MODE = "0"
		try {
			assert.equal(isFeatureEnabled("OFFLINE_MODE"), false)
			assert.equal(resolveFeature("OFFLINE_MODE", true).source, "env")
		} finally {
			process.env.DYPOS_FEATURE_OFFLINE_MODE = ""
			clearFeatureCaches()
		}
	})

	it("env ON enables an otherwise-unknown flag (name case-insensitive)", async () => {
		process.env.DYPOS_FEATURE_EXPERIMENTAL_FEATURE = "1"
		try {
			assert.equal(isFeatureEnabled("experimental_feature"), true)
			assert.equal(resolveFeature("EXPERIMENTAL_FEATURE", false).source, "env")
		} finally {
			process.env.DYPOS_FEATURE_EXPERIMENTAL_FEATURE = ""
			clearFeatureCaches()
		}
	})

	it("env beats DB even when DB says the opposite", async () => {
		process.env.DYPOS_FEATURE_SMART_SEARCH = "0"
		try {
			const result = setFeatureFlag("SMART_SEARCH", true, "db says on")
			assert.equal(result.enabled, false)
			assert.equal(result.source, "env")
			assert.equal(result.overridden_by_env, true)
			const row = upsertFeature("SMART_SEARCH", 1, "direct store")
			assert.equal(row.enabled, 1)
			assert.equal(isFeatureEnabled("SMART_SEARCH"), false)
		} finally {
			process.env.DYPOS_FEATURE_SMART_SEARCH = ""
			clearFeatureCaches()
		}
	})
})

describe("PUT /api/features/:name (admin-only)", () => {
	it("requires auth (401 without identity)", async () => {
		const res = await reqJson("PUT", "/api/features/print_spool", {
			enabled: false,
		})
		assert.equal(res.status, 401)
	})

	it("rejects non-admin roles (403)", async () => {
		const res = await reqJson(
			"PUT",
			"/api/features/print_spool",
			{ enabled: false },
			{ "x-test-role": "CASHIER" },
		)
		assert.equal(res.status, 403)
	})

	it("ADMIN can flip a flag; cache invalidates and GET reflects it", async () => {
		const res = await reqJson(
			"PUT",
			"/api/features/print_spool",
			{ enabled: false, note: "ops turned off" },
			{ "x-test-role": "ADMIN" },
		)
		assert.equal(res.status, 200)
		assert.equal(res.body.flag, "PRINT_SPOOL")
		assert.equal(res.body.enabled, false)
		assert.equal(res.body.source, "db")

		const after = await reqJson("GET", "/api/features")
		assert.equal(
			after.body.features.find((f) => f.name === "PRINT_SPOOL").enabled,
			false,
		)

		const restore = await reqJson(
			"PUT",
			"/api/features/print_spool",
			{ enabled: true },
			{ "x-test-role": "ADMIN" },
		)
		assert.equal(restore.body.enabled, true)
	})

	it("malformed flag names return 400 (not 500)", async () => {
		const res = await reqJson(
			"PUT",
			`/api/features/${encodeURIComponent("!!!!")}`,
			{ enabled: true },
			{ "x-test-role": "ADMIN" },
		)
		assert.equal(res.status, 400)
	})
})

describe("lib round-trip + read cache", () => {
	it("setFeatureFlag then listFeatures reflects the write immediately (cache invalidated)", () => {
		setFeatureFlag("CUSTOMER_CRM", false, "crm off")
		assert.equal(isFeatureEnabled("customer_crm"), false)
		assert.equal(getExposed().get("CUSTOMER_CRM").enabled, false)
		setFeatureFlag("CUSTOMER_CRM", true, "back on")
		assert.equal(isFeatureEnabled("CUSTOMER_CRM"), true)
	})

	it("reads are cached until TTL — a direct DB write stays invisible, then appears", async () => {
		const prevTtl = process.env.DYPOS_FEATURES_CACHE_TTL_MS
		process.env.DYPOS_FEATURES_CACHE_TTL_MS = "30"
		clearFeatureCaches()
		try {
			assert.equal(isFeatureEnabled("CACHE_PROBE"), false) // unknown → default false
			upsertFeature("CACHE_PROBE", 1, "direct store write") // bypasses lib cache
			assert.equal(
				isFeatureEnabled("CACHE_PROBE"),
				false,
				"cache must hide the direct write while fresh",
			)
			await sleep(120) // > 30ms TTL
			assert.equal(
				isFeatureEnabled("CACHE_PROBE"),
				true,
				"after TTL the DB row is visible",
			)
		} finally {
			if (prevTtl === undefined) process.env.DYPOS_FEATURES_CACHE_TTL_MS = ""
			else process.env.DYPOS_FEATURES_CACHE_TTL_MS = prevTtl
			clearFeatureCaches()
		}
	})

	it("invalid feature flag inputs throw TypeError from the lib", () => {
		assert.throws(() => setFeatureFlag("!!!!", true), TypeError)
		assert.throws(() => setFeatureFlag("OK_FLAG", "banana"), TypeError)
		assert.equal(isFeatureEnabled("###"), false)
	})
})
