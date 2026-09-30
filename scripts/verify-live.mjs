#!/usr/bin/env node
/**
 * DyPOS live-site verification — one command, one answer:
 * "does the production domain serve the build this repo calls released?"
 *
 * Why a script and not inline `curl` in YAML: the heartbeat used to probe
 * `/assets/DyPOS/pos/version.json` (the embedded Worker layout) and demand a
 * `?v=`-pinned bundle — both vanished in the Worker→Pages move, so it went red
 * on a perfectly healthy site. A probe that cannot be run by hand is a probe
 * nobody corrects. This one runs identically in CI, in a release checklist and
 * on a laptop:
 *
 *   node scripts/verify-live.mjs                       # asserts package.json version
 *   node scripts/verify-live.mjs --site=http://127.0.0.1:8080
 *   node scripts/verify-live.mjs --version=1.38.0
 *
 * Contract probed (all on the live origin):
 *   /version.json         200 + JSON + version === expected
 *   /                     200 + references a hashed bundle that itself returns 200
 *   /sw.js                200 (service worker at root scope = offline-first PWA)
 *   /manifest.webmanifest 200 (installable)
 *   /pos/<deep link>      200 + app shell (Ctrl+F5 on a deep route must work)
 *   /api/health           200 + version === expected (frontend/API release parity)
 *
 * Exit code 1 = at least one probe failed. `GITHUB_STEP_SUMMARY`, when set, gets
 * the same table the terminal shows.
 */
import { appendFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const flag = (name, fallback) => {
	const hit = process.argv
		.slice(2)
		.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
	if (!hit) return fallback
	const value = hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : ""
	return value || fallback
}

const SITE = flag("site", "https://dypos.smartportssoft.com").replace(/\/+$/, "")
const EXPECTED = flag(
	"version",
	JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version,
)
const TIMEOUT_MS = 20_000
const results = []

const fail = (message) => {
	throw new Error(message)
}
const assert = (cond, message) => {
	if (!cond) fail(message)
}

async function httpGet(url) {
	const res = await fetch(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	})
	return { status: res.status, body: await res.text(), url }
}

/** Run one probe; a thrown error is a failure, never a silent pass. */
async function probe(label, run) {
	try {
		results.push({ label, detail: await run(), ok: true })
	} catch (e) {
		results.push({ label, detail: String(e?.message || e).slice(0, 240), ok: false })
	}
}

async function versionStamp() {
	const { status, body } = await httpGet(`${SITE}/version.json`)
	assert(status === 200, `HTTP ${status}`)
	const parsed = JSON.parse(body)
	assert(
		parsed.version === EXPECTED,
		`version.json says '${parsed.version}' but this release is ${EXPECTED} — customers are NOT on the current build`,
	)
	return `version ${parsed.version} · build ${parsed.build ?? "?"}`
}

async function homepageAndBundle() {
	const { status, body } = await httpGet(`${SITE}/`)
	assert(status === 200, `HTTP ${status}`)
	const bundle = body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
	assert(bundle, "the shell references no /assets/index-*.js bundle")
	const asset = await httpGet(`${SITE}${bundle}`)
	assert(asset.status === 200, `shell references ${bundle} but it returns HTTP ${asset.status}`)
	return `shell 200 · ${bundle} 200 (${asset.body.length} bytes)`
}

async function assetServed(pathname) {
	const { status } = await httpGet(`${SITE}${pathname}`)
	assert(status === 200, `HTTP ${status}`)
	return "HTTP 200"
}

async function spaFallback() {
	const { status, body } = await httpGet(`${SITE}/pos/deep-link-probe`)
	assert(status === 200, `HTTP ${status}`)
	assert(body.includes('id="app"'), "200 but no app shell — hard refresh on a deep route breaks")
	return "HTTP 200 + app shell"
}

/**
 * A bare "HTTP 503" sends the operator back to curl by hand, and this probe is
 * read unattended by the 15-minute heartbeat. The edge already answers with a
 * machine-readable `code` (UPSTREAM_MISCONFIGURED, DATABASE_UNBOUND, …) and an
 * Arabic `error`, so name the fault instead of just the number.
 */
function httpFailure(status, body) {
	const head = `HTTP ${status}`
	try {
		const parsed = JSON.parse(body)
		const named = [parsed.code, parsed.error].filter(Boolean).join(" — ")
		if (named) return `${head} · ${named}`
	} catch {
		// Not JSON — fall through to the raw body, collapsed and truncated.
	}
	return `${head} · ${String(body).replace(/\s+/g, " ").slice(0, 160)}`
}

async function apiPing() {
	const { status, body } = await httpGet(`${SITE}/api/health`)
	assert(status === 200, httpFailure(status, body))
	const parsed = JSON.parse(body)
	assert(parsed.status === "ok", `unexpected health status: ${parsed.status ?? "missing"}`)
	assert(
		parsed.version === EXPECTED,
		`API health says '${parsed.version ?? "missing"}' but this release is ${EXPECTED} — frontend and API are out of sync`,
	)
	return `version ${parsed.version} · ${body.replace(/\s+/g, " ").slice(0, 120)}`
}

await probe("release stamp /version.json", versionStamp)
await probe("homepage + hashed bundle", homepageAndBundle)
await probe("service worker /sw.js", () => assetServed("/sw.js"))
await probe("manifest /manifest.webmanifest", () => assetServed("/manifest.webmanifest"))
await probe("SPA deep link /pos/deep-link-probe", spaFallback)
await probe("API /api/health", apiPing)

const failed = results.filter((r) => !r.ok)
const lines = results.map((r) => `${r.ok ? "✅" : "❌"} ${r.label} — ${r.detail}`)
const report = [
	"",
	`DyPOS live verification — ${SITE}`,
	`Expected release: ${EXPECTED}`,
	...lines,
	"",
	failed.length
		? `❌ ${failed.length}/${results.length} probe(s) FAILED — production is not serving this release.`
		: `✅ ${results.length}/${results.length} probes passed.`,
	"",
].join("\n")
console.log(report)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
	const body = [`## Live verification (${SITE})`, `- expected: \`${EXPECTED}\``, ...lines.map((l) => `- ${l}`), ""].join("\n")
	try {
		appendFileSync(summary, `${body}\n`)
	} catch {
		// A missing/unwritable summary file must never change the verdict.
	}
}

process.exit(failed.length ? 1 : 0)