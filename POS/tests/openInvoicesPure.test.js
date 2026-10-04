import { describe, expect, it } from "vitest"
import {
	MAX_OPEN_INVOICES,
	blankInvoiceState,
	closeInvoice,
	findInvoice,
	nextInvoiceLabel,
	parkInvoice,
	summarizeInvoice,
} from "@/utils/openInvoicesPure"

const snap = (id, extra = {}) => ({
	id,
	label: id,
	createdAt: new Date(1000).toISOString(),
	cart: [],
	customer: null,
	discountType: "amount",
	discountValue: 0,
	paymentMethod: "cash",
	paymentAmount: "",
	saleSequence: id,
	...extra,
})

describe("blankInvoiceState", () => {
	it("mirrors the sale page refs with safe defaults", () => {
		const s = blankInvoiceState("SALE-1", "فاتورة 1", 1000)
		expect(s).toMatchObject({
			id: "SALE-1",
			label: "فاتورة 1",
			cart: [],
			customer: null,
			discountType: "amount",
			discountValue: 0,
			paymentMethod: "cash",
			paymentAmount: "",
		})
	})
})

describe("nextInvoiceLabel", () => {
	it("picks the smallest free tab number", () => {
		expect(nextInvoiceLabel([])).toBe("فاتورة 1")
		expect(nextInvoiceLabel([snap("a", { label: "فاتورة 1" })])).toBe(
			"فاتورة 2",
		)
		expect(
			nextInvoiceLabel([
				snap("a", { label: "فاتورة 1" }),
				snap("c", { label: "فاتورة 3" }),
			]),
		).toBe("فاتورة 2")
	})
})

describe("parkInvoice", () => {
	it("parks a new snapshot and updates the same id in place", () => {
		const first = parkInvoice([], snap("A", { discountValue: 5 }))
		expect(first.ok).toBe(true)
		expect(first.updated).toBe(false)
		const second = parkInvoice(first.list, snap("A", { discountValue: 9 }))
		expect(second.ok).toBe(true)
		expect(second.updated).toBe(true)
		expect(second.list).toHaveLength(1)
		expect(second.list[0].discountValue).toBe(9)
	})
	it("refuses past capacity instead of silently dropping", () => {
		let list = []
		for (let i = 0; i < MAX_OPEN_INVOICES; i++) {
			const r = parkInvoice(list, snap(`I${i}`))
			expect(r.ok).toBe(true)
			list = r.list
		}
		const over = parkInvoice(list, snap("OVERFLOW"))
		expect(over.ok).toBe(false)
		expect(over.reason).toBe("capacity")
		expect(over.list).toHaveLength(MAX_OPEN_INVOICES)
	})
	it("refuses snapshots without identity", () => {
		const r = parkInvoice([], snap(""))
		expect(r.ok).toBe(false)
		expect(r.reason).toBe("missing_id")
	})
})

describe("closeInvoice / findInvoice", () => {
	it("closes by id and reports unknown ids", () => {
		const { list } = parkInvoice([], snap("A"))
		expect(closeInvoice(list, "A").ok).toBe(true)
		expect(closeInvoice(list, "A").list).toHaveLength(0)
		expect(closeInvoice(list, "GHOST").ok).toBe(false)
	})
	it("finds parked invoices without throwing", () => {
		const { list } = parkInvoice([], snap("A"))
		expect(findInvoice(list, "A")?.id).toBe("A")
		expect(findInvoice(list, "GHOST")).toBeNull()
		expect(findInvoice(null, "A")).toBeNull()
	})
})

describe("summarizeInvoice", () => {
	it("totals with the same math as the live cart", () => {
		const s = summarizeInvoice(
			snap("A", {
				cart: [
					{ quantity: 2, unitPrice: 10, discount: 0, taxRate: 15 },
					{ quantity: 1, unitPrice: 5, discount: 0, taxRate: 0 },
				],
				customer: { name: "عميل" },
			}),
		)
		expect(s.lines).toBe(2)
		expect(s.qty).toBe(3)
		expect(s.total).toBe(28)
		expect(s.customerName).toBe("عميل")
	})
	it("handles empty and malformed invoices", () => {
		expect(summarizeInvoice(snap("E")).total).toBe(0)
		expect(summarizeInvoice(null).total).toBe(0)
	})
})
