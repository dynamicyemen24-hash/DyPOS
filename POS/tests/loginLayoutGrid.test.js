/**
 * The login layout must have ONE grid vocabulary.
 *
 * ## The defect this gate exists for
 *
 * `login.css` declared `grid-template-areas` on the root, then again inside a
 * `@media (min-width: 1101px)` block naming the second column `showcase`, then
 * AGAIN in a second `min-width: 1101px` block naming it `workspace`. Both
 * blocks matched the same screens, so the later one won by source order — and
 * the earlier `grid-area: showcase` it left behind was not rejected by
 * anything. CSS resolves an unknown area name by falling back to
 * AUTO-PLACEMENT, so the workspace column quietly stopped being a column and
 * the page assembled itself from source order instead of from the layout.
 *
 * Nothing caught it: `vite build` succeeded, 2116 unit tests passed, and the
 * page rendered *something* at every width. This is the same class as the
 * `WorkForm.vue` defects AGENTS.md records — a gate that reads text cannot see
 * a name the cascade only resolves at render time.
 *
 * ## Why parse the areas instead of grepping
 *
 * A grep for `grid-template-areas` proves the string exists, not that the
 * names agree or that each is claimed exactly once. So this collects every
 * area name each block declares, then checks every `grid-area:` assignment
 * names an area SOME block declares. That last check is the one that would
 * have failed on `showcase`.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")

/**
 * Strip comments first.
 *
 * These notes quote `grid-template-areas` strings and `grid-area:` names
 * verbatim while explaining that those very declarations were the bug — so a
 * scan that reads comments sees four vocabularies where the CSS has one. A
 * gate that matches its own documentation is a gate people delete.
 */
const css = read("src/styles/pages/login.css")
	.replace(/\/\*[\s\S]*?\*\//g, " ")
	.replace(/<!--[\s\S]*?-->/g, " ")

const loginPage = read("src/pages/Login.vue")

/** Every (breakpoint, area name) any `grid-template-areas` block declares. */
function areaDeclarations() {
	const out = []
	for (const m of css.matchAll(
		/(@media[^{]*\{)?[^{}]*?grid-template-areas\s*:\s*([^;}]+)/g,
	)) {
		const rows = (m[2].match(/"([^"]*)"/g) || []).map((row) =>
			row.replace(/"/g, "").trim(),
		)
		for (const row of rows) {
			for (const cell of row.split(/\s+/)) {
				if (cell && cell !== ".") {
					out.push({ breakpoint: (m[1] || "").trim(), name: cell })
				}
			}
		}
	}
	return out
}

const declared = areaDeclarations()
const declaredNames = new Set(declared.map((d) => d.name))
const assigned = [...css.matchAll(/grid-area\s*:\s*([a-z][a-z-]*)/g)].map(
	(m) => m[1],
)

describe("the login grid has one vocabulary", () => {
	it("the scan is not vacuous", () => {
		// A gate that finds nothing proves nothing. If the stylesheet is ever
		// restructured so these regexes stop matching, this fails instead of
		// silently reporting a clean layout.
		expect(declared.length).toBeGreaterThan(4)
		expect(declaredNames.has("panel")).toBe(true)
		expect(assigned.length).toBeGreaterThan(2)
	})

	it("every grid-area names an area some template declares", () => {
		// THE check. An area name no `grid-template-areas` declares is not an
		// error in CSS — it silently degrades to auto-placement, which is how
		// `showcase` cost this page its workspace column.
		const orphans = [...new Set(assigned)].filter(
			(name) => !declaredNames.has(name),
		)
		expect(orphans).toEqual([])
	})

	it("declares the desktop two-column layout once per direction", () => {
		// Two `min-width: 1101px` blocks used to declare the same grid with
		// different column names, so the answer depended on which block the
		// parser reached last.
		const chrome = new Set(["banner", "status", "brand"])
		const desktop = declared.filter(
			(d) => d.breakpoint.includes("1101px") && !chrome.has(d.name),
		)
		const keys = desktop.map((d) => `${d.breakpoint}|${d.name}`)
		expect(new Set(keys).size).toBe(keys.length)
		expect(declaredNames.has("workspace")).toBe(true)
		expect(declaredNames.has("panel")).toBe(true)
	})

	it("never pins the PAGE to a viewport height with clipping", () => {
		// `height: 100dvh` + `overflow: hidden` put the register link and the
		// footer below an unscrollable fold: a cashier who forgot their
		// password had no way to reach recovery on a short window or a phone
		// in landscape.
		//
		// Scoped to `.dy-login`'s OWN block: `overflow: hidden` is legitimate
		// deeper in the file — the logo shell clips to its rounded square, and
		// the card clips the progress bar to its own radius. A blanket ban on
		// the value would fail the build for those and get deleted.
		const start = css.indexOf(".dy-login {")
		const root = css.slice(start, css.indexOf("}", start))
		expect(root).not.toMatch(/overflow\s*:\s*hidden/)
		expect(root).not.toMatch(/(?<!min-)height\s*:\s*100d?vh/)
	})

	it("keeps the ops panel mounted — an import with no render is dead code", () => {
		// `ShiftOpsPanel` was imported by the page and rendered nowhere, so the
		// whole opening-time surface (shift announcements + the device check)
		// was complete, tested and unreachable.
		expect(loginPage).toContain(
			'import ShiftOpsPanel from "@/components/common/ShiftOpsPanel.vue"',
		)
		expect(loginPage).toMatch(/<ShiftOpsPanel\s*\/>/)
	})

	it("the status bar is a grid row, not a fixed overlay", () => {
		// `position: fixed; bottom: 0` sat on top of the submit button and the
		// register link on a phone, and only appeared once the runtime had
		// something to report.
		const start = css.indexOf(".dy-login__status-bar {")
		const block = css.slice(start, css.indexOf("}", start))
		expect(block).not.toMatch(/position\s*:\s*fixed/)
		expect(block).toMatch(/grid-area\s*:\s*status/)
	})
})
