/**
 * سلسلة التشغيل — من الدخول إلى لوحة القيادة إلى شاشات العمل (SAP).
 *
 * منطق التشغيل الخبير: كل بلاطة في الرئيسية وكل تبويب عمل وكل تحويلة بعد
 * الدخول يجب أن تحلّ إلى وجهة حقيقية — مسار مسجّل، شاشة في السجل، تبويب في
 * سجل اللوحات. رابط ميت هنا ليس عيبًا تجميليًا: `workScreenById` يسقط
 * بصمت على الفواتير، فشاشة خاطئة تبدو وكأنها تعمل.
 *
 * ما تثبته البوابة:
 *  1. كل `screen: '…'` في الرئيسية ∈ معرّفات WORK_SCREENS.
 *  2. كل `name: '…'` في الرئيسية ∈ أسماء مسارات router.js.
 *  3. كل شاشة عمل: معرّف + عنوان + عنوان-فراغ + أيقونة + صلاحية + أعمدة + دالة تحميل.
 *  4. كل لوحة في DASHBOARD_REGISTRY: معرّف + اسم + مكوّن + أيقونة + عنوان عربي في الرئيسية.
 *  5. هدف ما بعد الدخول (`goToDashboard` ← REPORTS) مسار موجود فعلًا.
 *  6. الاستخراج نفسه مُثبت: صفر رموز مستخرجة = فشل، لا نجاح فارغ.
 */
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { WORK_SCREENS } from "@/data/workScreens"
import { DASHBOARD_REGISTRY } from "@/components/reports/dashboards/index"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (rel) => readFileSync(join(POS, rel), "utf8")

const HOME = read("src/components/reports/DashboardPage.vue")
const ROUTER = read("src/router.js")

const homeScreens = [
	...HOME.matchAll(/screen:\s*"([A-Za-z-]+)"/g),
].map((m) => m[1])
const homeRoutes = [...HOME.matchAll(/name:\s*"([A-Za-z]+)"/g)].map(
	(m) => m[1],
)
const routeNames = new Set(
	[...ROUTER.matchAll(/^\s*[A-Z_]+:\s*"([^"]+)"/gm)].map((m) => m[1]),
)

describe("سلسلة التشغيل (الدخول ← الرئيسية ← الشاشات)", () => {
	it("الاستخراج يجد رموزًا حقيقية (لا نجاح فارغ)", () => {
		expect(homeScreens.length).toBeGreaterThan(0)
		expect(homeRoutes.length).toBeGreaterThan(0)
		expect(routeNames.size).toBeGreaterThan(0)
	})

	it("كل شاشة مذكورة في الرئيسية موجودة في سجل الشاشات", () => {
		const ids = new Set(WORK_SCREENS.map((s) => s.id))
		for (const screen of homeScreens) {
			expect(ids.has(screen), `بلاطة تشير إلى شاشة غير موجودة: ${screen}`).toBe(true)
		}
	})

	it("كل مسار مذكور في الرئيسية مسجّل في router.js", () => {
		for (const name of homeRoutes) {
			expect(routeNames.has(name), `بلاطة تشير إلى مسار غير مسجّل: ${name}`).toBe(true)
		}
	})

	it("كل شاشة عمل مكتملة العقد (عنوان + أعمدة + صلاحية + تحميل)", () => {
		expect(WORK_SCREENS.length).toBeGreaterThan(0)
		for (const screen of WORK_SCREENS) {
			expect(screen.id, "معرّف الشاشة").toMatch(/^[a-z-]+$/)
			expect(String(screen.label ?? "").length, `${screen.id}: label`).toBeGreaterThan(0)
			expect(String(screen.emptyTitle ?? "").length, `${screen.id}: emptyTitle`).toBeGreaterThan(0)
			expect(String(screen.icon ?? "").length, `${screen.id}: icon`).toBeGreaterThan(0)
			expect(String(screen.permission ?? "").length, `${screen.id}: permission`).toBeGreaterThan(0)
			expect(Array.isArray(screen.columns) && screen.columns.length > 0, `${screen.id}: columns`).toBe(true)
			expect(typeof screen.load, `${screen.id}: load`).toBe("function")
		}
	})

	it("كل لوحة تحليلات مسجّلة ولها عنوان عربي في الرئيسية", () => {
		expect(DASHBOARD_REGISTRY.length).toBeGreaterThan(0)
		for (const board of DASHBOARD_REGISTRY) {
			expect(String(board.id ?? "").length, "معرّف اللوحة").toBeGreaterThan(0)
			expect(String(board.name ?? "").length, `${board.id}: name`).toBeGreaterThan(0)
			expect(typeof board.component, `${board.id}: component`).toBe("function")
			expect(String(board.icon ?? "").length, `${board.id}: icon`).toBeGreaterThan(0)
			expect(HOME.includes(`"${board.id}"`), `لا عنوان عربي للوحة: ${board.id}`).toBe(true)
		}
	})

	it("هدف ما بعد الدخول مسار موجود (REPORTS) ومسار الدخول موجود (LOGIN)", () => {
		expect(routeNames.has("Reports"), "مسار لوحة التشغيل").toBe(true)
		expect(routeNames.has("Login"), "مسار الدخول").toBe(true)
		expect(ROUTER.includes("goToDashboard"), "مُساعِد التحويل للوحة").toBe(true)
	})
})
