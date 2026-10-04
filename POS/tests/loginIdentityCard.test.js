import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mount } from "@vue/test-utils"

import SystemAboutPanel from "@/components/common/SystemAboutPanel.vue"

vi.mock("@/composables/useMediaQuery", () => ({
	useMediaQuery: () => ({ __v_isRef: true, value: false }),
}))

const POS = resolve(process.cwd())
const css = readFileSync(resolve(POS, "src/styles/pages/login.css"), "utf8")

describe("the identity card is a real disclosure", () => {
	it("is a <details>, not a div pretending to be one", () => {
		// `<details>` brings keyboard operation, screen-reader semantics and
		// state persistence with zero JavaScript. A `div role="button"` would
		// need all three re-implemented by hand.
		const wrapper = mount(SystemAboutPanel)
		expect(wrapper.find("details.system-panel").exists()).toBe(true)
		expect(wrapper.find("summary.system-panel__summary").exists()).toBe(true)
	})

	it("keeps the IMAGE inside the summary, so folding never hides it", () => {
		// The whole point of the fold: the picture is what tells the user what
		// they are signing in to. It must survive the toggle.
		const wrapper = mount(SystemAboutPanel)
		const summary = wrapper.find("summary")
		expect(summary.find("img").exists()).toBe(true)
		// …and the descriptive body sits OUTSIDE the summary, so it is what folds.
		expect(wrapper.find(".system-panel__about").exists()).toBe(true)
		expect(summary.find(".system-panel__about").exists()).toBe(false)
	})

	it("shows the descriptive text when open", () => {
		// The gate that fails if someone swaps `<details>` for a div.
		const wrapper = mount(SystemAboutPanel)
		expect(wrapper.text()).toContain("نظام نقاط بيع")
	})

	it("labels the fold, because an arrow alone is not a name", () => {
		const wrapper = mount(SystemAboutPanel)
		expect(wrapper.find(".system-panel__toggle").text()).toContain("عن النظام")
		// Decorative only: the accessible name comes from the element itself, so
		// a screen reader must not announce the arrow's label twice.
		expect(
			wrapper.find(".system-panel__toggle").attributes("aria-hidden"),
		).toBe("true")
	})

	it("keeps the artwork eager now that it is the first thing painted", () => {
		// The card is ABOVE the form on a phone, so its image is the first paint
		// on the screen. `loading="lazy"` would defer exactly what the reorder
		// brought forward, so the attribute is deliberately ABSENT and this pins
		// that — a reviewer adding "lazy is an optimisation" would break it.
		const wrapper = mount(SystemAboutPanel)
		expect(wrapper.find("img").attributes("loading")).toBeUndefined()
	})
})

describe("the card sits above the form on a narrow screen", () => {
	/*
	 * These three checks used to read the area name `showcase`, which the
	 * narrow breakpoint has never declared — and `indexOf` returns -1 for an
	 * absent name, so `-1 < 0` was TRUE. The ordering assertion therefore passed
	 * without ever looking at the layout, which is the exact failure mode
	 * AGENTS.md records: a gate that cannot say "nothing was checked".
	 *
	 * They now read the real vocabulary (`workspace`) AND prove the names were
	 * found, so an absent area fails loudly instead of silently passing.
	 */
	const areasIn = (source) =>
		[...source.matchAll(/grid-template-areas:([\s\S]*?);/g)]
			.flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)])
			.flatMap((m) => m[1].split(/\s+/))
			.filter(Boolean)

	it("the narrow-screen stack puts workspace after panel", () => {
		/*
		 * Read from the narrow breakpoint so a document-wide search cannot pick
		 * up the desktop block, which legitimately declares `workspace panel`
		 * side by side.
		 *
		 * The areas are no longer re-declared in that block: the base rule on
		 * `.dy-login` IS the single-column stack, and restating it produced the
		 * second-and-drifting copy this whole round removed. So the stack is read
		 * from where it is actually declared — the base rule — and the narrow
		 * block is checked only for not contradicting it.
		 */
		/*
		 * The base rule is cut by the FIRST real `@media` AT-RULE, not the first
		 * literal `@media` in the file: the explanatory comment above `.dy-login`
		 * names two breakpoints, and `css.indexOf("@media")` lands inside it —
		 * returning a slice with no declarations at all, which is how this check
		 * reported `[]` for a stylesheet that does declare a stack.
		 */
		const base = css.slice(0, css.search(/^@media /m))
		const order = areasIn(base)
		expect(order).toContain("workspace")
		expect(order).toContain("panel")
		expect(order.indexOf("panel")).toBeLessThan(order.indexOf("workspace"))

		// And the narrow block must not re-introduce a competing stack. Its own
		// text only — the slice runs to the END of the file otherwise, so it
		// would match the DESKTOP block that legitimately declares areas.
		const narrowStart = css.search(/@media \(max-width: 900px\)/)
		const narrowEnd = css.indexOf("@media", narrowStart + 1)
		const narrow = css.slice(
			narrowStart,
			narrowEnd === -1 ? undefined : narrowEnd,
		)
		expect(narrow, "no max-width: 900px block").not.toBe("")
		// Comments are stripped first: this block's own note quotes the dead
		// `grid-template-areas` it removed, so a gate that matched its own
		// documentation would fail on the very fix it is meant to protect.
		expect(narrow.replace(/\/\*[\s\S]*?\*\//g, " ")).not.toMatch(
			/grid-template-areas:/,
		)
	})

	it("keeps the identity ahead of the form even below 560px", () => {
		// The 560px block must not re-order them back, and the narrow rule must
		// still apply there (it does — no override between them).
		const afterNarrow = css.slice(css.indexOf("@media (max-width: 560px)"))
		expect(afterNarrow).not.toMatch(
			/grid-template-areas:[^;]*"panel"[^;]*"workspace"/,
		)
	})

	it("does not re-order on a wide screen", () => {
		// The desktop layout is two columns: form and card SIDE BY SIDE. Forcing
		// the card above the form there would push the login form under the
		// masthead for no reason.
		const desktop = css.slice(
			css.indexOf("@media (min-width: 1101px)"),
			css.indexOf("@media (max-width: 900px)"),
		)
		expect(desktop).toMatch(/grid-template-areas:[^;]*"workspace panel"/)
		// Both names must be declared by that block, not merely ordered.
		const areas = areasIn(desktop)
		expect(areas).toContain("workspace")
		expect(areas).toContain("panel")
	})
})

describe("the fold is a CSS decision on wide screens, not a re-mount", () => {
	/*
	 * The stylesheet lives in the component's `<style scoped>`, not in
	 * `login.css` — the component was written with its own scoped block and
	 * moving it would be churn for no gain. So the rule is read from where it
	 * actually is.
	 */
	const panelCss = readFileSync(
		resolve(POS, "src/components/common/SystemAboutPanel.vue"),
		"utf8",
	)

	it("hides the toggle and always shows the body at min-width: 901px", () => {
		// `<details>` hides its body by CSS AND by DOM, so "always open" is only
		// true if the stylesheet forces the body back. Without this rule the
		// card is collapsible on a desktop too — and on a wide screen the
		// identity is decoration, not a choice the cashier should have to make.
		const block = panelCss.match(/@media \(min-width: 901px\) \{[\s\S]*?\n\}/)
		expect(block, "no min-width: 901px rule in the panel").toBeTruthy()
		expect(block[0]).toMatch(/\.system-panel__toggle\s*\{\s*display:\s*none/)
		expect(block[0]).toMatch(/\.system-panel__about\s*\{\s*display:\s*flex/)
	})

	it("removes the browser's own disclosure marker", () => {
		// Left alone, Chrome draws a triangle inside the artwork frame and Safari
		// draws none — so the same card looks different in the two browsers a
		// till shop actually uses.
		expect(panelCss).toMatch(
			/\.system-panel__summary\s*\{[^}]*list-style:\s*none/,
		)
		expect(panelCss).toMatch(/::-webkit-details-marker\s*\{\s*display:\s*none/)
	})

	it("keeps the summary focusable natively, with no tabindex", () => {
		// `<summary>` is focusable by default. A `tabindex="0"` would put it in
		// the tab order TWICE on some browsers, which is a classic keyboard bug
		// shipped with good intentions.
		//
		// Comments are stripped first: the line documenting this very rule
		// mentions `tabindex` by name, and a gate that matches its own
		// documentation is a gate people disable.
		const source = readFileSync(
			resolve(POS, "src/components/common/SystemAboutPanel.vue"),
			"utf8",
		)
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/\/\*[\s\S]*?\*\//g, " ")
		expect(source).not.toMatch(/tabindex/)
	})
})
