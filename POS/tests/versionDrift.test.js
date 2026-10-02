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
})
