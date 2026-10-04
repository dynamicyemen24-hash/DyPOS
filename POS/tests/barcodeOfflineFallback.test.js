import { beforeEach, describe, expect, it, vi } from "vitest"

const localItems = [
	{ item_code: "A1", barcode: "123", sku: "A1", name: "صنف محلي" },
]

vi.mock("@/stores/itemSearch", () => ({
	useItemSearchStore: vi.fn(),
}))

import { useItemSearchStore } from "@/stores/itemSearch"
import { handleScan } from "@/utils/barcode-service"

describe("handleScan offline-first", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("يجد الصنف المحلي دون لمس الشبكة", async () => {
		const searchByBarcode = vi.fn()
		vi.mocked(useItemSearchStore).mockReturnValue({
			items: localItems,
			searchByBarcode,
		})
		const result = await handleScan("123")
		expect(result.found).toBe(true)
		expect(result.product.item_code).toBe("A1")
		expect(searchByBarcode).not.toHaveBeenCalled()
	})

	it("يعيد غيابًا صادقًا دون رمي عند فشل الشبكة", async () => {
		const searchByBarcode = vi.fn().mockRejectedValue(new Error("offline"))
		vi.mocked(useItemSearchStore).mockReturnValue({
			items: localItems,
			searchByBarcode,
		})
		const result = await handleScan("999")
		expect(result).toEqual({ found: false, product: null })
	})

	it("يرفض المدخل الفارغ دون شبكة", async () => {
		const searchByBarcode = vi.fn()
		vi.mocked(useItemSearchStore).mockReturnValue({
			items: localItems,
			searchByBarcode,
		})
		const result = await handleScan("   ")
		expect(result.found).toBe(false)
		expect(searchByBarcode).not.toHaveBeenCalled()
	})
})
