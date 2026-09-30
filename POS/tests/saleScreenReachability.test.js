import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (rel) => readFileSync(join(ROOT, rel), "utf8")

const sale = `${read("src/pages/POSSale.vue")}\n${read("src/styles/pages/pos-sale-responsive.css")}`

/**
 * The sale screen is the screen the whole product lives on, and a phone is a
 * primary POS device here. The most expensive defect class on that screen is a
 * *silent* one: a rule that hides a control at a narrow breakpoint, leaving the
 * cashier no route to a feature they need mid-sale and no error to notice.
 *
 * `display: none` inside a `@media` block is therefore only legitimate for
 * decoration (a keyboard-shortcut hint, a duplicate label). Anything that
 * carries an action, a value, or a navigation path must stay reachable at every
 * width — reflowed, if necessary, but never removed.
 */
describe("sale screen — nothing a cashier needs disappears on a phone", () => {
	const narrowBlocks =
		sale.match(/@media \(max-width: \d+px\) \{[\s\S]*?\n\}/g) || []

	it("has narrow-screen rules to reason about (the assertions below are vacuous otherwise)", () => {
		expect(narrowBlocks.length).toBeGreaterThan(0)
	})

	it("never hides the catalog actions, which carry customer and returns", () => {
		// `.dy-pos-sale__catalog-actions` was `display: none` under 420px. Two
		// real actions — pick a customer, open a returns flow — became impossible
		// on a 390px phone, with no error and no alternative route.
		const rules =
			sale.match(/\.dy-pos-sale__catalog-actions\s*\{[^}]*\}/g) || []
		expect(rules.length).toBeGreaterThan(0)
		for (const rule of rules) {
			expect(rule).not.toMatch(/display:\s*none/)
		}
	})

	it("keeps the catalog actions on their own full-width line on a phone", () => {
		// `flex: 1 0 100%` is what asks the wrapping toolbar for a dedicated
		// row. Without it the buttons share a squeezed first row.
		const narrow = sale.slice(sale.indexOf("@media (max-width: 420px)"))
		expect(narrow).toMatch(
			/\.dy-pos-sale__catalog-actions\s*\{[^}]*flex:\s*1 0 100%/,
		)
	})

	it("gives the catalog actions a thumb-sized hit area on a phone", () => {
		const narrow = sale.slice(sale.indexOf("@media (max-width: 420px)"))
		expect(narrow).toMatch(
			/\.dy-pos-sale__catalog-actions > \*\s*\{[^}]*min-height:\s*var\(--dy-touch-min/,
		)
	})

	it("hides only decoration at the narrow breakpoint, never an action", () => {
		// The two remaining narrow-screen `display: none` rules are the keyboard
		// shortcut hint and the search clear affordance. Both are duplicated
		// elsewhere, so losing them costs nothing.
		const narrow = sale.slice(sale.indexOf("@media (max-width: 420px)"))
		const hidden = [...narrow.matchAll(/([\w-]+)\s*\{\s*display:\s*none/g)].map(
			(m) => m[1],
		)
		expect(hidden.length).toBeGreaterThan(0)
		for (const selector of hidden) {
			expect(selector).not.toContain("action")
			expect(selector).not.toContain("button")
		}
	})

	it("keeps the customer and returns controls labelled for a screen reader", () => {
		// The buttons are icon-only; without an accessible name a cashier using
		// a screen reader hears nothing.
		expect(sale).toMatch(/aria-label="[^"]*"/)
		const actionsBlock = sale.slice(
			sale.indexOf('class="dy-pos-sale__catalog-actions"'),
		)
		expect(actionsBlock).toMatch(/aria-label/)
		expect(actionsBlock).toMatch(/showCustomerPanel/)
		expect(actionsBlock).toMatch(/openReturns/)
	})

	it("declares a touch floor for the sale screen instead of hard-coding one", () => {
		// A literal 44px here would drift from the design token; the fallback
		// keeps the screen usable if the token layer is ever removed.
		expect(sale).toMatch(/var\(--dy-touch-min, 44px\)/)
	})
})
