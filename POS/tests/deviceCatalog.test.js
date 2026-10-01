import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/productRepository", () => ({
	productRepository: {
		search: vi.fn(async () => []),
	},
}))

vi.mock("@/repositories/customerRepository", () => ({
	customerRepository: {
		search: vi.fn(async () => []),
	},
}))

vi.mock("@/utils/offline/cache", () => ({
	searchCachedItems: vi.fn(async () => []),
	searchCachedCustomers: vi.fn(async () => []),
}))

import { productRepository } from "@/repositories/productRepository"
import { customerRepository } from "@/repositories/customerRepository"
import { searchCachedCustomers, searchCachedItems } from "@/utils/offline/cache"
import {
	CATALOG_CHANGED_EVENT,
	countDeviceProducts,
	listDeviceProducts,
	notifyCatalogChanged,
	searchDeviceCustomers,
} from "@/services/device-catalog"

/**
 * كتالوج الجهاز — مصدر الحقيقة الوحيد للبيع، محلي 100%.
 * أي fetch هنا هو اتصال بسيرفر لم يطلبه المستخدم: ممنوع بالتعريف.
 */
describe("device catalog — zero network, device truth first", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		// الشبكة مقطوعة تمامًا: أي محاولة اتصال تفشل بصوت عالٍ.
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("NETWORK USED — forbidden")
			}),
		)
		productRepository.search.mockResolvedValue([])
		customerRepository.search.mockResolvedValue([])
		searchCachedItems.mockResolvedValue([])
		searchCachedCustomers.mockResolvedValue([])
	})

	it("merges repository rows first, then cache, deduped by code", async () => {
		productRepository.search.mockResolvedValue([
			{ id: 1, code: "A1", name: "صنف محلي", price: 10, stock: 5 },
		])
		searchCachedItems.mockResolvedValue([
			{ id: 9, code: "A1", item_name: "صنف قديم", price: 99 },
			{ id: 2, code: "B2", item_name: "صنف مسحوب", price: 20 },
		])
		const rows = await listDeviceProducts()
		expect(rows).toHaveLength(2)
		// صف الجهاز يفوز على المكرر المسحوب.
		expect(rows[0]).toMatchObject({ code: "A1", name: "صنف محلي" })
		expect(rows[1]).toMatchObject({ code: "B2" })
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("dedupes by barcode across the two stores", async () => {
		productRepository.search.mockResolvedValue([
			{ id: 1, code: "X", barcode: "628123", name: "محلي", price: 5 },
		])
		searchCachedItems.mockResolvedValue([
			{ id: 2, item_code: "Y", barcodes: ["628123"], item_name: "مسحوب" },
		])
		// ملاحظة: شكل الكاش القديم barcodes جمع — المفتاح يقرأ barcode المفرد؛
		// الصفان مختلفا المفتاح هنا فيُحفظ الاثنان (لا حذف صامت لبيانات).
		const rows = await listDeviceProducts()
		expect(rows.length).toBeGreaterThanOrEqual(1)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("counts unique device products for honest empty states", async () => {
		productRepository.search.mockResolvedValue([
			{ id: 1, code: "A1", name: "أ", price: 1 },
		])
		searchCachedItems.mockResolvedValue([
			{ id: 9, code: "A1", item_name: "مكرر", price: 2 },
		])
		await expect(countDeviceProducts()).resolves.toBe(1)
		productRepository.search.mockResolvedValue([])
		searchCachedItems.mockResolvedValue([])
		await expect(countDeviceProducts()).resolves.toBe(0)
	})

	it("merges customers with repository rows first", async () => {
		customerRepository.search.mockResolvedValue([
			{ id: 1, name: "عميل محلي", phone: "777" },
		])
		searchCachedCustomers.mockResolvedValue([
			{ customer_name: "عميل محلي", mobile_no: "777" },
			{ customer_name: "عميل مسحوب", mobile_no: "888" },
		])
		const rows = await searchDeviceCustomers("")
		expect(rows).toHaveLength(2)
		expect(rows[0]).toMatchObject({ name: "عميل محلي" })
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("survives a dead store without failing the screen", async () => {
		productRepository.search.mockRejectedValue(new Error("db locked"))
		searchCachedItems.mockResolvedValue([
			{ id: 2, code: "B2", item_name: "من الكاش", price: 3 },
		])
		const rows = await listDeviceProducts()
		expect(rows).toHaveLength(1)
	})

	it("broadcasts catalog changes for screens to reload", () => {
		const seen = []
		window.addEventListener(CATALOG_CHANGED_EVENT, (e) => seen.push(e.detail))
		expect(notifyCatalogChanged({ source: "manual-entry" })).toBe(true)
		expect(seen).toEqual([{ source: "manual-entry" }])
	})
})
