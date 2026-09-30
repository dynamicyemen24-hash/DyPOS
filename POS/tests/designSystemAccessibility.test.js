import { describe, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(ROOT, path), "utf8")

describe("production design-system contract", () => {
	it("keeps the layered design-system entrypoint intact", () => {
		const css = read("src/styles/dypos/index.css")
		for (const layer of [
			"tokens.css",
			"themes.css",
			"accents.css",
			"base.css",
			"components.css",
			"animations.css",
			"utilities.css",
			"density.css",
		]) {
			expect(css).toContain(layer)
		}
	})

	it("defines accessible high-contrast fallbacks", () => {
		const css = read("src/styles/dypos/themes.css")
		expect(css).toContain("@media (forced-colors: active)")
		expect(css).toContain("CanvasText")
		expect(css).toContain("Highlight")
		expect(css).toContain("@media (prefers-contrast: more)")
	})

	it("keeps RTL, reduced-motion and focus contracts", () => {
		const css = read("src/index.css")
		expect(css).toContain('[dir="rtl"]')
		expect(css).toContain(":focus-visible")
		expect(css).toContain("prefers-reduced-motion")
	})

	it("exposes independent light, dark and system theme modes", () => {
		const theme = read("src/composables/useAppTheme.js")
		expect(theme).toContain('["light", "dark", "system"]')
		expect(theme).toContain("data-theme")
		expect(theme).toContain("data-accent")
		expect(theme).toContain("data-density")
	})
})
