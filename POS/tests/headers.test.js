import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Edge headers contract — the outage this file exists to prevent.
 *
 * A `/*.js` immutable wildcard once matched `/sw.js` at the edge, so devices
 * kept a service worker whose precache URLs no longer existed: install failed
 * (importScripts 404 → HTML fallback), caches stayed empty, and offline boot
 * died on every installed device while every suite stayed green.
 *
 * Rules of this file: `/sw.js` revalidates always; immutable caching applies
 * only to content-hashed paths (`/assets/*`, `/workbox-*.js`).
 */

function parseHeaders() {
	const text = readFileSync(join(__dirname, "..", "public", "_headers"), "utf8")
	const blocks = []
	let current = null
	for (const raw of text.split("\n")) {
		const line = raw.trimEnd()
		if (!line.trim() || line.trim().startsWith("#")) continue
		if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
			current = { path: line.trim(), headers: {} }
			blocks.push(current)
		} else if (current) {
			const [name, ...rest] = line.trim().split(":")
			current.headers[name.trim().toLowerCase()] = rest.join(":").trim()
		}
	}
	return blocks
}

/** True when a Pages placeholder rule can match /sw.js. */
function matchesSw(pattern) {
	if (pattern === "/sw.js") return true
	if (!pattern.includes("*")) return false
	const escaped = pattern
		.split("*")
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*")
	return new RegExp(`^${escaped}$`).test("/sw.js")
}

describe("edge headers contract", () => {
	it("serves /sw.js revalidating, never immutable", () => {
		const blocks = parseHeaders()
		const sw = blocks.find((b) => b.path === "/sw.js")
		expect(sw, "missing /sw.js rule in public/_headers").toBeTruthy()
		const cache = sw.headers["cache-control"] || ""
		expect(cache).toContain("no-cache")
		expect(cache).not.toContain("immutable")
		expect(sw.headers["service-worker-allowed"]).toBe("/")
	})

	it("no wildcard immutable rule can match /sw.js", () => {
		const blocks = parseHeaders()
		const offenders = blocks.filter(
			(b) =>
				b.path !== "/sw.js" &&
				matchesSw(b.path) &&
				(b.headers["cache-control"] || "").includes("immutable"),
		)
		expect(
			offenders.map((b) => b.path),
			"immutable wildcard reaches /sw.js — offline boot will die on update",
		).toEqual([])
	})

	it("keeps immutable caching for hashed bundles and the manifest type", () => {
		const blocks = parseHeaders()
		const byPath = Object.fromEntries(blocks.map((b) => [b.path, b.headers]))
		expect(byPath["/assets/*"]?.["cache-control"] || "").toContain("immutable")
		expect(byPath["/workbox-*.js"]?.["cache-control"] || "").toContain(
			"immutable",
		)
		expect(byPath["/manifest.webmanifest"]?.["content-type"] || "").toContain(
			"manifest",
		)
	})
})
