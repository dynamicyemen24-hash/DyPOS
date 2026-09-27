/**
 * Backend-bridge contract gates (static analysis — no browser, no network).
 *
 * This file used to gate the two-file adapter layer (src/adapters/{rest,method}
 * plus a façade that picked one at runtime). A reachability audit proved that
 * layer unreachable — no entry point, component, store or test imported it —
 * while the sanctioned client `utils/methodClient.js` (AGENTS.md invariant 9)
 * is what the live tree actually calls. The dead layer was deleted, so the gate
 * follows the live client:
 *
 *   1) methodClient.js exports the documented surface its consumers import, and
 *      keeps its provenance contract (`server | local | unavailable`).
 *   2) Its resolution order stays first-party: an injected `window.dypos.call`
 *      host, then the `dypos-ui` kit — never a raw fetch to a third party.
 *   3) The subscriptions routes the server declares are still declared, so the
 *      contract is not silently half-removed with the adapters.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (...parts) =>
	readFileSync(path.resolve(HERE, "..", ...parts), "utf8")

const clientSource = read("src", "utils", "methodClient.js")
const serverSource = read("..", "server", "routes", "subscriptions.js")

const PARAM = "@"

/** `:id` in an Express route and `${id}` in a JS template become the same token. */
const canonicalPath = (value) =>
	value.replace(/\$\{[^}]+\}/g, PARAM).replace(/:[A-Za-z0-9_]+/g, PARAM)

const exportedNames = (source) => {
	const names = new Set()
	for (const m of source.matchAll(
		/export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_$]+)/g,
	)) {
		names.add(m[1])
	}
	return names
}

describe("the live method bridge exports its documented surface", () => {
	const names = exportedNames(clientSource)

	it("exposes call + the list helpers consumers import", () => {
		for (const name of [
			"methodCall",
			"methodGetList",
			"methodGetListWithSource",
			"assertMethodClientAvailable",
		]) {
			expect(names.has(name), `methodClient must export ${name}`).toBe(true)
		}
	})

	it("keeps the provenance contract (never a bare empty list)", () => {
		// An empty list is not a measurement: a report must be able to say
		// server | local | unavailable (AGENTS.md invariant 9).
		expect(clientSource).toMatch(/server\s*\|\s*local\s*\|\s*unavailable/)
		expect(clientSource).toContain("NO_DYPOS_API")
	})

	it("resolves the host first-party only", () => {
		expect(clientSource).toMatch(/window\.dypos/)
		expect(clientSource).toMatch(/dypos-ui/)
		// An absolute URL to anywhere but the product's own origin would take the
		// offline PWA to a third-party host, breaking invariant 8.
		expect(clientSource).not.toMatch(/https?:\/\/(?!dypos\.smartportssoft)/)
	})
})

describe("subscriptions endpoint contract (server side)", () => {
	it("the server still declares the subscription routes", () => {
		const declared = [
			...serverSource.matchAll(
				/router\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g,
			),
		].map(([, verb, routePath]) => {
			const mounted =
				routePath === "/" ? "/subscriptions" : `/subscriptions${routePath}`
			return `${verb.toUpperCase()} ${canonicalPath(mounted)}`
		})
		expect(declared.length).toBeGreaterThanOrEqual(11)
	})
})
