import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const shell = readFileSync("src/components/work/WorkShell.vue", "utf8")
const grid = readFileSync("src/components/work/WorkDataGrid.vue", "utf8")
const gridVisual = readFileSync("src/components/work/workDataGrid.visual.css", "utf8")

describe("shared work surfaces", () => {
	it("uses semantic page landmarks instead of forcing the entire screen into application mode", () => {
		expect(shell).toContain('<main')
		expect(shell).not.toContain('role="application"')
		expect(shell).toContain('href="#work-main"')
	})

	it("restores focus and the previous scroll lock when dismissing mobile navigation", () => {
		expect(shell).toContain('event.key === "Escape" && mobileNavOpen.value')
		expect(shell).toContain('closeMobileNav({ restoreFocus: true })')
		expect(shell).toContain('mobileToggleRef.value?.focus')
		expect(shell).toContain('nav?.querySelectorAll')
		expect(shell).toContain('event.shiftKey && document.activeElement === first')
		expect(shell).toContain('document.body.style.overflow = previousBodyOverflow')
	})

	it("keeps touch-sized navigation and data-grid density controls", () => {
		expect(shell).toContain('min-height: max(44px, var(--dy-nav-item-h, 44px))')
		expect(grid).toContain('.work-data-grid__density-select')
		expect(gridVisual).toMatch(/\.work-data-grid__density-select\s*\{[^}]*min-height:\s*44px/s)
	})

	it("provides restrained enterprise table hierarchy and visible keyboard focus", () => {
		expect(gridVisual).toContain('border-radius: 16px')
		expect(gridVisual).toContain('.work-data-grid__table thead')
		expect(gridVisual).toContain('.work-data-grid__row:hover .work-data-grid__td')
		expect(gridVisual).toContain('.work-data-grid__row--selected .work-data-grid__td')
		expect(gridVisual).toContain('focus-visible')
		expect(gridVisual).toContain('prefers-reduced-motion: reduce')
	})
})
