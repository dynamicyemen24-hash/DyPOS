import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const shell = readFileSync("src/components/work/WorkShell.vue", "utf8")
const grid = readFileSync("src/components/work/WorkDataGrid.vue", "utf8")
const gridVisual = readFileSync("src/components/work/workDataGrid.visual.css", "utf8")
const gridBase = readFileSync("src/components/work/workDataGrid.base.css", "utf8")

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
		expect(gridBase).toContain('.work-data-grid__density-select')
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

const onboarding = readFileSync("src/pages/MasterDataImportPage.vue", "utf8")

const workScreens = readFileSync("src/pages/WorkScreens.vue", "utf8")

describe("WorkScreens workbench integration", () => {
	it("composes shared menu, panel, grid and live status components", () => {
		expect(workScreens).toContain("WorkMenuStrip")
		expect(workScreens).toContain("WorkPanel")
		expect(workScreens).toContain("WorkStatusStrip")
		expect(workScreens).toContain("WorkDataGrid")
	})

	it("wires menu actions to real refresh and filter reset operations", () => {
		expect(workScreens).toContain('shortcut: "Alt+R"')
		expect(workScreens).toContain('shortcut: "Alt+C"')
		expect(workScreens).toContain('if (action === "refresh") load()')
		expect(workScreens).toContain('if (action === "clear-filter") quickFilterValue.value = ""')
	})
})

describe("master data onboarding workbench", () => {
	it("preserves preview-before-apply safeguards", () => {
		expect(onboarding).toContain("lastValidatedCsv.value === csv.value")
		expect(onboarding).toContain("lastValidatedType.value === type.value")
		expect(onboarding).toContain("② اعتماد الاستيراد الذري")
		expect(onboarding).toContain("① تحقق ومعاينة بلا كتابة")
	})

	it("keeps responsive touch targets and reduced-motion support", () => {
		expect(onboarding).toContain("Focused enterprise workbench polish")
		expect(onboarding).toContain("min-height:48px")
		expect(onboarding).toContain("min-height:44px")
		expect(onboarding).toContain("prefers-reduced-motion:reduce")
		expect(onboarding).toContain("focus-visible")
	})
})
