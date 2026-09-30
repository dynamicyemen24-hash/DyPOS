import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (rel) => readFileSync(join(ROOT, rel), "utf8")

const baseCss = read("src/styles/dypos/base.css")
const componentsCss = read("src/styles/dypos/components.css")

/**
 * Touch-target floor (WCAG 2.5.8 / Apple HIG 44pt).
 *
 * A phone is the primary POS device in this product — the cashier holds it, not
 * a mouse — so an undersized control is not a cosmetic detail: it is a mis-tap
 * that costs money at the till. The rule lives in one stylesheet layer keyed off
 * `pointer: coarse`, so it applies to every control including the ones written
 * tomorrow. These assertions are what keep that layer from quietly rotting while
 * the density tokens (which are correct for a mouse) keep the small sizes.
 */
describe("touch targets", () => {
	const TOUCH_MIN = 44

	it("declares a 44px floor as a token rather than hard-coding it per rule", () => {
		expect(baseCss).toMatch(/--dy-touch-min:\s*44px/)
	})

	it("scopes the floor to touch pointers so desktop density is untouched", () => {
		// `(pointer: coarse)` is what distinguishes a finger from a mouse.
		expect(baseCss).toMatch(/@media \(pointer: coarse\), \(hover: none\)/)
	})

	it("raises every button size to the floor on touch", () => {
		const coarseBlock = baseCss.slice(
			baseCss.indexOf("@media (pointer: coarse)"),
		)
		const buttonRule = coarseBlock.slice(0, coarseBlock.indexOf("}"))

		// Both `height` and `min-height` appear in the density tokens (32/40/48/56).
		// On touch, a pinned `height` clips the label at larger text settings, so
		// the layer must release it and rely on the floor instead.
		expect(buttonRule).toMatch(/height:\s*auto/)
		expect(buttonRule).toMatch(/min-height:\s*var\(--dy-touch-min\)/)
		for (const size of [
			".dy-btn-sm",
			".dy-btn-md",
			".dy-btn-lg",
			".dy-btn-xl",
		]) {
			expect(buttonRule).toContain(size)
		}
	})

	it("covers icon-only, row-shaped and toggle controls, not just buttons", () => {
		const coarseBlock = baseCss.slice(
			baseCss.indexOf("@media (pointer: coarse)"),
		)
		for (const selector of [
			".dy-btn-icon",
			".dy-list-row",
			".dy-nav-item",
			".dy-tab",
			".dy-checkbox",
			".dy-radio",
			".dy-switch",
			".dy-input",
			".dy-select",
			".dy-textarea",
		]) {
			expect(coarseBlock).toContain(selector)
		}
	})

	it("keeps icon-only controls square so a wide button never looks stretched", () => {
		expect(baseCss).toMatch(/\.dy-btn-icon \{[^}]*aspect-ratio:\s*1/)
	})

	it("raises text inputs to 16px so iOS does not zoom the viewport on focus", () => {
		// Below 16px iOS zooms on focus; the classic "the form jumps while I type"
		// defect. `max(1rem, …)` pins the computed size at the threshold.
		expect(baseCss).toMatch(/font-size:\s*max\(1rem,/)
	})

	it("reveals hover-only affordances on touch instead of leaving them dead", () => {
		expect(baseCss).toMatch(/\.dy-hover-reveal \{[^}]*opacity:\s*1/)
	})

	it("keeps the desktop density tokens at their mouse-appropriate sizes", () => {
		// The touch layer must not have crept into the base sizes, which would
		// make a dense desktop POS screen unusable.
		expect(componentsCss).toMatch(/\.dy-btn-sm \{[^}]*min-height:\s*32px/)
		expect(componentsCss).toMatch(/\.dy-btn-md \{[^}]*min-height:\s*40px/)
	})

	it("does not raise the floor above the measured minimum (a ratchet, not a wish)", () => {
		const declared = Number(baseCss.match(/--dy-touch-min:\s*(\d+)px/)?.[1])
		expect(declared).toBe(TOUCH_MIN)
	})
})
