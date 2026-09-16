import { beforeEach, describe, expect, it } from "vitest"

import {
	formatOfflineInvoiceNumber,
	nextOfflineInvoiceNumber,
	peekSequence,
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
})
