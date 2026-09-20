/**
 * Adapter contract gates (static analysis — no browser, no network needed).
 *
 * 1) Façade parity: every name `src/adapters/index.js` re-exports MUST exist in
 *    BOTH adapters. Without this gate, switching `VITE_DYPOS_BACKEND` silently
 *    turns exports into `undefined` and the UI dies mid-sale.
 * 2) REST client integrity: every `api.<method>()` used by the REST adapter must
 *    be a method `ApiClient` actually defines. This gate catches calls on a verb
 *    the client never had (the `api.patch()` bug fixed in v1.27.0).
 * 3) Subscriptions endpoint contract: every subscription call in the REST
 *    adapter must map to a route the real server declares in
 *    `server/routes/subscriptions.js` (HTTP verb + normalized path).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ADAPTERS_DIR = path.resolve(HERE, "..", "src", "adapters")

const read = (absolutePath) => readFileSync(absolutePath, "utf8")

const facadeSource = read(path.join(ADAPTERS_DIR, "index.js"))
const restSource = read(path.join(ADAPTERS_DIR, "rest", "api.js"))
const frappeSource = read(path.join(ADAPTERS_DIR, "frappe", "api.js"))
const serverSource = read(
	path.resolve(HERE, "..", "..", "server", "routes", "subscriptions.js"),
)

const PARAM = "@"

/** `:id` in an Express route and `${id}` in a JS template become the same token. */
const canonicalPath = (value) =>
	value.replace(/\$\{[^}]+\}/g, PARAM).replace(/:[A-Za-z0-9_]+/g, PARAM)

function exportedNames(source) {
	const names = new Set()
	const patterns = [
		/export\s+async\s+function\s+([A-Za-z0-9_$]+)/g,
		/export\s+function\s+([A-Za-z0-9_$]+)/g,
		/export\s+const\s+([A-Za-z0-9_$]+)/g,
	]
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) names.add(match[1])
	}
	return names
}

function facadeNames(source) {
	const block = source.match(/export\s+const\s*\{([\s\S]*?)\}\s*=\s*adapter/)
	if (!block)
		throw new Error("facade destructuring block not found in index.js")
	return block[1]
		.split(/[,\s]+/)
		.map((entry) => entry.trim())
		.filter((entry) => /^[A-Za-z0-9_$]+$/.test(entry))
}

function apiClientMethods(source) {
	const block = source.match(/class\s+ApiClient\s*\{([\s\S]*?)\n\}/)
	if (!block) throw new Error("class ApiClient not found in rest/api.js")
	const methods = new Set()
	for (const match of block[1].matchAll(/\n\t([A-Za-z0-9_$]+)\s*\(/g)) {
		methods.add(match[1])
	}
	return methods
}

/** First `api.<verb>(<path>)` inside each adapter function. */
function adapterCalls(source) {
	const calls = new Map()
	const fnPattern =
		/export\s+async\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\n([\s\S]*?)\n\}/g
	for (const match of source.matchAll(fnPattern)) {
		const call = match[2].match(
			/(?<![A-Za-z0-9_$])api\.([A-Za-z0-9_$]+)\(\s*(`[^`]+`|"[^"]+"|'[^']+')/,
		)
		if (call) {
			calls.set(match[1], {
				verb: call[1].toUpperCase(),
				// Query strings are irrelevant to routing: compare path only.
				path: call[2].slice(1, -1).split("?")[0],
			})
		}
	}
	return calls
}

const VERB = {
	get: "GET",
	post: "POST",
	put: "PUT",
	patch: "PATCH",
	del: "DELETE",
}

const SUBSCRIPTION_FNS = [
	"getSubscriptionPlans",
	"createSubscriptionPlan",
	"updateSubscriptionPlan",
	"getSubscriptions",
	"subscribeCustomer",
	"pauseSubscription",
	"resumeSubscription",
	"cancelSubscription",
	"runBilling",
	"getSubscriptionReport",
	"getCustomerBillings",
]

describe("adapter façade parity", () => {
	const names = facadeNames(facadeSource)

	it("the façade exposes the documented single surface", () => {
		expect(names.length).toBeGreaterThanOrEqual(35)
		expect(new Set(names).size).toBe(names.length)
	})

	for (const [label, source] of [
		["rest", restSource],
		["frappe", frappeSource],
	]) {
		it(`${label} adapter exports every façade name`, () => {
			const exported = exportedNames(source)
			expect(names.filter((name) => !exported.has(name))).toEqual([])
		})
	}
})

describe("REST ApiClient method integrity", () => {
	const methods = apiClientMethods(restSource)

	it("defines every HTTP verb the adapter uses", () => {
		expect(methods.has("get")).toBe(true)
		expect(methods.has("post")).toBe(true)
		expect(methods.has("put")).toBe(true)
		expect(methods.has("patch")).toBe(true)
		expect(methods.has("del")).toBe(true)
	})

	it("every api.<method>() call targets a defined method", () => {
		const used = [
			...new Set(
				[
					...restSource.matchAll(
						/(?<![A-Za-z0-9_$])api\.([A-Za-z0-9_$]+)\s*\(/g,
					),
				].map((match) => match[1]),
			),
		]
		expect(used.length).toBeGreaterThan(0)
		expect(used.filter((name) => !methods.has(name))).toEqual([])
	})
})

describe("subscriptions endpoint contract (adapter ↔ server)", () => {
	const declared = new Set(
		[
			...serverSource.matchAll(
				/router\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g,
			),
		].map(([, verb, routePath]) => {
			const mounted =
				routePath === "/" ? "/subscriptions" : `/subscriptions${routePath}`
			return `${verb.toUpperCase()} ${canonicalPath(mounted)}`
		}),
	)
	const calls = adapterCalls(restSource)

	it("the server really declares the subscription routes", () => {
		expect(declared.size).toBeGreaterThanOrEqual(11)
	})

	it("the adapter implements a call for every subscription function", () => {
		expect(SUBSCRIPTION_FNS.filter((name) => !calls.has(name))).toEqual([])
	})

	it("every subscription call maps to a declared server route", () => {
		const unmatched = SUBSCRIPTION_FNS.map((name) => {
			const call = calls.get(name)
			if (!call) return `${name} (no api call found)`
			const verb = VERB[call.verb.toLowerCase()] || call.verb
			const key = `${verb} ${canonicalPath(call.path)}`
			return declared.has(key) ? null : `${name} → ${key}`
		}).filter(Boolean)
		expect(unmatched).toEqual([])
	})
})
