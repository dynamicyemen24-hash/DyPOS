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

	it("branch never blocks offline login (optional, persisted)", () => {
		// الفرع اختياري دائمًا: إيقاف الدخول خلف قائمة فروع (فارغة محليًا
		// أو بعيدة بلا شبكة) كان جدارًا بلا باب للمحل الصغير. من اختار
		// فرعًا يُحفظ اختياره، ومن لم يختر يدخل ويبيع.
		expect(page).not.toContain("اختر الفرع قبل تسجيل الدخول")
		expect(page).toContain("dypos.lastBranchId")
	})
})
