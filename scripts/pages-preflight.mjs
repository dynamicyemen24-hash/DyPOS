/**
 * Cloudflare Pages preflight — decide, before wrangler runs, WHY a deploy
 * would fail. One implementation, runnable by CI, by a human, and by a test.
 *
 * Why this exists: wrangler's first Pages call is a project GET, and Cloudflare
 * answers `Authentication error [code: 10000]` for BOTH
 *   (a) the token lacks `Cloudflare Pages:Edit`, and
 *   (b) the project simply does not exist in the account.
 * A dozen deploys (2026-09-25 → 27) failed on that one ambiguous code, and the
 * old preflight only checked `/user/tokens/verify` — which proves the token is
 * valid, not that it may touch Pages. So the diagnosis could never be settled
 * from outside the pipeline.
 *
 * This script settles it from the inside:
 *   200 + project listed            → ready (exit 0)
 *   200 + project absent             → create it via the API (exit 0)
 *   anything else while the token is valid → Pages:Edit is missing (exit 1)
 *   no/invalid token                → the token itself is the problem (exit 1)
 *
 * Env: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CF_TOKEN / CF_ACCOUNT).
 * Exit codes: 0 ready, 1 blocked (message says which case and the fix).
 */

const SITE_TOKEN_KEY = "CLOUDFLARE_API_TOKEN"
const API = "https://api.cloudflare.com/client/v4"
const PROJECT = "dypos-pos"

const token = process.env.CF_TOKEN || process.env[SITE_TOKEN_KEY] || ""
const account = process.env.CF_ACCOUNT || process.env.CLOUDFLARE_ACCOUNT_ID || ""

function log(message) {
	console.log(message)
}

async function call(path, init = {}) {
	const response = await fetch(`${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	})
	const text = await response.text()
	let body = null
	try {
		body = JSON.parse(text)
	} catch {
		body = null
	}
	return { status: response.status, body, text }
}

function tokenLooksValid() {
	if (!token) return false
	return /^[A-Za-z0-9_-]{20,}$/.test(token.trim())
}

const FIX_PERMISSION = [
	"Fix: Cloudflare → My Profile → API Tokens → Create/Edit Token",
	"  permissions: Account → Cloudflare Pages → Edit",
	"  resources:    this account",
	"  client IP:    leave EMPTY (GitHub runners are never on an IP allowlist)",
	"Then: gh secret set CLOUDFLARE_API_TOKEN   (CLOUDFLARE_ACCOUNT_ID is correct)",
].join("\n")

async function main() {
	if (!account) {
		log("::error::CLOUDFLARE_ACCOUNT_ID is missing — nothing to check.")
		return 1
	}
	if (!tokenLooksValid()) {
		log("::error::CLOUDFLARE_API_TOKEN is missing or malformed.")
		log(FIX_PERMISSION)
		return 1
	}

	const verify = await call("/user/tokens/verify")
	if (verify.status !== 200 || verify.body?.success !== true) {
		log(`::error::Token rejected by /user/tokens/verify (HTTP ${verify.status}).`)
		log(FIX_PERMISSION)
		return 1
	}
	log("Token: valid (this only proves validity, not Pages access).")

	const projects = await call(`/accounts/${account}/pages/projects`)
	if (projects.status === 200 && projects.body?.success === true) {
		const names = (projects.body.result ?? []).map((p) => p?.name)
		if (names.includes(PROJECT)) {
			log(`Pages project "${PROJECT}": present and readable. Deploy can proceed.`)
			return 0
		}
		log(
			`::warning::Pages project "${PROJECT}" does not exist in this account ` +
				`(found: ${names.join(", ") || "none"}). This is the silent half of code 10000 — creating it now.`,
		)
		const created = await call(`/accounts/${account}/pages/projects`, {
			method: "POST",
			body: JSON.stringify({ name: PROJECT, production_branch: "main" }),
		})
		if (created.status >= 200 && created.status < 300) {
			log(`Pages project "${PROJECT}" created. Deploy can proceed.`)
			return 0
		}
		log(
			`::error::Project creation failed (HTTP ${created.status}): ${created.text.slice(0, 300)}`,
		)
		log(FIX_PERMISSION)
		return 1
	}

	log(
		`::error::Token is valid, yet the Pages API refuses it: ` +
			`GET /accounts/***/pages/projects → HTTP ${projects.status}. ` +
			`Response: ${projects.text.slice(0, 300)}`,
	)
	log("Diagnosis: the token lacks 'Cloudflare Pages:Edit' for this account.")
	log(FIX_PERMISSION)
	return 1
}

process.exitCode = await main()
