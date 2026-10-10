/**
 * Version single-source drift gate (frontend side).
 *
 * `server/lib/version.js` declares itself the ONLY place the version is defined
 * and states that "package.json and the frontend build stamp must match" — but
 * nothing enforced the frontend half. This test does: the root app version, the
 * server package, the server lib constant, the frontend package and a built
 * bundle stamp (when one exists) must all agree.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
)

const readJson = (absolutePath) =>
	JSON.parse(readFileSync(absolutePath, "utf8"))

const appVersion = readJson(path.join(REPO_ROOT, "package.json")).version
const serverPackageVersion = readJson(
	path.join(REPO_ROOT, "server", "package.json"),
).version
const frontendPackageVersion = readJson(
	path.join(REPO_ROOT, "POS", "package.json"),
).version
const serverLibSource = readFileSync(
	path.join(REPO_ROOT, "server", "lib", "version.js"),
	"utf8",
)
const serverLibVersion = serverLibSource.match(
	/VERSION\s*=\s*['"]([^'"]+)['"]/,
)?.[1]
const buildStampPath = path.join(
	REPO_ROOT,
	"DyPOS",
	"public",
	"pos",
	"version.json",
)
// A FIFTH declaration: the edge worker reports API_VERSION on
// /api/edge-health, and it is a bare string in worker-api.js with no import
// tying it to the source of truth (Wrangler ships the file standalone). It
// drifted to 1.44.2 while the release was 1.44.3 and only surfaced when the
// server suite asserted body.version === VERSION — i.e. the drift had shipped
// past two "green" suites. Now both sides assert it.
const edgeWorkerSource = readFileSync(
	path.join(REPO_ROOT, "worker-api.js"),
	"utf8",
)
const edgeWorkerVersion = edgeWorkerSource.match(
	/API_VERSION\s*=\s*["']([^"']+)["']/,
)?.[1]

describe("version single source", () => {
	it("server/lib/version.js holds a semver constant", () => {
		expect(serverLibVersion).toMatch(/^\d+\.\d+\.\d+$/)
	})

	it("app, server package and server lib all agree", () => {
		expect(appVersion).toBe(serverLibVersion)
		expect(serverPackageVersion).toBe(serverLibVersion)
	})

	it("the frontend package version tracks the app version", () => {
		expect(frontendPackageVersion).toBe(serverLibVersion)
	})

	it("a built bundle stamp, when present, matches the app version", () => {
		if (!existsSync(buildStampPath)) return
		expect(readJson(buildStampPath).version).toBe(serverLibVersion)
	})

	it("the edge worker's API_VERSION matches the app version", () => {
		expect(edgeWorkerVersion).toBe(serverLibVersion)
	})

	// A lockfile is a build input like any other, and it is the one nobody
	// edits by hand: server/package-lock.json sat at 1.41.2 while its package
	// was at 1.44.x — three releases of drift that no gate could see, because
	// the existing checks all read package.json and never the lock.
	it.each([
		"package-lock.json",
		"POS/package-lock.json",
		"server/package-lock.json",
	])("%s declares the same version as its package", (lockfile) => {
		const lockDir = lockfile.includes("/") ? lockfile.split("/")[0] : "."
		const manifest =
			lockDir === "." ? "package.json" : `${lockDir}/package.json`
		const expected = readJson(path.join(REPO_ROOT, manifest)).version
		const lock = readJson(path.join(REPO_ROOT, lockfile))
		expect(lock.version, `${lockfile} root version`).toBe(expected)
		// lockfileVersion 3 keeps the root entry under packages[""] too.
		if (lock.packages?.[""]) {
			expect(
				lock.packages[""].version,
				`${lockfile} packages[""] version`,
			).toBe(expected)
		}
	})

	/**
	 * The release version belongs to THIS repo and to nothing else in the lock.
	 *
	 * A version bump is usually done as a text replace, and a text replace does
	 * not know which `2.0.8` is ours. In 2.0.9 it also rewrote
	 * `node_modules/proxy-addr` — a transitive Express dependency whose newest
	 * published version is 2.0.8 — to a 2.0.9 npm has never shipped. Nothing
	 * local noticed: every suite was green, because node_modules was already
	 * populated and no test resolves the lock. CI died on `npm ci` with
	 * `ETARGET No matching version found for proxy-addr@2.0.9`, before a single
	 * test ran, on a tree that had passed every gate on the laptop.
	 *
	 * The three root fields above are the ONLY places our version may appear.
	 * A third party that happens to publish the same number will fail here by
	 * name — which is the point: the exception then has to be written down, so
	 * a coincidence can never again be indistinguishable from a corrupted lock.
	 */
	it.each([
		"package-lock.json",
		"POS/package-lock.json",
		"server/package-lock.json",
	])("%s gives the app version to no dependency", (lockfile) => {
		const lock = readJson(path.join(REPO_ROOT, lockfile))
		const claimed = Object.entries(lock.packages ?? {})
			.filter(([key, entry]) => key !== "" && entry?.version === appVersion)
			.map(([key]) => key)

		expect(
			claimed,
			[
				`${lockfile}: these dependency entries carry the app version`,
				`(${appVersion}). A release bump must touch only the root`,
				"fields — a transitive dependency's version is its own, and a",
				"dependency claiming a version npm may never have published",
				"dies in `npm ci` with ETARGET before any test runs.",
			].join(" "),
		).toEqual([])
	})
})
