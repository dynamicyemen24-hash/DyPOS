import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const page = read("src/pages/Login.vue")
const css = read("src/styles/pages/login.css")

describe("login identity context", () => {
	it("renders confirmed runtime context without a synthetic workspace card", () => {
		expect(page).toContain("<LoginContextChips")
		expect(page).not.toContain("<LoginWorkspacePanel")
		expect(css).toContain(".dy-login__context")
	})

	it("keeps identity and authentication as one responsive work surface", () => {
		expect(css).toContain(".dy-login__panel")
		expect(css).toContain(".dy-login__form")
		expect(css).not.toContain("grid-area: workspace")
		expect(css).not.toContain("grid-area: panel")
	})

	it("does not fabricate branch readiness", () => {
		expect(page).toContain("اختر الفرع قبل تسجيل الدخول")
	})
})
