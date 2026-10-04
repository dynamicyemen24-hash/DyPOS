/**
 * S0 — no commercial metering in the live tree.
 *
 * ## What this forbids, and why it is a PRODUCT rule
 *
 * DyPOS is built for small commercial establishments. A shop with four cashiers
 * is not "a bigger plan" — it is the same shop on a busy morning. So a limit
 * expressed as a count of users, branches, invoices or storage is a limit a
 * customer will eventually hit, and the moment one exists the product stops
 * being what it claims to be.
 *
 * `legacy/pos_next` carried `max_users` and `max_tenants` on its tenant
 * document. Those columns never shipped, but the SHAPE can come back quietly —
 * a new schema column, a middleware guard, a config default — and a limit that
 * ships is discovered by a customer, not by CI.
 *
 * ## What it does NOT forbid
 *
 * Real capacity limits that protect correctness rather than revenue:
 * `DYPOS_READ_ONLY`, a request-body size cap, an upload size cap, a page-size
 * clamp. Those are engineering bounds. The distinction is intent: a bound that
 * exists so the product STAYS usable is fine; a bound that exists so a customer
 * BUYS more is not, and the second must not be reachable from config either.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const ROOT = resolve(process.cwd())
const SERVER = join(ROOT, "..", "server")
const POS_SRC = join(ROOT, "src")

function walk(dir, out = []) {
	if (!statSync(dir).isDirectory()) return out
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			if (entry === "node_modules" || entry === "dist") continue
			walk(full, out)
			continue
		}
		if (/\.(js|ts|vue)$/.test(entry)) out.push(full)
	}
	return out
}

const liveFiles = [
	...walk(POS_SRC),
	...walk(join(SERVER, "routes")),
	...walk(join(SERVER, "lib")),
	...walk(join(SERVER, "db")),
	...walk(join(SERVER, "middleware")),
	...walk(join(SERVER, "services")),
]

/** Schema columns and config keys that meter a customer by size. */
const METERING_PATTERNS = [
	["max_users", /\bmax_users\b/],
	["max_tenants", /\bmax_tenants\b/],
	["maxBranches", /\bmax_branches\b|\bmaxBranches\b/],
	["maxSeats", /\bmax_seats\b|\bmaxSeats\b|\bseat_limit\b/],
	["maxInvoices", /\bmax_invoices\b|\bmaxInvoices\b|\binvoice_quota\b/],
	["plan limit", /\bplan_limit\b|\bplanLimit\b|\bsubscription_limit\b/],
]

describe("S0 — no commercial metering in the live tree", () => {
	it("scans a real set of files (an empty scan is a silent green)", () => {
		expect(liveFiles.length).toBeGreaterThan(100)
	})

	it("declares no seat, branch, invoice or plan limit", () => {
		const offenders = []
		for (const file of liveFiles) {
			const code = readFileSync(file, "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/(^|[^:])\/\/.*$/gm, "$1")
			// A named engineering bound: a guard that protects the process from
			// one oversized file. `legacy-invoices.js` takes
			// `{maxInvoices = 20_000}` as a CALL ARGUMENT — the caller chooses
			// the bound, which is the opposite of a limit the customer hits.
			if (/legacy-invoices\.js$/.test(file)) continue
			for (const [label, re] of METERING_PATTERNS) {
				if (re.test(code)) offenders.push(`${relative(ROOT, file)} — ${label}`)
			}
		}
		expect(
			offenders,
			"a limit expressed as a count of users/branches/invoices is a limit a " +
				"shop will hit. DyPOS serves small establishments; metering them " +
				"contradicts the product's own identity (AGENTS.md S0).",
		).toEqual([])
	})

	it("keeps reading the tree it claims to scan", () => {
		// Proof the scan is not vacuous: a file it must have opened. Without
		// this, an empty or mistyped ROOT makes the gate agree over nothing.
		const known = liveFiles.find((f) => /useCartLines\.js$/.test(f))
		expect(known, "useCartLines.js must be in the scanned set").toBeTruthy()
		expect(readFileSync(known, "utf8")).toContain("MAX_LINE_QUANTITY")
	})
})
