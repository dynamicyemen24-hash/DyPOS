import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createSmartCashierEngine } from "@/utils/smartCashier"

// =============================================================================
// Mocks
// =============================================================================

function createMemoryStorage() {
	const map = new Map()

	return {
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => {
			map.set(key, String(value))
		},
		removeItem: (key) => {
			map.delete(key)
		},
		_clear: () => map.clear(),
	}
}

function catalogOf(ids) {
	return ids.map((id) => ({ id, name: `P-${id}`, price: 10 }))
}

// =============================================================================
// Fixtures
// =============================================================================

const DAY = 86400000

describe("smartCashier engine", () => {
	let storage

	beforeEach(() => {
		storage = createMemoryStorage()
	})

	afterEach(() => {
		storage._clear()
	})

	it("يبدأ بحالة فارغة دون أي تخزين", () => {
		const engine = createSmartCashierEngine()

		expect(engine.getShiftPulse().invoicesToday).toBe(0)
		expect(engine.getQuickSell(catalogOf(["A"]))).toEqual([])
		expect(engine.suggestCrossSell([], catalogOf(["A"]))).toEqual([])
	})

	it("recordSale يغذي الارتباطات «يُشترى غالبًا مع»", () => {
		const engine = createSmartCashierEngine({ storage })

		engine.recordSale(
			[
				{ productId: "bread", quantity: 1 },
				{ productId: "cheese", quantity: 1 },
			],
			{ total: 20 },
		)
		engine.recordSale(
			[
				{ productId: "bread", quantity: 2 },
				{ productId: "cheese", quantity: 1 },
			],
			{ total: 30 },
		)
		engine.recordSale(
			[
				{ productId: "bread", quantity: 1 },
				{ productId: "milk", quantity: 1 },
			],
			{ total: 15 },
		)

		const suggestions = engine.suggestCrossSell(
			[{ productId: "bread" }],
			catalogOf(["cheese", "milk", "water"]),
			5,
		)

		expect(suggestions.length).toBeGreaterThan(0)
		expect(suggestions[0].product.id).toBe("cheese")
		expect(suggestions[0].reason).toContain("bread")
	})

	it("لا يقترح أصناف موجودة في السلة أصلاً", () => {
		const engine = createSmartCashierEngine({ storage })

		engine.recordSale(
			[
				{ productId: "a", quantity: 1 },
				{ productId: "b", quantity: 1 },
			],
			{ total: 10 },
		)

		const suggestions = engine.suggestCrossSell(
			[{ productId: "a" }],
			catalogOf(["a", "b"]),
			5,
		)

		expect(suggestions.some((entry) => entry.product.id === "a")).toBe(false)
		expect(suggestions[0].product.id).toBe("b")
	})

	it("getQuickSell يرتب حسب المبيعات مع اضمحلال زمني", () => {
		let clock = DAY

		const engine = createSmartCashierEngine({
			storage,
			now: () => clock,
		})

		engine.recordSale([{ productId: "old", quantity: 1 }], { total: 5 })

		clock = DAY * 40

		engine.recordSale([{ productId: "fresh", quantity: 1 }], { total: 5 })

		clock = DAY * 41

		const quick = engine.getQuickSell(catalogOf(["old", "fresh"]), 5)

		expect(quick.length).toBe(2)
		expect(quick[0].product.id).toBe("fresh")
	})

	it("recordInteraction يرفع نقاط الاستخدام", () => {
		const engine = createSmartCashierEngine({ storage })

		engine.recordInteraction({ id: "x", name: "X" })
		engine.recordInteraction({ id: "x", name: "X" })

		const quick = engine.getQuickSell(catalogOf(["x", "y"]), 5)

		expect(quick.length).toBe(1)
		expect(quick[0].product.id).toBe("x")
		expect(quick[0].reason).toContain("مُستخدَم")
	})

	it("getAlerts يكشف المخزون المنخفض والنفاد", () => {
		const engine = createSmartCashierEngine()

		const alerts = engine.getAlerts([
			{ productId: "a", name: "عصير", quantity: 2, stock: 0, unitPrice: 5 },
		])

		expect(alerts.length).toBe(1)
		expect(alerts[0].severity).toBe("danger")
		expect(alerts[0].title).toBe("المخزون نفد")
	})

	it("getAlerts يكشف الكميات الشاذة والخصم المرتفع", () => {
		const engine = createSmartCashierEngine()

		const alerts = engine.getAlerts(
			[{ productId: "b", name: "ماء", quantity: 25, unitPrice: 1 }],
			{ discountAmount: 30, subtotal: 100 },
		)

		const titles = alerts.map((alert) => alert.title)

		expect(titles).toContain("كمية كبيرة")
		expect(titles).toContain("خصم مرتفع")
	})

	it("getShiftPulse يحسب فواتير اليوم ومتوسط الفاتورة", () => {
		const clock = DAY + 3600000 // اليوم 10 صباحًا

		const engine = createSmartCashierEngine({
			storage,
			now: () => clock,
		})

		engine.recordSale([{ productId: "a", quantity: 1 }], { total: 50 })
		engine.recordSale([{ productId: "b", quantity: 1 }], { total: 100 })

		const pulse = engine.getShiftPulse()

		expect(pulse.invoicesToday).toBe(2)
		expect(pulse.revenueToday).toBe(150)
		expect(pulse.avgBasket).toBe(75)
		expect(pulse.invoicesPerHour).not.toBeNull()
	})

	it("getCartHealth يعيد 100 لسلة سليمة ويخفض مع المخاطر", () => {
		const engine = createSmartCashierEngine()

		const healthy = engine.getCartHealth([
			{ productId: "a", quantity: 1, unitPrice: 10, stock: 50 },
			{ productId: "b", quantity: 1, unitPrice: 10, stock: 50 },
		])

		expect(healthy).toBe(100)

		const risky = engine.getCartHealth([
			{ productId: "a", quantity: 2, unitPrice: 10, stock: 0 },
		])

		expect(risky).toBeLessThan(100)
		expect(risky).toBeGreaterThanOrEqual(0)
	})

	it("يحفظ ويعيد تحميل الحالة من التخزين (استمرارية عبر الجلسات)", () => {
		const first = createSmartCashierEngine({ storage })

		first.recordSale(
			[
				{ productId: "bread", quantity: 1 },
				{ productId: "cheese", quantity: 1 },
			],
			{ total: 20 },
		)

		const second = createSmartCashierEngine({ storage })

		const suggestions = second.suggestCrossSell(
			[{ productId: "bread" }],
			catalogOf(["cheese"]),
			5,
		)

		expect(suggestions.length).toBe(1)
		expect(suggestions[0].product.id).toBe("cheese")
	})

	it("يتجاهل بيانات التخزين التالفة بأمان", () => {
		storage.setItem("dypos-smart-cashier-v1", "{corrupted-json")

		const engine = createSmartCashierEngine({ storage })

		expect(engine.getShiftPulse().invoicesToday).toBe(0)
	})

	it("reset يعيد الحالة إلى الصفر", () => {
		const engine = createSmartCashierEngine({ storage })

		engine.recordSale([{ productId: "a", quantity: 1 }], { total: 5 })

		engine.reset()

		expect(engine.getShiftPulse().invoicesToday).toBe(0)
	})

	// =========================================================================
	// النقد الذكي — Smart Cash Tender
	// =========================================================================

	describe("suggestCashTender", () => {
		it("يقترح المبلغ كاملًا أولًا ثم فئات ورقية أعلى من المطلوب", () => {
			const engine = createSmartCashierEngine({
				cashUnits: [1, 5, 10, 20, 50, 100],
			})

			const suggestions = engine.suggestCashTender(37)

			expect(suggestions[0].source).toBe("exact")
			expect(suggestions[0].amount).toBe(37)
			expect(suggestions[0].change).toBe(0)

			const amounts = suggestions.map((item) => item.amount)

			// 37 → 40 (فئة 10) → 50 (فئة 50) → 100 (فئة 100)
			expect(amounts).toEqual([37, 40, 50, 100])
		})

		it("لا يقترح أبدًا مبلغًا أقل من المطلوب", () => {
			const engine = createSmartCashierEngine({ cashUnits: [5, 10] })

			const suggestions = engine.suggestCashTender(12)

			for (const suggestion of suggestions) {
				expect(suggestion.amount).toBeGreaterThanOrEqual(12)
				expect(suggestion.change).toBeGreaterThanOrEqual(0)
			}
		})

		it("يحسب الباقي بدقة نقدية (بلا أخطاء عائمة)", () => {
			const engine = createSmartCashierEngine({ cashUnits: [0.5, 1, 5] })

			const suggestions = engine.suggestCashTender(11.75)

			for (const suggestion of suggestions) {
				expect(suggestion.amount - 11.75).toBeCloseTo(suggestion.change, 6)
			}
		})

		it("يتعلم «الفئة المعتادة» من التحصيل الفعلي ويقترحها بوسم learned", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 5, 10, 50] })

			// المتجر يحصّل فئة 50 بعدد كافٍ من المرات.
			engine.learnTender(55)
			engine.learnTender(60)

			const suggestions = engine.suggestCashTender(37)
			const learned = suggestions.find((item) => item.source === "learned")

			expect(learned).toBeDefined()
			expect(learned.amount).toBe(50)
			expect(learned.label).toContain("50")
		})

		it("لا يوسم أي فئة كـ learned قبل وجود تعلّم كافٍ", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 5, 10] })

			engine.learnTender(5)

			const suggestions = engine.suggestCashTender(8)

			expect(suggestions.some((item) => item.source === "learned")).toBe(false)
		})

		it("يحترم حد الاقتراحات وأولوية التخصيص", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 5, 10, 20, 50] })

			const suggestions = engine.suggestCashTender(37, { limit: 2 })

			expect(suggestions.length).toBe(2)
			expect(suggestions[0].source).toBe("exact")
		})

		it("آمن مع المبالغ غير الصالحة وغياب الفئات", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 5] })

			expect(engine.suggestCashTender(0)).toEqual([])
			expect(engine.suggestCashTender(-10)).toEqual([])
			expect(engine.suggestCashTender(null)).toEqual([])
			expect(engine.suggestCashTender(10, { units: [] })).toEqual([])

			const noUnits = createSmartCashierEngine({ cashUnits: [] })

			expect(noUnits.suggestCashTender(10)).toEqual([])
		})

		it("يستخدم الفئات الافتراضية عند عدم تمرير فئات المتجر", () => {
			const engine = createSmartCashierEngine()

			const amounts = engine.suggestCashTender(120).map((item) => item.amount)

			expect(amounts[0]).toBe(120)
			expect(amounts).toContain(200)
		})
	})

	describe("learnTender", () => {
		it("يُرجع الفئة المُتعلَّمة ويرفض المدخلات غير الصالحة", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 5, 10, 50] })

			expect(engine.learnTender(55)).toBe(50)
			expect(engine.learnTender(0)).toBeNull()
			expect(engine.learnTender("غير رقم")).toBeNull()
			expect(engine.learnTender(undefined)).toBeNull()
		})

		it("يحفظ تعلّم الفئات عبر الجلسات (استمرارية التخزين)", () => {
			const first = createSmartCashierEngine({
				storage,
				cashUnits: [1, 10, 100],
			})

			first.learnTender(120)
			first.learnTender(140)

			const second = createSmartCashierEngine({
				storage,
				cashUnits: [1, 10, 100],
			})

			const learned = second
				.suggestCashTender(85)
				.find((item) => item.source === "learned")

			expect(learned).toBeDefined()
			expect(learned.amount).toBe(100)
		})

		it("يتجاهل تعلّم الفئات عند عدم وجود فئات صالحة", () => {
			const engine = createSmartCashierEngine({ cashUnits: [-5, 0, null] })

			expect(engine.learnTender(50)).toBeNull()
		})

		it("reset يمحو تعلّم الفئات أيضًا", () => {
			const engine = createSmartCashierEngine({ cashUnits: [1, 50] })

			engine.learnTender(55)
			engine.learnTender(60)

			engine.reset()

			const learned = engine
				.suggestCashTender(37)
				.find((item) => item.source === "learned")

			expect(learned).toBeUndefined()
		})
	})

	// =========================================================================
	// اتجاه الساعات — Hourly Trend
	// =========================================================================

	/** طابع زمني محلي لليوم عند ساعة محددة (مستقل عن المنطقة الزمنية). */
	function todayAt(hour) {
		const date = new Date()

		date.setHours(hour, 0, 0, 0)

		return date.getTime()
	}

	describe("getHourlyTrend", () => {
		it("يوزّع فواتير اليوم على الساعات ويحدد ساعة الذروة", () => {
			const morning = createSmartCashierEngine({
				storage,
				now: () => todayAt(9),
			})

			// 3 فواتير في الساعة 9.
			morning.recordSale([{ productId: "a", quantity: 1 }], { total: 10 })
			morning.recordSale([{ productId: "b", quantity: 1 }], { total: 20 })
			morning.recordSale([{ productId: "c", quantity: 1 }], { total: 30 })

			// فاتورة في الساعة 14 عبر محرك على نفس التخزين بساعة لاحقة.
			const afternoon = createSmartCashierEngine({
				storage,
				now: () => todayAt(14),
			})

			afternoon.recordSale([{ productId: "d", quantity: 1 }], { total: 40 })

			const trend = afternoon.getHourlyTrend()

			expect(trend.hours.length).toBe(24)
			expect(trend.invoicesToday).toBe(4)
			expect(trend.hours[9].invoices).toBe(3)
			expect(trend.hours[9].revenue).toBe(60)
			expect(trend.hours[14].invoices).toBe(1)
			expect(trend.peakHour).toBe(9)
			expect(trend.peakInvoices).toBe(3)
		})

		it("يعيد صفرًا وnull في يوم بلا مبيعات", () => {
			const engine = createSmartCashierEngine({ storage })

			const trend = engine.getHourlyTrend()

			expect(trend.invoicesToday).toBe(0)
			expect(trend.peakHour).toBeNull()
			expect(trend.peakInvoices).toBe(0)
			expect(trend.hours.every((bucket) => bucket.invoices === 0)).toBe(true)
		})

		it("يتجاهل فواتير الأمس (اليوم فقط)", () => {
			const historical = createSmartCashierEngine({
				storage,
				now: () => todayAt(3) - DAY,
			})

			historical.recordSale([{ productId: "a", quantity: 1 }], { total: 10 })

			const live = createSmartCashierEngine({
				storage,
				now: () => todayAt(3),
			})

			live.recordSale([{ productId: "b", quantity: 1 }], { total: 10 })

			const trend = live.getHourlyTrend()

			expect(trend.invoicesToday).toBe(1)
			expect(trend.peakHour).toBe(3)
		})
	})

	// =========================================================================
	// فرص الرف — Shelf Opportunities
	// =========================================================================

	describe("getPairOpportunities", () => {
		it("يعيد أقوى الارتباطات فوق الحد الأدنى فقط", () => {
			const engine = createSmartCashierEngine({ storage })

			// خبز+جبنة ×3 — خبز+حليب ×1 (تحت الحد).
			for (let index = 0; index < 3; index += 1) {
				engine.recordSale(
					[
						{ productId: "bread", name: "خبز", quantity: 1 },
						{ productId: "cheese", name: "جبنة", quantity: 1 },
					],
					{ total: 20 },
				)
			}

			engine.recordSale(
				[
					{ productId: "bread", name: "خبز", quantity: 1 },
					{ productId: "milk", name: "حليب", quantity: 1 },
				],
				{ total: 15 },
			)

			const opportunities = engine.getPairOpportunities(
				catalogOf(["bread", "cheese", "milk"]),
			)

			expect(opportunities.length).toBe(1)
			expect(opportunities[0].productA.name).toBe("خبز")
			expect(opportunities[0].productB.name).toBe("جبنة")
			expect(opportunities[0].count).toBe(3)
		})

		it("يرتب الأزواج حسب القوة ويحترم الحد", () => {
			const engine = createSmartCashierEngine({ storage })

			for (let index = 0; index < 5; index += 1) {
				engine.recordSale(
					[
						{ productId: "a", quantity: 1 },
						{ productId: "b", quantity: 1 },
					],
					{ total: 10 },
				)
			}

			for (let index = 0; index < 3; index += 1) {
				engine.recordSale(
					[
						{ productId: "c", quantity: 1 },
						{ productId: "d", quantity: 1 },
					],
					{ total: 10 },
				)
			}

			const opportunities = engine.getPairOpportunities(
				catalogOf(["a", "b", "c", "d"]),
				1,
			)

			expect(opportunities.length).toBe(1)
			expect(opportunities[0].count).toBe(5)
		})

		it("يقصر النتائج على الكتالوج الممرر", () => {
			const engine = createSmartCashierEngine({ storage })

			for (let index = 0; index < 3; index += 1) {
				engine.recordSale(
					[
						{ productId: "x", quantity: 1 },
						{ productId: "y", quantity: 1 },
					],
					{ total: 10 },
				)
			}

			// الكتالوج لا يحوي "y" — الزوج يُستبعد.
			expect(engine.getPairOpportunities(catalogOf(["x"]))).toEqual([])

			// بلا كتالوج: يعرض الزوج بأسماء محفوظة أو معرفات.
			const open = engine.getPairOpportunities([], 5)

			expect(open.length).toBe(1)
			expect(open[0].productA.id).toBe("x")
		})

		it("آمن مع مدخلات غير صالحة", () => {
			const engine = createSmartCashierEngine({ storage })

			expect(engine.getPairOpportunities(null)).toEqual([])
			expect(engine.getPairOpportunities("غير مصفوفة")).toEqual([])
		})
	})

	// =========================================================================
	// مزامنة التعلّم — exportState / importState
	// =========================================================================

	describe("exportState/importState", () => {
		it("يدمج تعلّم طرفية أخرى (مبيعات + ارتباطات + فئات نقدية)", () => {
			// الطرفية (أ): خبز+جبنة ×2 وفئة نقدية 50 — تخزين وساعة مستقلان.
			const terminalA = createSmartCashierEngine({
				cashUnits: [1, 50],
				now: () => DAY,
			})

			for (let index = 0; index < 2; index += 1) {
				terminalA.recordSale(
					[
						{ productId: "bread", name: "خبز", quantity: 1 },
						{ productId: "cheese", name: "جبنة", quantity: 1 },
					],
					{ total: 20 },
				)
			}

			terminalA.learnTender(55)

			// الطرفية (ب): محلية بساعة لاحقة تستورد تعلّم (أ).
			const terminalB = createSmartCashierEngine({
				storage,
				cashUnits: [1, 50],
				now: () => DAY + 5000,
			})

			terminalB.recordSale(
				[
					{ productId: "bread", name: "خبز", quantity: 1 },
					{ productId: "cheese", name: "جبنة", quantity: 1 },
				],
				{ total: 20 },
			)

			const result = terminalB.importState(terminalA.exportState())

			expect(result.merged).toBe(true)
			expect(result.products).toBe(2)
			expect(result.pairs).toBe(1)
			expect(result.sales).toBe(2)

			// مبيعات الخبز جُمعت عبر الطرفيتين (1 + 2).
			const quick = terminalB.getQuickSell(catalogOf(["bread", "cheese"]), 5)

			expect(quick[0].product.id).toBe("bread")

			// الرابطة 2+1 = 3 → فرصة رف جاهزة فورًا بعد الدمج.
			const opportunities = terminalB.getPairOpportunities(
				catalogOf(["bread", "cheese"]),
			)

			expect(opportunities.length).toBe(1)
			expect(opportunities[0].count).toBe(3)

			// تعلّم الفئة النقدية انتقل أيضًا (1 من (أ) + 1 محلي → حسم).
			terminalB.learnTender(60)

			const learned = terminalB
				.suggestCashTender(37)
				.find((item) => item.source === "learned")

			expect(learned).toBeDefined()
			expect(learned.amount).toBe(50)
		})

		it("يزيل التكرار في سجل المبيعات عند الدمج المتكرر", () => {
			// المصدر بلا تخزين مشترك — لا يحمّل حالة الهدف.
			const source = createSmartCashierEngine({
				now: () => DAY,
			})

			source.recordSale([{ productId: "a", quantity: 1 }], { total: 10 })

			const target = createSmartCashierEngine({
				storage,
				now: () => DAY + 5000,
			})

			target.importState(source.exportState())

			const first = target.getShiftPulse().invoicesToday

			// دمج نفس اللقطة مرة أخرى — لا تكرار.
			target.importState(source.exportState())

			expect(target.getShiftPulse().invoicesToday).toBe(first)
		})

		it("وضع replace يستبدل الحالة بدل الدمج", () => {
			const target = createSmartCashierEngine({ storage })

			target.recordSale([{ productId: "old", quantity: 1 }], { total: 10 })

			// المصدر بلا تخزين مشترك — لا يعرف «old» إطلاقًا.
			const source = createSmartCashierEngine()

			source.recordSale([{ productId: "new", quantity: 1 }], { total: 10 })

			target.importState(source.exportState(), { mode: "replace" })

			const quick = target.getQuickSell(catalogOf(["old", "new"]), 5)

			expect(quick.length).toBe(1)
			expect(quick[0].product.id).toBe("new")
		})

		it("آمن مع مدخلات غير صالحة", () => {
			const engine = createSmartCashierEngine({ storage })

			expect(engine.importState(null).merged).toBe(false)
			expect(engine.importState("نص").merged).toBe(false)
			expect(engine.importState(undefined).merged).toBe(false)

			const snapshot = engine.exportState()

			expect(snapshot.products).toEqual({})
			expect(snapshot.pairs).toEqual({})
			expect(snapshot.salesLog).toEqual([])
			expect(snapshot.tenders).toEqual({})
		})
	})
})
