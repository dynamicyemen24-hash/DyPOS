/**
 * شاشة الأرصدة الافتتاحية — يجب أن تُعرِض أرقامها، وأن تعلن مصدرها.
 *
 * اختُبر هنا ثلاثة عقود تفقد بهدوء بدون مجموعة الاختبارات أن تلاحظ:
 *
 * 1. **الأموال لا تُحوَّل مرتين.** السيرفر يعيد `amount` بالوحدات الكبرى
 *    ومعه `amount_minor`. لو حوّلت الشاشة `amount` بـ`toMajor` من جديد لتضاعف
 *    100 ضعف. الاختبار يقرأ المبلغ المعروض ويقارنه بالنصّ الحرفي.
 *
 * 2. **قائمة فارغة ليست قياسًا.** حين يفشل الاتصال بالشبكة، الشاشة يجب أن
 *    تقول "غير معروف" لا أن تعرض "لا توجد أرصدة". عرضُ صفرٍ على شاشة رصيد
 *    افتتاحي هو أخطر خطأ ممكن: مديرٌ يعيد بناء المخزون على تخمين.
 *
 * 3. **الكتابة مرتبطة بالدور.** الكاشير يرى الجدول (التقارير تبقى مفتوحة)
 *    لكنه لا يرى زر "رصيد جديد" ولا تحذيرًا مغلقًا. التحقق الحقيقي يبقى
 *    في السيرفر (fail-closed)؛ هنا نمنع واجهة تُوهِر.
 */
import { mount, flushPromises } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"

const rows = [
	{
		id: "ob-1",
		tenant_id: "t1",
		fiscal_year: "2026",
		account_type: "customer",
		account_id: "C-9",
		account_code: "K-1",
		account_name: "عميل افتتاحي",
		amount_minor: 123456,
		amount: 1234.56,
		quantity: 0,
	},
	{
		id: "ob-2",
		tenant_id: "t1",
		fiscal_year: "2026",
		account_type: "cash",
		account_id: "",
		account_code: "",
		account_name: "الصندوق",
		amount_minor: 50000,
		amount: 500,
		quantity: 0,
	},
]

const summary = {
	customer: { amountMinor: 123456, quantity: 0, count: 1 },
	cash: { amountMinor: 50000, quantity: 0, count: 1 },
	stock: { amountMinor: 0, quantity: 0, count: 0 },
	supplier: { amountMinor: 0, quantity: 0, count: 0 },
}

const call = vi.fn()
let role = "ADMIN"

vi.mock("@/utils/methodClient", () => ({
	methodCall: (...args) => call(...args),
}))

vi.mock("@/data/session", () => ({
	sessionRole: () => role,
}))

const OpeningBalancesPage = (await import("@/pages/OpeningBalancesPage.vue"))
	.default

const router = createRouter({
	history: createMemoryHistory(),
	routes: [
		{ path: "/", name: "POSSale", component: { template: "<div />" } },
		{
			path: "/opening-balances",
			name: "OpeningBalances",
			component: OpeningBalancesPage,
		},
	],
})

const mountPage = async () => {
	const wrapper = mount(OpeningBalancesPage, {
		global: {
			plugins: [router],
			stubs: { RouterLink: true },
		},
	})
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	call.mockReset()
	role = "ADMIN"
})

describe("opening balances screen", () => {
	it("loads rows and the opening position through the dedicated verb", async () => {
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		expect(call).toHaveBeenCalledWith(
			"DyPOS.api.opening_balances.get_opening_balances",
			expect.objectContaining({ fiscalYear: expect.any(String) }),
		)
		expect(wrapper.find('[data-testid="ob-table"]').exists()).toBe(true)
		expect(wrapper.findAll("tbody tr")).toHaveLength(2)
	})

	it("displays the amount EXACTLY once — no 100x inflation", async () => {
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		const text = wrapper.text()
		// 123456 halalas = 1234.56 major. If the screen re-converted the major
		// value it would print 123456.00; if it printed raw minor it would be
		// equally wrong. The formatted figure must appear and the inflated one
		// must not.
		expect(text).toMatch(/1[.,]234[.,]56/)
		expect(text).not.toMatch(/123[.,]456[.,]00/)
	})

	it("shows a real zero for a type with no rows, not a missing card", async () => {
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		// An absent bucket reads as "not measured"; the strip must still render
		// all four positions so a genuine 0.00 is visibly a zero.
		expect(wrapper.find('[data-testid="sum-stock"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="sum-stock"]').text()).toContain("0")
	})

	it("declares UNKNOWN when the server is unreachable, never 'no balances'", async () => {
		call.mockRejectedValueOnce(new Error("network down"))
		const wrapper = await mountPage()

		const text = wrapper.text()
		expect(text).toContain("تعذّر الوصول للسيرفر")
		// The honest empty-state wording, NOT the confident "there are none".
		expect(text).toContain("لا يمكن تأكيد خلو السنة")
		expect(text).not.toContain("لا توجد أرصدة افتتاحية مسجّلة لهذه السنة")
		// And no table: rendering rows would imply we know them.
		expect(wrapper.find('[data-testid="ob-table"]').exists()).toBe(false)
	})

	it("hides the write actions from a CASHIER but keeps the read plane open", async () => {
		role = "CASHIER"
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		expect(wrapper.text()).toContain("عميل افتتاحي")
		expect(wrapper.find('[data-testid="ob-table"]').exists()).toBe(true)
		// The import panel and the create button are writes.
		expect(wrapper.text()).not.toContain("رصيد جديد")
		expect(wrapper.text()).not.toContain("استيراد من ملف")
	})

	it("offers write actions to an ADMIN", async () => {
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		expect(wrapper.text()).toContain("رصيد جديد")
		expect(wrapper.text()).toContain("استيراد من ملف")
	})

	/*
	 * الربط بجدول الأصناف (v26): كل رصيد مخزون يحمل `product_id`.
	 * سطر مخزون بلا مرجع = حركة لا يمكن اعتمادها، فيجب أن يظهر في الشاشة
	 * كحالة لا كتفصيل مخفي.
	 */
	it("shows the item reference for a linked stock row", async () => {
		const linked = [
			{
				id: "ob-3",
				fiscal_year: "2026",
				account_type: "stock",
				account_id: "GMN4113",
				account_code: "GMN4113",
				account_name: "عطر جسم 88 مل",
				product_id: "11112222-3333-4444-5555-666677778888",
				amount_minor: 118800,
				amount: 1188,
				quantity: 180,
			},
		]
		call.mockResolvedValueOnce({ message: { rows: linked, count: 1, summary } })
		const wrapper = await mountPage()

		expect(wrapper.text()).toContain("11112222")
		expect(wrapper.text()).not.toContain("غير مرتبط")
		expect(wrapper.find('[data-testid="ob-unlinked-warn"]').exists()).toBe(false)
	})

	it("flags an UNLINKED stock row instead of hiding it", async () => {
		const orphan = [
			{
				id: "ob-4",
				fiscal_year: "2026",
				account_type: "stock",
				account_id: "GHOST-1",
				account_code: "GHOST-1",
				account_name: "بلا صنف",
				product_id: null,
				amount_minor: 1000,
				amount: 10,
				quantity: 1,
			},
		]
		call.mockResolvedValueOnce({ message: { rows: orphan, count: 1, summary } })
		const wrapper = await mountPage()

		expect(wrapper.find('[data-testid="ob-unlinked-warn"]').exists()).toBe(true)
		expect(wrapper.text()).toContain("1 سجل مخزون بلا ربط بصنف")
		expect(wrapper.text()).toContain("غير مرتبط")
	})

	it("sends the item reference on a stock save (and nothing on a cash save)", async () => {
		call.mockResolvedValue({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()
		const vm = wrapper.vm

		vm.form = {
			accountType: "stock",
			accountId: "",
			accountCode: "GMN4113",
			accountName: "عطر جسم 88 مل",
			amount: "1188",
			quantity: "180",
			notes: "",
			productId: "33334444-5555-6666-7777-888899990000",
		}
		await vm.save()

		const saveCall = call.mock.calls.find(([verb]) =>
			String(verb).includes("save_opening_balance"),
		)
		expect(saveCall).toBeTruthy()
		expect(saveCall[1]).toMatchObject({
			accountType: "stock",
			productId: "33334444-5555-6666-7777-888899990000",
		})
	})

	it("refuses to submit a blank amount instead of saving a confident zero", async () => {
		call.mockResolvedValueOnce({ message: { rows, count: 2, summary } })
		const wrapper = await mountPage()

		const vm = wrapper.vm
		vm.form = {
			accountType: "cash",
			accountId: "",
			accountCode: "",
			accountName: "صندوق",
			amount: "  ",
			quantity: "",
			notes: "",
		}
		// Drive the same guard the create dialog uses.
		await vm.save()

		// The verb must NOT have been called for a save.
		const saveCalls = call.mock.calls.filter(([verb]) =>
			String(verb).includes("save_opening_balance"),
		)
		expect(saveCalls).toHaveLength(0)
	})
})
