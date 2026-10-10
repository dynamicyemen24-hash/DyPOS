/**
 * هوية النظام — معممة على كل الشاشات ومستقلة عن هوية المشترك.
 *
 * القاعدة: شعار DyPOS واسم النظام في الواجهات (الدخول/الرئيسية/القشرة/البيع)
 * من أصل ثابت (`@/assets/DyPOSLogo.png`)، لا من بيانات المشترك. علامة المشترك
 * (الشعار/الاسم/اللون من `saasSettings` أو `posSettings`) لا تُرسم في أي
 * إطار نظام — مكانها الوحيد شرائح سياق مُعلَّنة (`opsContextItems` بعد الدخول،
 * `useLoginContextItems` على الدخول). مشترك يبدّل هوية النظام ليس تخصيصًا
 * بل انتحالًا بصريًا، والافتراضي الصامت أخطر: قيمة فارغة تُخفي الشعار.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const SRC = join(POS, "src")
const read = (rel) => readFileSync(join(POS, rel), "utf8")

function vueFiles(dir = SRC, out = []) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) vueFiles(full, out)
		else if (entry.endsWith(".vue")) out.push(full)
	}
	return out
}

const CHROME = [
	"src/pages/Login.vue",
	"src/components/reports/DashboardPage.vue",
	"src/components/work/WorkShell.vue",
	"src/pages/POSSale.vue",
]

describe("هوية النظام مستقلة عن المشترك", () => {
	it("إطارات النظام ترسم شعار DyPOS الثابت", () => {
		expect(read("src/pages/Login.vue")).toContain("@/assets/DyPOSLogo.png")
		expect(read("src/components/reports/DashboardPage.vue")).toContain(
			"@/assets/DyPOSLogo.png",
		)
	})

	it("لا علامة مشترك في أي إطار نظام (لا شعار ولا اسم ولا ألوان)", () => {
		for (const rel of CHROME) {
			const source = read(rel)
			expect(source, `${rel}: companyLogo`).not.toContain("companyLogo")
			expect(source, `${rel}: brandVars`).not.toContain("brandVars")
			expect(source, `${rel}: useSaaSStore`).not.toContain("useSaaSStore")
		}
	})

	it("لا قالب يرسم شعار المشترك كصورة (حقل التسجيل المحلي مستثنى)", () => {
		const offenders = vueFiles().filter((full) => {
			if (full.endsWith("Register.vue")) return false
			const source = readFileSync(full, "utf8")
			return /:src="companyLogo"|src=\{[^}]*companyLogo/.test(source)
		})
		expect(offenders).toEqual([])
	})

	it("اسم الشركة في القوالب محصور في نموذج التسجيل فقط", () => {
		const hits = vueFiles().filter((full) =>
			readFileSync(full, "utf8").includes("companyName"),
		)
		expect(hits.map((f) => f.split("src")[1].replace(/\\/g, "/"))).toEqual([
			"/pages/Register.vue",
		])
	})

	it("هوية المشترك تُعرض فقط في شرائح سياق مُعلَّنة", () => {
		expect(read("src/components/reports/DashboardPage.vue")).toContain(
			"opsContextItems",
		)
		expect(read("src/pages/Login.vue")).toContain("LoginContextChips")
		expect(read("src/composables/useLoginContextItems.js")).toContain(
			"CONTEXT_FIELDS",
		)
	})

	it("عناوين المستندات عربية بلاحقة DyPOS على كل تنقل", () => {
		const router = read("src/router.js")
		expect(router).toContain("DyPOS")
		expect(router).toContain("ROUTE_TITLES")
		expect(router).toContain("applyDocumentTitle")
	})
})
