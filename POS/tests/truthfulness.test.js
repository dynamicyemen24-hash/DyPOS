/**
 * Truthfulness gate — no static, fake, or placeholder data in SHIPPED code.
 *
 * ## Why this gate exists
 *
 * The constitution demands honesty (invariant 9: "an empty list is not a
 * measurement"; invariant 8: nothing is gated on a server). Neither can be
 * enforced by inspection, because the failure mode is *plausible-looking*:
 *
 *   const STATS = { revenue: 125000, orders: 342 }
 *
 * Every number on a shop dashboard comes from somewhere. If it comes from a
 * literal, a fallback constant, or a `.catch(() => 0)`, then a manager reorders
 * stock on invented figures — exactly the failure the 1.4x report rewrite
 * removed from `catch(() => [])` and left open everywhere else.
 *
 * ## What it forbids, in `src/` (shipped) and server runtime dirs
 *
 *   1. Demo/fake/mock data literals — `fakeData`, `MOCK_PRODUCTS`, `demoItems`.
 *   2. Fabricated fallback numbers — a catch that answers a *report* with
 *      `0` or `[]`. Legitimate fallbacks (memo cache, optional Redis, a schema
 *      probe) are allowed: those are not a MEASUREMENT.
 *   3. Unreachable "coming soon" branches that pretend to work — the
 *      `this.$root` class found in 1.44.7.
 *
 * ## What it deliberately does NOT forbid
 *
 *   - Real business constants: VAT rates, currency decimals, page sizes, retail
 *     barcode formats, permission tables. Those are SPEC, not data.
 *   - Tests, fixtures, seeds, and `legacy/` — a fake row in a test is the point
 *     of a test. This file walks only shipped/runtime roots.
 *   - UI `placeholder` attributes and empty-state copy. A placeholder is a hint;
 *     a fake total is a measurement.
 */
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const ROOT = resolve(process.cwd())
const POS_SRC = join(ROOT, "src")
const SERVER = join(ROOT, "..", "server")

/**
 * Reviewed exceptions: `"<relpath>" -> reason`. Empty today — an earlier round
 * left a commented entry behind, which is how an escape hatch becomes a hiding
 * place. The test below requires every entry to name a real, existing file with
 * a specific reason.
 */
const ALLOWED_SURFACES = Object.create(null)

function walk(dir, out = []) {
	if (!existsSync(dir)) return out
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			if (
				["node_modules", "dist", "dev-dist", "uploads", ".git"].includes(entry)
			)
				continue
			walk(full, out)
			continue
		}
		if (/\.(js|ts|vue|mjs)$/.test(entry)) out.push(full)
	}
	return out
}

/** Comments explain what the code MEANT to do; they are not the code. */
function stripComments(src) {
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const shippedFiles = [
	...walk(POS_SRC),
	// Server runtime only: routes, lib, db, middleware, services. Not scripts.
	...walk(join(SERVER, "routes")),
	...walk(join(SERVER, "lib")),
	...walk(join(SERVER, "db")),
	...walk(join(SERVER, "middleware")),
	...walk(join(SERVER, "services")),
]

/**
 * Rules over comment-stripped shipped code.
 *
 * The typed-figure rule's shape was arrived at by two FALSE POSITIVES it
 * produced on its first run — both worth recording, because they are what a
 * naive gate looks like:
 *   - `getCustomerBalance(id) {` — a function NAME containing the word.
 *   - `out.push({ revenue: 0 })` — an ACCUMULATOR's zero seed, i.e. the start
 *     of a real sum, not a fabricated total.
 * So the value must be a LITERAL assigned to a bare `=`/`,`/`return`, with no
 * identifier on the left to accumulate into.
 */
const FAKE_DATA_RE =
	/\b(?:fakeData|mockData|dummyData|sampleData|demoData|MOCK_[A-Z_]+|FAKE_[A-Z_]+|DEMO_[A-Z_]+|mockProducts|mockInvoices|mockUsers|demoItems|demoProducts)\b/

const TYPED_FIGURE_RE =
	/(?:^|[{,;]\s*|\breturn\s+)\s*(?:revenue|total_sales|net_sales|gross_sales|profit|balance|amount_paid|amount_due)\s*=\s*(?:-?\d[\d_]*(?:\.\d+)?|"[\d.]+")/im

/**
 * A catch that answers a data question with "nothing" or "zero".
 *
 * Scanning for the literal `0` is useless (most zeros are legitimate), so it is
 * caught by its SHAPE. The permitted form is a cache miss (`.catch(() => null)`
 * reading a memoised resource) — that returns "not cached", not "zero".
 */
const SWALLOWED_MEASUREMENT_RES = [
	/\.catch\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/,
	/\.catch\(\s*\(\s*\)\s*=>\s*(?:0|\{[^}]*length:\s*0\})\s*\)/,
	/catch\s*\{\s*\}[^}]*?return\s+(?:0|\[\])/,
]

/**
 * Modules that carry the forbidden shape ON PURPOSE, to describe it. Each is a
 * proven implementation of the rule, not a violation of it:
 *   - `localMirror` / `useDashboardSource`: the offline provenance layer.
 *     Asserted behaviourally by `dashboardsOffline.test.js`.
 *   - `device-catalog`: merges two SOURCES, where "this source is unavailable"
 *     is not "the shop has nothing". Its COUNT now returns `complete` instead
 *     of presenting a zero as a measurement.
 */
const SHAPE_CARRIERS =
	/localMirror\.js|useDashboardSource\.js|device-catalog\.js/
describe("truthfulness — shipped code carries no fabricated data", () => {
	it("walks a non-empty set of shipped files (a gate over nothing is green)", () => {
		expect(shippedFiles.length).toBeGreaterThan(100)
	})

	it("declares no demo/mock/fake-data literal", () => {
		const offenders = []
		for (const file of shippedFiles) {
			const code = stripComments(readFileSync(file, "utf8"))
			if (FAKE_DATA_RE.test(code) || TYPED_FIGURE_RE.test(code))
				offenders.push(relative(ROOT, file))
		}
		expect(offenders, offenders.join("\n")).toEqual([])
	})

	it("keeps the escape hatch empty and justified", () => {
		for (const [path, reason] of Object.entries(ALLOWED_SURFACES)) {
			expect(typeof reason, `${path} needs a written reason`).toBe("string")
			expect(reason.length, `${path} reason must be specific`).toBeGreaterThan(
				20,
			)
			expect(existsSync(join(ROOT, path)), `${path} does not exist`).toBe(true)
		}
	})
})

describe("truthfulness — a failure is never a measurement", () => {
	it("never answers a fetch failure with an empty list or a zero", () => {
		const offenders = []
		for (const file of shippedFiles) {
			if (SHAPE_CARRIERS.test(file)) continue
			const code = stripComments(readFileSync(file, "utf8"))
			if (SWALLOWED_MEASUREMENT_RES.some((re) => re.test(code)))
				offenders.push(relative(ROOT, file))
		}
		expect(offenders, offenders.join("\n")).toEqual([])
	})
})

describe("truthfulness — no unreachable feature that pretends to work", () => {
	/**
	 * The 1.44.7 class: a handler that renders, compiles, ships, and throws the
	 * moment a human uses it. `this` inside `<script setup>` is the proven
	 * instance — there is no component instance in scope, so `this.$root` is a
	 * guaranteed `TypeError`.
	 */
	it("never reads `this` inside a <script setup> block", () => {
		const offenders = []
		for (const file of shippedFiles.filter((f) => f.endsWith(".vue"))) {
			const src = readFileSync(file, "utf8")
			const script = src.match(/<script setup>([\s\S]*?)<\/script>/)
			if (!script) continue
			if (/(?:^|[;{}])\s*this\s*\./m.test(stripComments(script[1])))
				offenders.push(relative(ROOT, file))
		}
		expect(offenders, offenders.join("\n")).toEqual([])
	})
})

/**
 * A gate that has never fired is indistinguishable from a gate that cannot fire.
 * These assert the DETECTORS against source that MUST be caught — the same
 * discipline `designTokens.test.js` applies to its own `grid-area` check, and
 * the reason the two false positives were fixed rather than allow-listed.
 */
describe("truthfulness — the gate itself is proven to bite", () => {
	const mustCatch = [
		["a fake row list", "export const demoItems = [{ id: 1 }]", FAKE_DATA_RE],
		["an uppercase mock table", "const MOCK_PRODUCTS = []", FAKE_DATA_RE],
		[
			"a typed revenue figure",
			"const stats = { revenue = 125000 }",
			TYPED_FIGURE_RE,
		],
	]

	it.each(mustCatch)("catches %s", (_label, source, re) => {
		expect(re.test(source)).toBe(true)
	})

	const mustNotCatch = [
		[
			"a function named for a balance",
			"export async function getCustomerBalance(id) {",
			TYPED_FIGURE_RE,
		],
		[
			"an accumulator seeded at zero",
			"out.push({ revenue: 0 })",
			TYPED_FIGURE_RE,
		],
		["an ordinary call", "const rows = await list()", FAKE_DATA_RE],
	]

	it.each(mustNotCatch)("does not flag %s", (_label, source, re) => {
		expect(re.test(source)).toBe(false)
	})

	it("catches a swallowed measurement", () => {
		const bad = "await getList().catch(() => [])"
		expect(SWALLOWED_MEASUREMENT_RES[0].test(bad)).toBe(true)
	})
})
