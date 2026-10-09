/**
 * سلسلة التشغيل — من الدخول إلى لوحة القيادة إلى شاشات العمل (SAP).
 *
 * منطق التشغيل الخبير: كل بلاطة في الرئيسية وكل تبويب عمل وكل تحويلة بعد
 * الدخول يجب أن تحلّ إلى وجهة حقيقية — مسار مسجّل، شاشة في السجل، تبويب في
 * سجل اللوحات. رابط ميت هنا ليس عيبًا تجميليًا: `workScreenById` يسقط
 * بصمت على الفواتير، فشاشة خاطئة تبدو وكأنها تعمل.
 *
 * ربط العرض بالصلاحيات الفعلية (`@/utils/accessPolicy` — المصدر الوحيد):
 * البلاطات تُبنى من جدول `HOME_MODULES` بالدور والقدرات، لا من روابط ثابتة؛
 * والمسارات الإدارية محروسة في الموجّه. هذه البوابة تثبت الطبقتين:
 *  1. كل شاشة في جدول البلاطات ∈ معرّفات WORK_SCREENS.
 *  2. كل مسار في الجدول وتنقل اللوحة ∈ مسارات router.js.
 *  3. كل شاشة عمل مكتملة العقد (عنوان + أعمدة + صلاحية + تحميل).
 *  4. كل لوحة تحليلات مسجّلة ولها عنوان عربي في الرئيسية.
 *  5. هدف ما بعد الدخول (`goToDashboard` ← REPORTS) مسار موجود فعلًا.
 *  6. الأدوار: المشغّل بلا إدارة وبلا تدقيق + قراءة فقط؛ المراجع قراءة فقط
 *     مع التدقيق وبلا إدارة؛ الافتراضي/المجهول كامل (مالك المحل لا يُقفل).
 *  7. المشترك: الطوابير لا تظهر بلا قدرة المشترك، وتظهر بها.
 *  8. شرائح السياق تسقط المجهول ولا تخترع حقائق.
 */
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { WORK_SCREENS } from "@/data/workScreens"
import { DASHBOARD_REGISTRY } from "@/components/reports/dashboards/index"
import {
	DASH_NAV,
	HOME_MODULES,
	canSeeAdmin,
	canSeeScreen,
	filterDashNav,
	filterHomeModules,
	isAdminRoute,
	isReadOnlyRole,
	normalizeRole,
	opsContextItems,
	roleLabel,
} from "@/utils/accessPolicy"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (rel) => readFileSync(join(POS, rel), "utf8")

const HOME = read("src/components/reports/DashboardPage.vue")
const ROUTER = read("src/router.js")

const routeNames = new Set(
	[...ROUTER.matchAll(/^\s*[A-Z_]+:\s*"([^"]+)"/gm)].map((m) => m[1]),
)
const moduleRoute = (m) => m.to?.name ?? null
const moduleScreen = (m) => m.screen ?? null

describe("سلسلة التشغيل (الدخول ← الرئيسية ← الشاشات)", () => {
	it("جدول البلاطات والتنقل غير فارغ (لا نجاح فارغ)", () => {
		expect(HOME_MODULES.length).toBeGreaterThan(0)
		expect(DASH_NAV.length).toBeGreaterThan(0)
		expect(routeNames.size).toBeGreaterThan(0)
	})

	it("الرئيسية تُبنى من جدول السياسة لا من روابط ثابتة", () => {
		expect(HOME.includes("filterHomeModules")).toBe(true)
		expect(HOME.includes("v-for=\"module in modules\"")).toBe(true)
		expect(HOME.match(/screen:\s*"[A-Za-z-]+"/g) ?? []).toEqual([])
	})

	it("كل شاشة في الجدول موجودة في سجل الشاشات", () => {
		const ids = new Set(WORK_SCREENS.map((s) => s.id))
		for (const m of HOME_MODULES) {
			if (!moduleScreen(m)) continue
			expect(ids.has(moduleScreen(m)), `بلاطة تشير إلى شاشة غير موجودة: ${m.id}`).toBe(true)
		}
	})

	it("كل مسار في الجدول والتنقل مسجّل في router.js", () => {
		for (const m of [...HOME_MODULES, ...DASH_NAV]) {
			if (!moduleRoute(m)) continue
			expect(routeNames.has(moduleRoute(m)), `وجهة غير مسجّلة: ${m.id}`).toBe(true)
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

	it("الرئيسية وشاشات العمل تحملان قائمة المشغّل (الحساب/الخروج)", () => {
		const WORK = read("src/pages/WorkScreens.vue")
		for (const [name, source] of [["الرئيسية", HOME], ["شاشات العمل", WORK]]) {
			expect(source, `${name}: فتحة إجراءات الترويسة`).toContain('template #header-actions')
			expect(source, `${name}: زر المشغّل`).toContain("openOperatorMenu")
			expect(source, `${name}: القائمة`).toContain("OperatorMenu")
		}
	})

	it("الرئيسية تحمل زر مشاركة النظام المحلي", () => {
		expect(HOME).toContain("shareSystem")
		expect(HOME).toContain("مشاركة النظام")
	})

	it("الرئيسية تحمل مركز التنبيهات ومؤشر المزامنة", () => {
		expect(HOME).toContain("loadOpsAlerts")
		expect(HOME).toContain("home-alerts")
		expect(HOME).toContain("SyncStatusIndicator")
	})

	it("المسارات الإدارية الأربعة محروسة بـ adminOnly في الموجّه", () => {
		for (const name of ["Settings", "OpeningBalances", "ReferenceData", "MasterDataImport"]) {
			expect(isAdminRoute(name), `${name} سطح إداري`).toBe(true)
			expect(ROUTER.includes("[ROUTE_META.adminOnly]: true"), "حارس adminOnly").toBe(true)
		}
		expect(isAdminRoute("POSSale")).toBe(false)
		expect(isAdminRoute("WorkScreens")).toBe(false)
	})
})

describe("ربط العرض بالدور الفعلي", () => {
	const full = (modules) => modules.map((m) => m.id)

	it("المشغّل (كاشير): بلا إعدادات وبلا تدقيق، وقراءة فقط", () => {
		expect(normalizeRole("  Cashier ")).toBe("cashier")
		const ids = full(filterHomeModules({ role: "cashier", queueEnabled: true }))
		expect(ids).toContain("pos")
		expect(ids).toContain("invoices")
		expect(ids).not.toContain("settings")
		expect(canSeeScreen("audit", "cashier")).toBe(false)
		expect(canSeeScreen("invoices", "cashier")).toBe(true)
		expect(isReadOnlyRole("cashier")).toBe(true)
		expect(canSeeAdmin("cashier")).toBe(false)
	})

	it("المراجع: قراءة فقط مع التدقيق وبلا إدارة", () => {
		expect(isReadOnlyRole("auditor")).toBe(true)
		expect(canSeeScreen("audit", "auditor")).toBe(true)
		expect(canSeeAdmin("auditor")).toBe(false)
		const ids = full(filterHomeModules({ role: "accountant", queueEnabled: true }))
		expect(ids).not.toContain("settings")
		expect(ids).toContain("invoices")
	})

	it("الدور الافتراضي/المجهول/الإداري: كامل كما اليوم (لا قفل لمالك المحل)", () => {
		for (const role of ["POS User", "", null, undefined, "admin", "manager", "owner"]) {
			const ids = full(filterHomeModules({ role, queueEnabled: true }))
			expect(ids).toContain("settings")
			expect(canSeeScreen("audit", role)).toBe(true)
			expect(isReadOnlyRole(role)).toBe(false)
			expect(canSeeAdmin(role)).toBe(true)
		}
	})

	it("تنقل اللوحة يخضع لنفس القاعدة", () => {
		const cashier = full(filterDashNav({ role: "cashier", queueEnabled: true }))
		expect(cashier).not.toContain("settings")
		expect(cashier).toContain("reports")
		const owner = full(filterDashNav({ role: "POS User", queueEnabled: false }))
		expect(owner).toContain("settings")
		expect(owner).not.toContain("queue")
	})
})

describe("ربط العرض بقدرات المشترك", () => {
	it("الطوابير لا تظهر بلا قدرة المشترك وتظهر بها", () => {
		const off = filterHomeModules({ role: "POS User", queueEnabled: false }).map((m) => m.id)
		const on = filterHomeModules({ role: "POS User", queueEnabled: true }).map((m) => m.id)
		expect(off).not.toContain("queue")
		expect(on).toContain("queue")
	})

	it("القدرة لا تمنح المشغّل ما مُنع عنه بالدور", () => {
		const ids = filterHomeModules({ role: "cashier", queueEnabled: true }).map((m) => m.id)
		expect(ids).toContain("queue")
		expect(ids).not.toContain("settings")
	})
})

describe("شرائح سياق التشغيل", () => {
	it("تُظهر المعروف وتُسقط المجهول ولا تخترع", () => {
		const items = opsContextItems({
			user: "ahmed@royal",
			role: "cashier",
			tenantName: "Royal",
			branchName: "مأرب",
			shiftOpen: true,
		})
		const labels = items.map((i) => i.label)
		expect(labels).toContain("ahmed@royal")
		expect(labels).toContain("كاشير")
		expect(labels).toContain("Royal")
		expect(labels).toContain("مأرب")
		expect(labels).toContain("وردية مفتوحة")
		expect(opsContextItems({})).toEqual([])
		expect(opsContextItems({ shiftOpen: false }).map((i) => i.label)).toContain("لا وردية مفتوحة")
	})

	it("الدور المجهول يمر خامًا والفارغ يُسقط", () => {
		expect(roleLabel("cashier")).toBe("كاشير")
		expect(roleLabel("  ")).toBe("")
		expect(roleLabel("StrangeRole")).toBe("StrangeRole")
	})
})
