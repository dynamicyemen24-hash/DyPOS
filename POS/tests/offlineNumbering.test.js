import { beforeEach, describe, expect, it } from "vitest"

import {
	formatOfflineInvoiceNumber,
	nextOfflineInvoiceNumber,
	peekSequence,
	scopedSequenceKey,
	sequenceKey,
	toYyyymmdd,
} from "@/services/offline-numbering"

/**
 * In-memory fake matching the Dexie settings-table surface used by
 * offline-numbering (get/put + atomic transaction wrapper).
 */
function createStore() {
	const settings = new Map()
	return {
		settings: {
			async get(key) {
				return settings.get(key)
			},
			async put(row) {
				settings.set(row.key, { ...row })
				return row.key
			},
		},
		_settingsMap: settings,
		async transaction(_mode, _table, fn) {
			return fn()
		},
	}
}

describe("offline numbering — الترقيم الأوفلاين المنظم", () => {
	let store

	beforeEach(() => {
		store = createStore()
	})

	it("يولّد أرقامًا متتالية ذريًا لنفس اليوم", async () => {
		const first = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T03",
			store,
		})
		const second = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T03",
			store,
		})

		expect(first.seq).toBe(1)
		expect(second.seq).toBe(2)
		expect(second.invoiceNumber).not.toBe(first.invoiceNumber)
	})

	it("يتبع الصيغة POS-{فرع}-{طرفية}-{تاريخ}-{تسلسل مُبطّن}", async () => {
		const { invoiceNumber } = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T03",
			store,
		})
		expect(invoiceNumber).toMatch(/^POS-RYD-T03-\d{8}-00001$/)
	})

	it("يبدأ التسلسل من جديد كل يوم (عداد يومي)", async () => {
		const day1 = new Date("2026-01-01T10:00:00")
		const day2 = new Date("2026-01-02T10:00:00")

		const a = await nextOfflineInvoiceNumber({ date: day1, store })
		const b = await nextOfflineInvoiceNumber({ date: day2, store })

		expect(a.seq).toBe(1)
		expect(b.seq).toBe(1)
		expect(a.invoiceNumber).not.toBe(b.invoiceNumber)
		await expect(peekSequence(toYyyymmdd(day1), store)).resolves.toBe(1)
	})

	it("ينظّف رموز الفرع والطرفية من المحارف غير الآمنة", () => {
		const number = formatOfflineInvoiceNumber({
			branch: "jedd-a#1",
			terminal: "t 5!",
			yyyymmdd: "20260915",
			seq: 42,
		})
		expect(number).toBe("POS-JEDDA1-T5-20260915-00042")
	})

	it("يستخدم قيمًا افتراضية آمنة عند غياب الفرع/الطرفية", async () => {
		const { invoiceNumber } = await nextOfflineInvoiceNumber({ store })
		expect(invoiceNumber).toMatch(/^POS-BR-T1-\d{8}-00001$/)
	})

	it("يعرض آخر تسلسل مستخدم عبر peekSequence", async () => {
		const yyyymmdd = "20260915"
		const date = new Date("2026-09-15T10:00:00")
		await nextOfflineInvoiceNumber({ date, store })
		await nextOfflineInvoiceNumber({ date, store })
		expect(await peekSequence(yyyymmdd, store)).toBe(2)
		expect(sequenceKey(yyyymmdd)).toBe("offlineInvoiceSeq:20260915")
	})

	// ── استقلالية الترقيم على مستوى كل نقطة بيع ──────────────────────────

	it("كل فرع/طرفية على نفس الجهاز له عداد مستقل لا يتقاطع", async () => {
		const date = new Date("2026-09-15T10:00:00")
		const a1 = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T01",
			date,
			store,
		})
		const b1 = await nextOfflineInvoiceNumber({
			branch: "AUH",
			terminal: "T09",
			date,
			store,
		})
		const a2 = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T01",
			date,
			store,
		})

		expect(a1.seq).toBe(1)
		expect(b1.seq).toBe(1)
		expect(a2.seq).toBe(2)
		expect(a1.invoiceNumber).not.toBe(b1.invoiceNumber)
	})

	it("مفتاح العداد يحمل الفرع والطرفية والتاريخ", () => {
		expect(
			scopedSequenceKey("20260915", { branch: "RYD", terminal: "T03" }),
		).toBe("offlineInvoiceSeq:RYD:T03:20260915")
		expect(
			scopedSequenceKey("20260915", { branch: "BR", terminal: "T1" }),
		).toBe("offlineInvoiceSeq:BR:T1:20260915")
	})

	it("وراثة العداد القديم: لا يعيد رقمًا سلّمه الجهاز قبل التحديث", async () => {
		// جهاز سلّم 42 رقمًا بالصيغة القديمة (عداد عام بالتاريخ فقط)
		await store.settings.put({
			key: sequenceKey("20260915"),
			value: 42,
		})
		const { seq } = await nextOfflineInvoiceNumber({
			branch: "RYD",
			terminal: "T03",
			date: new Date("2026-09-15T10:00:00"),
			store,
		})
		expect(seq).toBe(43)
	})

	it("نطاق لم يستخدم العداد القديم يبدأ من الصفر ولا يتأثر بفروع أخرى", async () => {
		await store.settings.put({
			key: sequenceKey("20260915"),
			value: 10,
		})
		const legacy = await nextOfflineInvoiceNumber({
			date: new Date("2026-09-15T10:00:00"),
			store,
		})
		expect(legacy.seq).toBe(11)
		// نطاق آخر يرث القيمة القديمة أيضًا (لا تكرار، والفجوة مقبولة)
		const other = await nextOfflineInvoiceNumber({
			branch: "AUH",
			terminal: "T09",
			date: new Date("2026-09-15T10:00:00"),
			store,
		})
		expect(other.seq).toBe(11)
		// ورقائمه مختلفة لأن الفرع/الطرفية مختلفتان
		expect(other.invoiceNumber).not.toBe(legacy.invoiceNumber)
	})
})
