import { beforeEach, describe, expect, it } from "vitest"
import {
	flushOpenInvoices,
	persistOpenInvoices,
	readOpenInvoices,
	resetOpenInvoicesPersistence,
	sanitizeInvoiceList,
} from "@/utils/openInvoicesStore"

const inv = (id) => ({
	id,
	label: id,
	createdAt: new Date(1000).toISOString(),
	cart: [{ quantity: 1, unitPrice: 5, discount: 0, taxRate: 0 }],
	customer: null,
	discountType: "amount",
	discountValue: 0,
	paymentMethod: "cash",
	paymentAmount: "",
	saleSequence: id,
})

beforeEach(async () => {
	resetOpenInvoicesPersistence()
	try {
		localStorage.removeItem("dypos.open_invoices.v1")
	} catch {
		// Storage unavailable in this environment — mirror assertions skip.
	}
	await flushOpenInvoices([])
})

describe("sanitizeInvoiceList", () => {
	it("keeps only JSON-safe invoices with identity", () => {
		expect(sanitizeInvoiceList([inv("A"), null, { label: "x" }])).toHaveLength(
			1,
		)
		expect(sanitizeInvoiceList("nope")).toEqual([])
	})
})

describe("persist + read roundtrip", () => {
	it("flush writes and reads back every tab", async () => {
		await flushOpenInvoices([inv("A"), inv("B")])
		const rows = await readOpenInvoices()
		expect(rows.map((r) => r.id).sort()).toEqual(["A", "B"])
		expect(rows[0].cart).toHaveLength(1)
	})

	it("empty flush clears the parking lot", async () => {
		await flushOpenInvoices([inv("A")])
		await flushOpenInvoices([])
		expect(await readOpenInvoices()).toEqual([])
	})

	it("flush wins over a pending debounced write (no stale unload data)", async () => {
		persistOpenInvoices([inv("A")])
		await flushOpenInvoices([inv("A"), inv("B")])
		expect((await readOpenInvoices()).map((r) => r.id).sort()).toEqual([
			"A",
			"B",
		])
		// Let any stray debounce timer fire: the flushed state must stand.
		await new Promise((resolve) => setTimeout(resolve, 900))
		expect((await readOpenInvoices()).map((r) => r.id).sort()).toEqual([
			"A",
			"B",
		])
	}, 15000)
})
