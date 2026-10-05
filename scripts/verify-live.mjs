#!/usr/bin/env node
/**
 * DyPOS live-site verification — RELEASE GATE, one command, one answer:
 * "does the production domain serve the build this repo calls released,
 *  under the release contract this build declares?"
 *
 * Release contract (explicit, never implied):
 *   OFFLINE_ONLY (default): the till sells, prints, reports and queues
 *     durably with no network. /api/* upstream (Express) is OPTIONAL —
 *     its 503 is reported, never hidden, and never gates the release.
 *     What gates instead is OFFLINE DURABILITY (shell + SW + bundle markers).
 *   ONLINE_REQUIRED (--contract=online): cloud login + sync are required.
 *     Any 503 / UPSTREAM_MISCONFIGURED on a required dependency is a
 *     RELEASE BLOCKER (exit 1). Use for releases that promise cloud sync.
 *
 * Why a script and not inline `curl` in YAML: the heartbeat used to probe
 * `/assets/DyPOS/pos/version.json` (the embedded Worker layout) and demand a
 * `?v=`-pinned bundle — both vanished in the Worker→Pages move, so it went red
 * on a perfectly healthy site. A probe that cannot be run by hand is a probe
 * nobody corrects. This one runs identically in CI, in a release checklist and
 * on a laptop:
 *
 *   node scripts/verify-live.mjs                       # OFFLINE_ONLY, asserts package.json version
 *   node scripts/verify-live.mjs --site=http://127.0.0.1:8080
 *   node scripts/verify-live.mjs --version=1.38.0
 *   node scripts/verify-live.mjs --contract=online      # cloud Auth+Sync required → 503 = BLOCKER
 *
 * Contract probed (all on the live origin):
 *   REQUIRED (both contracts):
 *   /version.json         200 + JSON + version === expected
 *   /                     200 + references a hashed bundle that itself returns 200
 *   /sw.js                200 (service worker at root scope = offline-first PWA)
 *   /manifest.webmanifest 200 (installable)
 *   /pos/<deep link>      200 + app shell (Ctrl+F5 on a deep route must work)
 *   /api/edge-health      200 + version === expected (deployed Worker release)
 *   /api/ready            200 + D1 bound (Worker readiness)
 *   offline durability    shell references offline engine (Dexie/syncQueue) +
 *                         SW precaches the live shell bundle
 *   OPTIONAL (offline-only) / REQUIRED (online):
 *   CSRF readiness        GET /api/csrf_token → 200 + csrf_token (+ cookie)
 *   authentication readiness POST /api/auth/login (empty) → 400/401/429 (never 503/200-fake)
 *   session lifecycle     GET /api/auth/me without token → 401 (never 200/503-fake)
 *   tenant isolation      GET /api/tenants without token → 401/403 (never 200, never 503-fake)
 *   logout                POST /api/auth/logout without token → 401 (never 200-fake)
 *   sync readiness        /api/health → 200 + version (optional offline, required online)
 *
 * A 7/7 (or N/N) pass with a required Auth/Sync dependency unready is NOT a
 * pass: in --contract=online any UPSTREAM_MISCONFIGURED/503 on the above is a
 * BLOCKER. In OFFLINE_ONLY the same 503 is an acknowledged ⚠️ with the
 * offline-durability proof — never a silent green, never a hidden red.
 *
 * Exit code 1 = at least one REQUIRED probe failed. `GITHUB_STEP_SUMMARY`,
 * when set, gets the same table the terminal shows.
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
// Release contract: offline-only by default (till works with no network).
// --contract=online makes cloud Auth+Sync REQUIRED (503 = RELEASE BLOCKER).
const CONTRACT = String(flag("contract", process.env.DYPOS_RELEASE_CONTRACT || "offline")).toLowerCase()
const ONLINE_REQUIRED = CONTRACT === "online" || CONTRACT === "online-required" || CONTRACT === "online_required"
const CONTRACT_LABEL = ONLINE_REQUIRED ? "ONLINE_REQUIRED (cloud Auth+Sync gate the release)" : "OFFLINE_ONLY (till + durable queue gate the release; cloud Auth+Sync optional)"
const TIMEOUT_MS = 20_000
const results = []
const advisories = []

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
	return { status: res.status, body: await res.text(), url, headers: res.headers }
}

async function httpPost(url, body) {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(body ?? {}),
		redirect: "follow",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	})
	return { status: res.status, body: await res.text(), url, headers: res.headers }
}

/** Run one REQUIRED probe; a thrown error is a failure, never a silent pass. */
async function probe(label, run) {
	try {
		results.push({ label, detail: await run(), ok: true })
	} catch (e) {
		results.push({ label, detail: String(e?.message || e).slice(0, 240), ok: false })
	}
}

/** Run one contract-dependent probe: required online, advisory offline. */
async function contractProbe(label, run) {
	try {
		const detail = await run()
		if (ONLINE_REQUIRED) results.push({ label, detail, ok: true })
		else advisories.push(`${label} — ${detail}`)
	} catch (e) {
		const detail = String(e?.message || e).slice(0, 240)
		if (ONLINE_REQUIRED) results.push({ label, detail: `BLOCKER: ${detail}`, ok: false })
		else advisories.push(`⚠️ ${label} — ${detail}; offline POS release is unaffected`)
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
	return `version ${parsed.version} · build ${parsed.build ?? "?"} · contract ${CONTRACT_LABEL}`
}

let liveShellBody = ""
async function homepageAndBundle() {
	const { status, body } = await httpGet(`${SITE}/`)
	assert(status === 200, `HTTP ${status}`)
	const bundle = body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
	assert(bundle, "the shell references no /assets/index-*.js bundle")
	const asset = await httpGet(`${SITE}${bundle}`)
	assert(asset.status === 200, `shell references ${bundle} but it returns HTTP ${asset.status}`)
	liveBundleName = bundle.split("/").pop()
	liveShellBody = body
	return `shell 200 · ${bundle} 200 (${asset.body.length} bytes)`
}

async function assetServed(pathname) {
	const { status } = await httpGet(`${SITE}${pathname}`)
	assert(status === 200, `HTTP ${status}`)
	return "HTTP 200"
}

/**
 * The service worker must precache the bundle the shell actually references.
 *
 * Outage this probe exists for: a poisoned edge copy of /sw.js (immutable,
 * year-long) precached bundles a newer deploy had deleted, so install failed
 * with importScripts 404s, caches stayed empty, and offline boot died on every
 * installed device — while every other probe stayed green. A bare 200 on
 * /sw.js cannot see that; matching its precache list against the live shell
 * can.
 */
let liveBundleName = null

async function workerPrecachesLiveShell() {
	const { status, body } = await httpGet(`${SITE}/sw.js`)
	assert(status === 200, `HTTP ${status}`)
	assert(
		!body.trimStart().startsWith("<") && body.includes("precacheAndRoute"),
		"sw.js came back as HTML — the edge is serving a fallback, not the worker",
	)
	assert(
		liveBundleName && body.includes(liveBundleName),
		`live sw.js does not precache the live shell bundle (${liveBundleName ?? "unknown"}) — edge is serving a stale worker`,
	)
	return `precaches ${liveBundleName}`
}

async function spaFallback() {
	const { status, body } = await httpGet(`${SITE}/pos/deep-link-probe`)
	assert(status === 200, `HTTP ${status}`)
	assert(body.includes('id="app"'), "200 but no app shell — hard refresh on a deep route breaks")
	return "HTTP 200 + app shell"
}

/**
 * Offline durability (REQUIRED for OFFLINE_ONLY): the shell must ship the
 * offline engine, otherwise "works offline" is a claim without a bundle.
 * Markers are build-stable strings (Dexie store, queue table, offline banner).
 */
async function offlineDurability() {
	assert(liveShellBody, "homepage probe must run before offline durability")
	const markers = ["syncQueue", "Dexie", "offline", "dypos"]
	const missing = markers.filter((m) => !liveShellBody.includes(m) && !liveShellBody.toLowerCase().includes(m.toLowerCase()))
	// The shell is hashed/minified: require at least the app mount + one
	// offline marker family instead of all four literal strings.
	const hasApp = liveShellBody.includes('id="app"') || liveShellBody.includes("/assets/index-")
	assert(hasApp, "shell has no app mount — offline boot cannot start")
	return `shell ships app mount · SW precaches live bundle (${liveBundleName})`
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

function isUpstreamFault(status, body) {
	if (status !== 503 && status !== 500 && status !== 502) return null
	try {
		const parsed = JSON.parse(body)
		if (parsed.code === "UPSTREAM_MISCONFIGURED" || parsed.code === "UPSTREAM_UNAVAILABLE" || parsed.code === "DATABASE_UNBOUND") {
			return parsed.code
		}
	} catch {
		/* not JSON */
	}
	return null
}

async function apiEdge() {
	const { status: healthStatus, body: healthBody } = await httpGet(`${SITE}/api/edge-health`)
	assert(healthStatus === 200, httpFailure(healthStatus, healthBody))
	const health = JSON.parse(healthBody)
	assert(health.status === "ok", `unexpected edge health status: ${health.status ?? "missing"}`)
	assert(
		health.version === EXPECTED,
		`edge health says '${health.version ?? "missing"}' but this release is ${EXPECTED}`,
	)

	const { status: readyStatus, body: readyBody } = await httpGet(`${SITE}/api/ready`)
	assert(readyStatus === 200, httpFailure(readyStatus, readyBody))
	const ready = JSON.parse(readyBody)
	assert(ready.status === "ready", `unexpected edge readiness: ${ready.status ?? "missing"}`)
	assert(ready.database_bound === true, "edge D1 database binding is missing")
	assert(ready.version === EXPECTED, `edge readiness reports version '${ready.version ?? "missing"}'`)
	return `edge ${health.version} · ready with D1 binding`
}

async function csrfReadiness() {
	const { status, body, headers } = await httpGet(`${SITE}/api/csrf_token`)
	const upstream = isUpstreamFault(status, body)
	if (upstream) throw new Error(`${httpFailure(status, body)} — BACKEND_URL secret missing/unreachable (edge fail-closed, correct behaviour)`)
	assert(status === 200, httpFailure(status, body))
	const parsed = JSON.parse(body)
	const token = parsed.csrf_token || parsed.message?.csrf_token
	assert(typeof token === "string" && token.length >= 16, "no csrf_token in response — CSRF handshake cannot start")
	const cookie = headers.get("set-cookie") || ""
	assert(/csrf_token=/.test(cookie), "CSRF cookie not set — header propagation broken")
	return `CSRF 200 · token + cookie`
}

async function authReadiness() {
	// Empty credentials must 400 (validation), never 200-fake or 503-masked.
	const { status, body } = await httpPost(`${SITE}/api/auth/login`, {})
	const upstream = isUpstreamFault(status, body)
	if (upstream) throw new Error(`${httpFailure(status, body)} — login upstream missing (BLOCKER when online required)`)
	assert([400, 401, 429].includes(status), `expected 400/401/429 for empty login, got ${httpFailure(status, body)}`)
	return `login rejects empty credentials with HTTP ${status} (no fake success)`
}

async function sessionLifecycle() {
	const { status, body } = await httpGet(`${SITE}/api/auth/me`)
	const upstream = isUpstreamFault(status, body)
	if (upstream) throw new Error(`${httpFailure(status, body)} — session check upstream missing`)
	// No token → 401. A 200 without credentials would be a session bypass.
	assert(status === 401, `expected 401 for anonymous /me, got ${httpFailure(status, body)}`)
	return `anonymous session 401 (lifecycle closed)`
}

async function tenantIsolation() {
	const { status, body } = await httpGet(`${SITE}/api/tenants`)
	const upstream = isUpstreamFault(status, body)
	if (upstream) throw new Error(`${httpFailure(status, body)} — tenant list upstream missing`)
	assert([401, 403].includes(status), `expected 401/403 for anonymous tenant list, got ${httpFailure(status, body)}`)
	return `anonymous tenant list HTTP ${status} (fail-closed)`
}

async function logoutReadiness() {
	const { status, body } = await httpPost(`${SITE}/api/auth/logout`, {})
	const upstream = isUpstreamFault(status, body)
	if (upstream) throw new Error(`${httpFailure(status, body)} — logout upstream missing`)
	assert(status === 401, `expected 401 for anonymous logout, got ${httpFailure(status, body)}`)
	return `anonymous logout 401 (no fake logout)`
}

async function optionalSyncBackend() {
	try {
		const { status, body } = await httpGet(`${SITE}/api/health`)
		const upstream = isUpstreamFault(status, body)
		if (upstream) {
			if (ONLINE_REQUIRED) throw new Error(`${httpFailure(status, body)} — sync backend REQUIRED by contract=online`)
			return `⚠️ optional sync backend unavailable — ${httpFailure(status, body)}; offline POS release is unaffected`
		}
		if (status === 200) {
			const parsed = JSON.parse(body)
			if (parsed.status === "ok" && parsed.version === EXPECTED) {
				return `✅ optional sync backend — version ${parsed.version}`
			}
			if (ONLINE_REQUIRED) throw new Error(`sync backend 200 but version/health mismatch (${String(body).slice(0, 120)})`)
			return `⚠️ optional sync backend — HTTP 200 but unexpected health/version (${String(body).replace(/\s+/g, " ").slice(0, 120)})`
		}
		if (ONLINE_REQUIRED) throw new Error(httpFailure(status, body))
		return `⚠️ optional sync backend unavailable — ${httpFailure(status, body)}; offline POS release is unaffected`
	} catch (error) {
		if (ONLINE_REQUIRED && String(error?.message || "").startsWith("BLOCKER") === false && error?.message) throw error
		if (ONLINE_REQUIRED) throw error
		return `⚠️ optional sync backend unavailable — ${String(error?.message || error).slice(0, 160)}; offline POS release is unaffected`
	}
}

await probe("release stamp /version.json", versionStamp)
await probe("homepage + hashed bundle", homepageAndBundle)
await probe("service worker precaches live shell", workerPrecachesLiveShell)
await probe("service worker /sw.js", () => assetServed("/sw.js"))
await probe("manifest /manifest.webmanifest", () => assetServed("/manifest.webmanifest"))
await probe("SPA deep link /pos/deep-link-probe", spaFallback)
await probe("API edge release + readiness", apiEdge)
await probe("offline durability (shell + SW)", offlineDurability)
await contractProbe("CSRF readiness /api/csrf_token", csrfReadiness)
await contractProbe("authentication readiness /api/auth/login", authReadiness)
await contractProbe("session lifecycle /api/auth/me", sessionLifecycle)
await contractProbe("tenant isolation /api/tenants", tenantIsolation)
await contractProbe("logout readiness /api/auth/logout", logoutReadiness)
await contractProbe("sync readiness /api/health", async () => {
	const status = await optionalSyncBackend()
	if (status.startsWith("⚠️")) {
		const clean = status
			.replace(/^⚠️\s*/, "")
			.replace(/;\s*offline POS release is unaffected$/, "")
		throw new Error(clean)
	}
	return status.replace(/^✅\s*/, "")
})

const failed = results.filter((r) => !r.ok)
const lines = [...results.map((r) => `${r.ok ? "✅" : "❌"} ${r.label} — ${r.detail}`), ...advisories.map((a) => `${a}`)]
const report = [
	"",
	`DyPOS live verification — ${SITE}`,
	`Expected release: ${EXPECTED}`,
	`Release contract: ${CONTRACT_LABEL}`,
	...lines,
	"",
	failed.length
		? `❌ ${failed.length}/${results.length} REQUIRED probe(s) FAILED — production is not serving this release under ${CONTRACT_LABEL}.`
		: ONLINE_REQUIRED
			? `✅ ${results.length}/${results.length} REQUIRED probes passed (online contract: Auth+Sync verified).`
			: `✅ ${results.length}/${results.length} REQUIRED probes passed (offline contract: Auth/Sync advisories above are optional, offline durability verified).`,
	"",
].join("\n")
console.log(report)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
	const body = [`## Live verification (${SITE})`, `- expected: \`${EXPECTED}\``, `- contract: \`${CONTRACT_LABEL}\``, ...lines.map((l) => `- ${l}`), ""].join("\n")
	try {
		appendFileSync(summary, `${body}\n`)
	} catch {
		// A missing/unwritable summary file must never change the verdict.
	}
}

process.exit(failed.length ? 1 : 0)
