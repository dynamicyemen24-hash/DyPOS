/**
 * Sale printing — the three print paths extracted out of `POSSale.vue`.
 *
 * The point of the extraction is not the file size: it is that all three paths
 * end in the SAME fallback chain (spool → direct print → browser print), and a
 * chain duplicated three times in a page nobody mounts is three places where
 * "the printer is down" turns into "the cashier is stuck". These tests pin the
 * chain, because the chain is the behaviour, not the plumbing.
 *
 * The dynamic imports (`@/print/index`, `@/utils/printInvoice`) are mocked per
 * test, which is also what makes the fallback reachable: in the app they only
 * fail when the spool is genuinely down.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import { createSalePrint } from "@/composables/useSalePrint"

const submitAndWait = vi.fn()
const submitPrintJob = vi.fn()
const printInvoiceByName = vi.fn()
const isLocalOnlyInvoiceName = vi.fn(() => false)
const hydrateLocalOnlyInvoice = vi.fn()

vi.mock("@/print/index", () => ({ submitAndWait, submitPrintJob }))
vi.mock("@/utils/printInvoice", () => ({
	printInvoiceByName,
	isLocalOnlyInvoiceName,
	hydrateLocalOnlyInvoice,
}))

/** A deps set with every slot filled, the way the page fills it. */
const deps = (over = {}) => ({
	completedSale: ref({ invoice_id: "INV-1" }),
	lastSaleInvoiceId: ref("INV-9"),
	getPrintSettings: () => ({ print_format: "Invoice", pos_profile: "Retail" }),
	notify: vi.fn(),
	fallbackPrint: vi.fn(),
	...over,
})

beforeEach(() => {
	vi.clearAllMocks()
	submitAndWait.mockResolvedValue({ status: "COMPLETED" })
	submitPrintJob.mockResolvedValue({ spoolNo: "SP-1" })
	printInvoiceByName.mockResolvedValue(undefined)
	isLocalOnlyInvoiceName.mockReturnValue(false)
})

describe("printReceipt", () => {
	it("queues the receipt on the spool and stops there on success", async () => {
		const d = deps()
		await createSalePrint(d).printReceipt()

		expect(submitAndWait).toHaveBeenCalledWith(
			expect.objectContaining({ docType: "invoice", docId: "INV-1" }),
			{ timeoutMs: 25000 },
		)
		// The happy path must not also print directly: that is a duplicate
		// receipt in the cashier's hand.
		expect(printInvoiceByName).not.toHaveBeenCalled()
		expect(d.fallbackPrint).not.toHaveBeenCalled()
	})

	it("falls back to the direct printer when the spool rejects", async () => {
		submitAndWait.mockRejectedValue(new Error("spool down"))
		const d = deps()

		await createSalePrint(d).printReceipt()

		expect(printInvoiceByName).toHaveBeenCalledWith("INV-1", "Invoice")
		expect(d.fallbackPrint).not.toHaveBeenCalled()
	})

	it("falls back to the browser when BOTH printers fail", async () => {
		submitAndWait.mockRejectedValue(new Error("spool down"))
		printInvoiceByName.mockRejectedValue(new Error("no printer"))
		const d = deps()

		await createSalePrint(d).printReceipt()

		// The cashier always leaves with paper. Never throw.
		expect(d.fallbackPrint).toHaveBeenCalledTimes(1)
	})

	it("treats a FAILED job as a failure, not as a printed receipt", async () => {
		// A job that comes back COMPLETED-with-an-error would be the silent
		// one: the receipt would never print and nothing would say so.
		submitAndWait.mockResolvedValue({
			status: "FAILED",
			lastError: "out of paper",
		})
		const d = deps()

		await createSalePrint(d).printReceipt()

		expect(printInvoiceByName).toHaveBeenCalled()
	})

	it("prints the browser dialog when the sale carries no invoice id", async () => {
		const d = deps({ completedSale: ref({}) })

		await createSalePrint(d).printReceipt()

		expect(submitAndWait).not.toHaveBeenCalled()
		expect(d.fallbackPrint).toHaveBeenCalledTimes(1)
	})
})

describe("printLastInvoice", () => {
	it("tells the cashier when there is nothing to reprint", async () => {
		const d = deps({ lastSaleInvoiceId: ref(null) })

		await createSalePrint(d).printLastInvoice()

		expect(d.notify).toHaveBeenCalledWith(
			"لا توجد فاتورة سابقة للطباعة",
			"info",
		)
		expect(submitPrintJob).not.toHaveBeenCalled()
	})

	it("routes the stored invoice id onto the spool", async () => {
		const d = deps()

		await createSalePrint(d).printLastInvoice()

		expect(submitPrintJob).toHaveBeenCalledWith(
			expect.objectContaining({ docId: "INV-9", formId: "Invoice" }),
		)
	})
})

describe("handlePrintInvoice", () => {
	it("hydrates a locally-numbered invoice before queueing it", async () => {
		// An offline invoice has no server row: without hydration the spool
		// receives an empty payload and prints a blank page.
		isLocalOnlyInvoiceName.mockReturnValue(true)
		hydrateLocalOnlyInvoice.mockResolvedValue({ name: "POS-1-1" })
		const d = deps()

		await createSalePrint(d).handlePrintInvoice("POS-1-1")

		expect(hydrateLocalOnlyInvoice).toHaveBeenCalledWith({ name: "POS-1-1" })
		expect(submitPrintJob).toHaveBeenCalledWith(
			expect.objectContaining({ payload: { name: "POS-1-1" } }),
		)
	})

	it("does nothing for an invoice with no name", async () => {
		const d = deps()

		await createSalePrint(d).handlePrintInvoice({})

		expect(submitPrintJob).not.toHaveBeenCalled()
		expect(printInvoiceByName).not.toHaveBeenCalled()
	})

	it("falls back to the direct printer when the spool is unavailable", async () => {
		submitPrintJob.mockRejectedValue(new Error("spool down"))
		const d = deps()

		await createSalePrint(d).handlePrintInvoice("INV-3")

		expect(printInvoiceByName).toHaveBeenCalledWith("INV-3")
	})
})
