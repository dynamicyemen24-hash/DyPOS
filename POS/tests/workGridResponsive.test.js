import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (rel) => readFileSync(join(ROOT, rel), "utf8")

const baseCss = read("src/styles/dypos/base.css")
const grid = read("src/components/work/WorkDataGrid.vue")
const gridBase = read("src/components/work/workDataGrid.base.css")
const responsive = read("src/components/work/workDataGrid.responsive.css")

/**
 * Narrow-screen behaviour of the work data grid.
 *
 * The frozen-pane layout is correct on a desktop: it owns the horizontal axis
 * with `overflow: hidden`. Carried onto a 360px phone the same rule silently
 * cropped every column past the viewport — a data grid that looks fine in a
 * screenshot and shows the cashier three of eight columns at the till. The
 * honest narrow-screen answer is a scrollable table with the key column pinned.
 */
describe("work data grid on narrow screens", () => {
	const narrowBlock = responsive

	it("has a narrow-screen block at the tablet breakpoint", () => {
		expect(narrowBlock.length).toBeGreaterThan(0)
		expect(responsive).toMatch(/@media \(max-width: 1023px\)/)
	})

	it("is imported by the grid so the contract cannot drift from the markup", () => {
		expect(gridBase).toMatch(/@import ["']\.\/workDataGrid\.responsive\.css["']/)
	})

	it("scrolls horizontally instead of cropping the columns", () => {
		// The desktop rule is `overflow: hidden`; the narrow block must override
		// it to `auto`, or the override never wins for the table body.
		expect(narrowBlock).toMatch(/overflow-x:\s*auto/)
	})

	it("contains the horizontal overscroll so it never chains to the page", () => {
		expect(narrowBlock).toMatch(/overscroll-behavior-x:\s*contain/)
	})

	it("drops the frozen panes, which cost width a phone cannot spare", () => {
		expect(narrowBlock).toMatch(/\.work-data-grid__frozen--left,/)
		expect(narrowBlock).toMatch(/display:\s*none/)
	})

	it("collapses the three-pane grid to a single column", () => {
		expect(narrowBlock).toMatch(/grid-template-columns:\s*1fr/)
		expect(narrowBlock).toMatch(/grid-template-areas:\s*"main"/)
	})

	it("pins the first column so the row stays identifiable while scrolling", () => {
		expect(narrowBlock).toMatch(/first-child \{[^}]*position:\s*sticky/)
		// RTL: the pinned edge must follow the writing direction.
		expect(narrowBlock).toMatch(/inset-inline-start:\s*0/)
	})

	it("gives every column a readable minimum so cells do not self-truncate", () => {
		expect(narrowBlock).toMatch(/min-width:\s*120px/)
		expect(narrowBlock).toMatch(/min-width:\s*160px/)
	})

	it("keeps the desktop frozen-pane model intact above the breakpoint", () => {
		// The fix must be scoped: a desktop POS screen is dense on purpose.
		const viewportStart = gridBase.indexOf(".work-data-grid__viewport {")
		const viewportRule = gridBase.slice(
			viewportStart,
			gridBase.indexOf("}", viewportStart),
		)
		expect(viewportRule).toMatch(
			/grid-template-columns:\s*var\(--frozen-left-width/,
		)
		expect(viewportRule).toMatch(/overflow:\s*hidden/)
	})

	it("keeps momentum scrolling on iOS for the scrollable grid", () => {
		expect(gridBase).toMatch(/-webkit-overflow-scrolling:\s*touch/)
	})
})
