import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const css = read("src/styles/pages/login.css")
const page = read("src/pages/Login.vue")

describe("login layout shell", () => {
	it("uses one layout vocabulary without obsolete grid areas", () => {
		expect(css).toContain(".dy-login {")
		expect(css).toContain(".dy-login__brand {")
		expect(css).toContain(".dy-login__status-bar {")
		expect(css).toMatch(/\.dy-login__secondary(?:\s*,|\s*\{)/)
		expect(css).not.toContain("grid-template-areas")
		expect(css).not.toContain("grid-area: workspace")
	})

	it("keeps the runtime status as a normal document row", () => {
		const start = css.indexOf(".dy-login__status-bar {")
		const block = css.slice(start, css.indexOf("}", start))
		expect(block).not.toMatch(/position\s*:\s*fixed/)
		expect(block).toMatch(/min-height:\s*28px/)
	})

	it("keeps the form reachable without viewport clipping", () => {
		const start = css.indexOf(".dy-login {")
		const block = css.slice(start, css.indexOf("}", start))
		expect(block).not.toMatch(/overflow\s*:\s*hidden/)
		expect(block).not.toMatch(/(?<!min-)height:\s*100dvh/)
		expect(page).toContain('class="dy-login__submit"')
	})
})
