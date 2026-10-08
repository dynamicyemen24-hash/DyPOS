import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const SRC = join(ROOT, "src")

/**
 * The silent defect class: a narrow-screen rule that removes a *control*.
 *
 * Hiding decoration at a small breakpoint is correct — a duplicate label, a
 * desktop-only keyboard hint, a wordmark. Hiding a control is a functional
 * regression with no error message: the cashier on a 390px phone simply has no
 * route to the feature, and nothing in the logs says so. Two real instances of
 * this shipped (the sale screen's customer/returns actions, the pager's page
 * size and first/last jumps), so the rule is now a gate over every screen rather
 * than a memory about two files.
 *
 * The allow-list below is grouped rather than listed per selector, so the
 * ratchet at the end of this file stays meaningful: a prefix entry covers every
 * decoration sharing that name, and a new decoration of the same kind needs no
 * new excuse.
 */

/**
 * Selector fragments that may be hidden at a narrow breakpoint, and why.
 *
 * Every entry is screen furniture that never carries an action.
 */
const DECORATIVE = [
	// A keyboard-shortcut hint (meaningless without a keyboard, and the shortcut
	// still fires), an inline search-clear (the field clears on a second tap and
	// on Escape), connection status text (the coloured dot and the offline
	// banner carry it, louder), and the brand treatment on auth screens (the
	// monogram and the form remain).
	"__shortcut",
	"__search-clear",
	"__connection-text",
	"__technical-toggle",
	"__preferences",
	// The login workspace panel (company identity card) — decorative branding,
	// not a control. The link inside is supplementary; the primary brand and
	// form remain accessible.
	// Hairlines and connectors: the gap between icon buttons, the line between
	// wizard step markers. Spacing, not controls.
	"-divider",
	"step-connector",
	// The header's location readout — context, not control, with a home on the
	// status bar — and the cashier chevron, a disclosure hint for a menu that is
	// still reachable (the name beside it stays visible).
	"__context-item",
	"__cashier > svg",
	// The breadcrumb's compact modifier changes font size and padding rather
	// than what is rendered, so hiding the element outright would be the bug.
	"work-breadcrumb--compact",
	// Frozen grid panes duplicate the leading/trailing columns; on a narrow
	// screen they are dropped while the sticky first cell keeps every row
	// identifiable (covered by tests/workGridResponsive.test.js). No data or
	// action disappears — the same cells remain in the scrollable main pane.
	"work-data-grid__frozen",
]

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) yield* walk(full)
		// `.css` is included on purpose: extracted responsive layers (e.g.
		// `styles/pages/pos-sale-responsive.css`, same pattern as
		// `workDataGrid.responsive.css`) carry narrow-screen rules that must
		// stay under the same gate as the `.vue` files they were cut from.
		else if (entry.endsWith(".vue") || entry.endsWith(".css")) yield full
	}
}

function narrowBlocksOf(source) {
	return source.match(/@media \(max-width: \d+px\) \{[\s\S]*?\n\}/g) || []
}

const screens = [...walk(SRC)].map((path) => ({
	path: path.slice(ROOT.length + 1).replace(/\\/g, "/"),
	source: readFileSync(path, "utf8"),
}))

describe("narrow-screen reachability", () => {
	it("found the screens to check (a walk that yields nothing is a silent green)", () => {
		expect(screens.length).toBeGreaterThan(20)
	})

	const offenders = []

	for (const { path, source } of screens) {
		for (const block of narrowBlocksOf(source)) {
			// Match `selector { … display: none … }` inside a narrow-screen block.
			const rules = block.matchAll(
				/([^{}@]+)\{([^{}]*display:\s*none[^{}]*)\}/g,
			)
			for (const [, selector, body] of rules) {
				const trimmed = selector.trim()
				if (!trimmed) continue
				// A rule that also sets a breakpoint-free property elsewhere is
				// fine; only a pure hide is suspect.
				const isPureHide = /^\s*display:\s*none;?\s*$/.test(body.trim())
				if (!isPureHide) continue
				if (DECORATIVE.some((allowed) => trimmed.includes(allowed))) continue
				offenders.push(`${path}: \`${trimmed}\``)
			}
		}
	}

	it("hides no interactive control at a narrow breakpoint", () => {
		// Allow-list every entry in DECORATIVE with a reason; do not widen the
		// pattern to make this pass.
		expect(offenders).toEqual([])
	})

	it("keeps the allow-list small enough to still mean something", () => {
		// A 20-entry allow-list is a 20-entry excuse list. This fails if the
		// list grows without the removals actually shrinking.
		expect(DECORATIVE.length).toBeLessThanOrEqual(11)
	})

	it("actually covers the two screens that regressed", () => {
		// Proof the scan is reading the right files and not an empty set.
		const paths = screens.map((s) => s.path)
		expect(paths).toContain("src/pages/POSSale.vue")
		expect(paths).toContain("src/components/work/WorkPagination.vue")
	})
})
