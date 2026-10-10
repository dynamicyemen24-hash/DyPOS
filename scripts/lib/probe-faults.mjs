/**
 * One implementation of "what counts as an upstream fault", shared by the
 * live gate (`scripts/verify-live.mjs`) and its test
 * (`server/tests/deploy-diagnostics.test.js`). A detector that only exists
 * inside a script nobody can import is a detector nobody can prove bites.
 *
 * The Cloudflare signature is measured, not invented. On 2026-10-10 the
 * 2.0.9 production origin answered:
 *
 *   GET /api/health      → 403 · text/html · 7936 bytes
 *   GET /api/csrf_token  → 403 · text/html · 7936 bytes (same body)
 *   GET /api/edge-health → 200 · application/json  (served by the Worker itself)
 *   GET /api/ready       → 200 · application/json  (served by the Worker itself)
 *
 * with `<title>Direct IP access not allowed | Cloudflare</title>`. Both the
 * edge and the Express origin speak JSON, so a Cloudflare HTML body on an
 * /api/* probe means a middleman answered instead of either — a
 * misconfigured BACKEND_URL, which invariant 12 makes a deploy failure
 * under BOTH release contracts. The old status-only check (503/500/502 +
 * JSON `code`) let 403 + HTML through as an advisory, so the 15-minute
 * heartbeat stayed green over a cloud tier that could not answer a single
 * login.
 */

/** Cloudflare Error 1003 — the request never reached our edge. */
export const CLOUDFLARE_DIRECT_IP = /Direct IP access not allowed|error code:?\s*1003/i

/** The one fault that must never be softened into an "optional" advisory. */
export const ALWAYS_BLOCKER_CODE = "CLOUDFLARE_REJECTED_UPSTREAM"

/**
 * True only when the body proves a middleman answered. An HTML body without
 * the Error-1003 marker is NOT this fault (some proxies serve custom HTML
 * errors) — it falls through to the caller's ordinary status assertion.
 */
export function isCloudflareHtmlFault(status, body) {
	if (status < 400) return false
	const text = String(body ?? "")
	const looksHtml = /^\s*<(!doctype|html)/i.test(text) || CLOUDFLARE_DIRECT_IP.test(text)
	return looksHtml && CLOUDFLARE_DIRECT_IP.test(text)
}

/**
 * Return a machine code when the response is an upstream fault, else null.
 * `null` means "not an upstream fault" — the caller then asserts on the
 * status as usual, so a genuine 401/403 fail-closed answer is still a pass.
 */
export function isUpstreamFault(status, body) {
	if (isCloudflareHtmlFault(status, body)) return ALWAYS_BLOCKER_CODE
	if (status !== 503 && status !== 500 && status !== 502) return null
	try {
		const parsed = JSON.parse(body)
		if (
			parsed.code === "UPSTREAM_MISCONFIGURED" ||
			parsed.code === "UPSTREAM_UNAVAILABLE" ||
			parsed.code === "DATABASE_UNBOUND"
		) {
			return parsed.code
		}
	} catch {
		/* not JSON */
	}
	return null
}

/**
 * Human-readable one-liner. The Cloudflare branch embeds the machine code so
 * `contractProbe` can escalate it by string match without re-parsing HTML.
 */
export function httpFailure(status, body) {
	const head = `HTTP ${status}`
	if (isCloudflareHtmlFault(status, body)) {
		return `${head} · ${ALWAYS_BLOCKER_CODE} — Cloudflare Error 1003 (Direct IP access): BACKEND_URL does not point at a host Cloudflare forwards`
	}
	try {
		const parsed = JSON.parse(body)
		const named = [parsed.code, parsed.error].filter(Boolean).join(" — ")
		if (named) return `${head} · ${named}`
	} catch {
		// Not JSON — fall through to the raw body, collapsed and truncated.
	}
	return `${head} · ${String(body).replace(/\s+/g, " ").slice(0, 160)}`
}

/**
 * The suffix each contract probe appends after `httpFailure`. When the fault
 * is `CLOUDFLARE_REJECTED_UPSTREAM` the old text ("edge fail-closed, correct
 * behaviour", "upstream missing") would be a lie: the edge did not answer,
 * Cloudflare intercepted the proxy hop. Name the hop that actually failed.
 */
export function upstreamHint(what) {
	return `${what} — the edge did not answer; Cloudflare intercepted the /api/* proxy hop (BACKEND_URL), not an edge fail-closed guard`
}
