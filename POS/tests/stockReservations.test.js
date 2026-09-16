import { beforeEach, describe, expect, it } from "vitest"

/**
 * In-memory fake matching the Dexie surface used by stock-reservations,
 * including compound-index queries ([a+b] where equals([v1, v2])).
 */
function createTable() {
	const rows = new Map()
	let autoId = 0
	const table = {
		rows,
		async toArray() {
			return Array.from(rows.values())
		},
		where(field) {
			const isCompound = field.startsWith("[") && field.includes("+")
			const parts = isCompound
				? field
						.slice(1, -1)
						.split("+")
						.map((p) => p.trim())
				: null
			return {
				equals(value) {
					return {
						async toArray() {
							return Array.from(rows.values()).filter((row) => {
								if (isCompound) {
									return (
										String(row[parts[0]]) === String(value[0]) &&
										String(row[parts[1]]) === String(value[1])
									)
								}
								return String(row[field]) === String(value)
							})
						},
					}
				},
			}
		},
		async bulkAdd(newRows) {
			const ids = []
			for (const row of newRows) {
				const id = ++autoId
				rows.set(id, { ...row, id })
				ids.push(id)
			}
			return ids
		},
		async bulkPut(updated) {
			for (const row of updated) rows.set(row.id, { ...row })
			return updated.length
		},
		async clear() {
			rows.clear()
		},
	}
	return table
}

function createStore() {
	const tables = {
		reservations: createTable(),
		stock: createTable(),
		settings: createTable(),
	}
	return {
		...tables,
		async transaction(_mode, _table, fn) {
			return fn()
		},
		tables,
	}
}

import {
	RESERVATION_STATUS,
	StockReservationError,
	commitReservation,
	getAvailableStock,
	getPhysicalStockMap,
	getReservedQty,
	releaseExpiredReservations,
	releaseReservation,
	reserveStock,
} from "@/services/stock-reservations"

describe("stock reservations — الحجوزات الأوفلاين", () => {
	let store

	beforeEach(() => {
		store = createStore()
	})

	it("يحجز الكمية ويحسبها ضمن المحجوز", async () => {
		const now = Date.now()
		const { reserved } = await reserveStock({
			invoiceId: "POS-BR-T1-1",
			items: [{ itemId: "ITEM-1", qty: 3 }],
			physicalStock: { "ITEM-1": 10 },
			store,
			now,
		})

		expect(reserved).toHaveLength(1)
		expect(await getReservedQty("ITEM-1", store, now)).toBe(3)
		expect(await getAvailableStock("ITEM-1", 10, store, now)).toBe(7)
	})

	it("يرفض الحجز عند نقص الكمية مع تفاصيل الصنف", async () => {
		await expect(
			reserveStock({
				invoiceId: "POS-BR-T1-2",
				items: [{ itemId: "ITEM-1", qty: 11 }],
				physicalStock: { "ITEM-1": 10 },
				store,
			}),
		).rejects.toBeInstanceOf(StockReservationError)
	})

	it("يجمع الكميات المكررة لنفس الصنف قبل التحقق", async () => {
		await expect(
			reserveStock({
				invoiceId: "POS-BR-T1-3",
				items: [
					{ itemId: "ITEM-1", qty: 6 },
					{ itemId: "ITEM-1", qty: 6 },
				],
				physicalStock: { "ITEM-1": 10 },
				store,
			}),
		).rejects.toThrow(/ITEM-1/)
	})

	it("يمنع بيع نفس الوحدات من عمليتين مختلفتين", async () => {
		await reserveStock({
			invoiceId: "SALE-A",
			items: [{ itemId: "ITEM-1", qty: 8 }],
			physicalStock: { "ITEM-1": 10 },
			store,
		})

		// العملية الثانية ترى فقط 2 متبقية بعد حجز الأولى
		expect(await getAvailableStock("ITEM-1", 10, store)).toBe(2)
		await expect(
			reserveStock({
				invoiceId: "SALE-B",
				items: [{ itemId: "ITEM-1", qty: 3 }],
				physicalStock: { "ITEM-1": 10 },
				store,
			}),
		).rejects.toBeInstanceOf(StockReservationError)
	})

	it("يحرر الحجز عند الإلغاء فيعود المخزون متاحًا", async () => {
		await reserveStock({
			invoiceId: "SALE-A",
			items: [{ itemId: "ITEM-1", qty: 5 }],
			physicalStock: { "ITEM-1": 10 },
			store,
		})
		expect(await releaseReservation("SALE-A", store)).toBe(1)
		expect(await getReservedQty("ITEM-1", store)).toBe(0)
		expect(await getAvailableStock("ITEM-1", 10, store)).toBe(10)
	})

	it("يثبّت الحجز عند نجاح البيع ويبقيه خارج المتاح", async () => {
		await reserveStock({
			invoiceId: "SALE-A",
			items: [{ itemId: "ITEM-1", qty: 5 }],
			physicalStock: { "ITEM-1": 10 },
			store,
		})
		expect(await commitReservation("SALE-A", store)).toBe(1)
		expect(await getReservedQty("ITEM-1", store)).toBe(0)
		const statuses = Array.from(store.tables.reservations.rows.values()).map(
			(row) => row.status,
		)
		expect(statuses).toEqual([RESERVATION_STATUS.COMMITTED])
	})

	it("يحرر تلقائيًا الحجوزات المنتهية الصلاحية", async () => {
		await reserveStock({
			invoiceId: "SALE-OLD",
			items: [{ itemId: "ITEM-1", qty: 5 }],
			physicalStock: { "ITEM-1": 10 },
			store,
			ttlMs: 1000,
			now: 1_000_000,
		})

		// بعد انتهاء الصلاحية (بأكثر من ttl) يُفرغ الحجز
		const released = await releaseExpiredReservations({
			store,
			now: 1_002_000,
		})
		expect(released).toBe(1)
		expect(await getReservedQty("ITEM-1", store, 1_002_000)).toBe(0)
	})

	it("يقرأ المخزون الفعلي من الكاش المحلي ويتجاهل الأصناف غير الموجودة", async () => {
		await store.tables.stock.bulkAdd([
			{ itemId: "ITEM-1", qty: 4 },
			{ itemId: "ITEM-1", qty: 6 },
		])

		const map = await getPhysicalStockMap(store, ["ITEM-1", "UNKNOWN"])
		expect(map["ITEM-1"]).toBe(10)
		expect(map.UNKNOWN).toBe(Number.POSITIVE_INFINITY)
	})

	it("يرفض حجزًا بلا معرّف عملية أو بلا أصناف", async () => {
		await expect(
			reserveStock({ items: [{ itemId: "X", qty: 1 }], store }),
		).rejects.toBeInstanceOf(StockReservationError)
		await expect(
			reserveStock({ invoiceId: "S", items: [], store }),
		).rejects.toBeInstanceOf(StockReservationError)
	})
})
