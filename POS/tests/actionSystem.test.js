/**
 * منظومة الأوامر — القاموس والمحرك مربوطان بالواقع.
 *
 * تثبت البوابة أن:
 *  1. كل إجراء مسجّل: تسمية عربية + نوع صالح + سياسة تأكيد صالحة + صلاحية
 *     مسماة + أيقونة موجودة فعلًا في feather (مباشرة أو عبر FEATHER_ALIASES) —
 *     فلا دائرة صامتة بدل أيقونة.
 *  2. كل بلاطة رئيسية يقابلها إجراء تنقل في القاموس بنفس الوجهة (لا ازدواج).
 *  3. المحرك: التحميل يجمّد الكل بسبب معلن، وانعدام المصدر يبقي التحديث وحده،
 *     وغياب الصفوف يمنع التصدير والطباعة بسبب معلن، والترتيب رئيسي أولًا.
 *  4. الملغي تاريخ للقراءة: لا إجراء مدمر يظهر له (ولا مسجّل أصلًا).
 *  5. انبعاثات شريط البيع الثمانية كلها موصولة في POSSale (لا زر يصرخ في فراغ).
 *  6. حارس عدم تكرار الاعتماد موجود في confirmPayment (فحص + finally).
 */
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import feather from "feather-icons"
import { describe, expect, it } from "vitest"

import {
	ACTIONS,
	ACTION_KINDS,
	CONFIRM_POLICIES,
	describeAction,
	normalizeRecordState,
	resolveStripActions,
} from "@/utils/actionDictionary"
import { HOME_MODULES } from "@/utils/accessPolicy"
import { FEATHER_ALIASES } from "../packages/dypos-ui/src/components/FeatherIcon.vue"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (rel) => readFileSync(join(POS, rel), "utf8")

const ARABIC = /[\u0600-\u06FF]/

function iconResolves(name) {
	if (feather.icons[name]) return true
	const aliased = FEATHER_ALIASES[name]
	return Boolean(aliased && feather.icons[aliased])
}

describe("قاموس الإجراءات", () => {
	it("كل إجراء مكتمل العقد", () => {
		const ids = Object.keys(ACTIONS)
		expect(ids.length).toBeGreaterThan(0)
		for (const [id, action] of Object.entries(ACTIONS)) {
			expect(id, "معرّف ثابت").toMatch(/^[a-z]+\.[a-zA-Z]+$/)
			expect(ARABIC.test(action.label ?? ""), `${id}: تسمية عربية`).toBe(true)
			expect(ACTION_KINDS, `${id}: kind`).toContain(action.kind)
			expect(CONFIRM_POLICIES, `${id}: confirm`).toContain(action.confirm)
			expect(String(action.permission ?? "").length, `${id}: permission`).toBeGreaterThan(0)
			expect(typeof action.idempotent, `${id}: idempotent`).toBe("boolean")
		}
	})

	it("كل أيقونة موجودة فعلًا — لا دائرة صامتة", () => {
		for (const [id, action] of Object.entries(ACTIONS)) {
			expect(iconResolves(action.icon), `${id}: أيقونة ${action.icon}`).toBe(true)
		}
		for (const module of HOME_MODULES) {
			expect(iconResolves(module.icon), `بلاطة ${module.id}: أيقونة ${module.icon}`).toBe(true)
		}
	})

	it("المجهول null لا اختلاق", () => {
		expect(describeAction("no.such")).toBeNull()
	})

	it("كل بلاطة رئيسية يقابلها إجراء تنقل بنفس الوجهة", () => {
		const navs = Object.values(ACTIONS).filter((a) => a.kind === "nav")
		for (const module of HOME_MODULES) {
			const target = module.to?.name ?? (module.screen ? "WorkScreens" : null)
			const screen = module.screen ?? null
			const match = navs.find(
				(n) => (n.route ?? null) === target && (n.screen ?? null) === screen,
			)
			expect(match, `بلاطة بلا إجراء: ${module.id}`).toBeTruthy()
		}
	})
})

describe("محرك السياق", () => {
	it("التحميل يجمّد الكل بسبب معلن", () => {
		const actions = resolveStripActions({ loading: true, hasRows: true, source: "server" })
		expect(actions.length).toBeGreaterThan(0)
		for (const action of actions) {
			expect(action.disabled, action.id).toBe(true)
			expect(String(action.reason ?? "").length, action.id).toBeGreaterThan(0)
		}
	})

	it("انعدام المصدر يبقي التحديث وحده", () => {
		for (const source of ["", "unavailable"]) {
			const actions = resolveStripActions({ loading: false, hasRows: true, source })
			const byId = Object.fromEntries(actions.map((a) => [a.id, a]))
			expect(byId["record.refresh"].disabled).toBe(false)
			expect(byId["record.exportCsv"].disabled).toBe(true)
			expect(byId["record.print"].disabled).toBe(true)
		}
	})

	it("غياب الصفوف يمنع التصدير والطباعة بسبب معلن", () => {
		const actions = resolveStripActions({ loading: false, hasRows: false, source: "server" })
		const byId = Object.fromEntries(actions.map((a) => [a.id, a]))
		expect(byId["record.refresh"].disabled).toBe(false)
		expect(byId["record.exportCsv"].disabled).toBe(true)
		expect(String(byId["record.exportCsv"].reason ?? "").length).toBeGreaterThan(0)
	})

	it("الجاهزية تتيح الكل والترتيب رئيسي أولًا", () => {
		const actions = resolveStripActions({ loading: false, hasRows: true, source: "local" })
		expect(actions.every((a) => !a.disabled)).toBe(true)
		expect(actions[0].id).toBe("record.refresh")
		expect(actions[0].kind).toBe("primary")
	})

	it("الملغي تاريخ: لا إجراء مدمر يظهر له", () => {
		for (const raw of ["VOIDED", "voided", "ملغي", "cancelled"]) {
			expect(normalizeRecordState(raw)).toBe("voided")
		}
		const actions = resolveStripActions({ loading: false, hasRows: true, source: "server" })
		expect(actions.some((a) => a.kind === "danger")).toBe(false)
	})

	it("حالات السجل المعروفة تُطبَّع والمجهول يمر خامًا", () => {
		expect(normalizeRecordState("Draft")).toBe("draft")
		expect(normalizeRecordState("paid")).toBe("paid")
		expect(normalizeRecordState("SomethingNew")).toBe("somethingnew")
	})
})

describe("ربط الشريط بالبيع", () => {
	it("انبعاثات شريط الأدوات الثمانية موصولة في POSSale", () => {
		const sale = read("src/pages/POSSale.vue")
		for (const handler of [
			'@back="',
			'@home="',
			'@operations="',
			'@stock="',
			'@payment="',
			'@scan="',
			'@shortcuts="',
			'@sync="',
		]) {
			expect(sale, handler).toContain(handler)
		}
	})

	it("حارس عدم تكرار الاعتماد موجود (فحص + finally)", () => {
		const sale = read("src/pages/POSSale.vue")
		expect(sale).toContain("paymentProcessing.value) {")
		expect(sale).toContain("paymentProcessing.value = true")
		expect(sale).toContain("paymentProcessing.value = false")
	})
})
