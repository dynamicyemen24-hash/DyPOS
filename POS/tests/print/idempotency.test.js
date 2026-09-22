import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

vi.mock("@/utils/printInvoice", () => ({
	buildReceiptHTML: (data) => `<div class="receipt">${data.name}</div>`,
	printInvoiceCustom: vi.fn(),
}))

import {
	buildPrintJob,
	createSpoolNo,
	idempotencyKeyOf,
	isDuplicateWithinWindow,
	IN_PROGRESS_STATUSES,
	TERMINAL_STATUSES,
} from "@/print/spool/printJobFactory"

describe("createSpoolNo", () => {
	it("formats SAP-style spool numbers", () => {
		expect(createSpoolNo(1)).toBe("SPR-000001")
		expect(createSpoolNo(12345)).toBe("SPR-012345")
		expect(createSpoolNo("7")).toBe("SPR-000007")
	})
})

describe("buildPrintJob", () => {
	it("normalizes a request into a persisted shape", () => {
		const job = buildPrintJob({
			docType: "invoice",
			docId: "INV-1",
			title: "TAX INV-1",
			payload: { name: "INV-1" },
			copies: 3,
			priority: 1,
		})
		expect(job.docType).toBe("invoice")
		expect(job.status).toBe("QUEUED")
		expect(job.copies).toBe(3)
		expect(job.priority).toBe(1)
		expect(job.attempts).toBe(0)
		expect(job.printedCopies).toBe(0)
		expect(job.startedAt).toBeNull()
		expect(typeof job.id).toBe("string")
	})

	it("clamps copies and priorities", () => {
		expect(buildPrintJob({ copies: 99 }).copies).toBe(20)
		expect(buildPrintJob({ copies: 0 }).copies).toBe(1)
		expect(buildPrintJob({ copies: -3 }).copies).toBe(1)
		expect(buildPrintJob({ priority: 7 }).priority).toBe(0)
		expect(buildPrintJob({ priority: 1 }).priority).toBe(1)
	})
})

describe("idempotencyKeyOf", () => {
	it("distinguishes original from reprint", () => {
		const a = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		const b = buildPrintJob({ docType: "invoice", docId: "INV-1", reprintOf: "job-1" })
		expect(idempotencyKeyOf(a)).not.toBe(idempotencyKeyOf(b))
		expect(idempotencyKeyOf(a)).toBe("invoice:INV-1:")
	})
})

describe("isDuplicateWithinWindow", () => {
	it("collapses an identical in-flight submission within 3s", () => {
		const now = 100000
		const existing = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		existing.createdAt = now - 500
		const candidate = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		expect(
			isDuplicateWithinWindow(existing, idempotencyKeyOf(candidate), now),
		).toBe(true)
	})

	it("does not collapse outside the window", () => {
		const now = 100000
		const existing = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		existing.createdAt = now - 10000
		const candidate = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		expect(
			isDuplicateWithinWindow(existing, idempotencyKeyOf(candidate), now),
		).toBe(false)
	})

	it("does not collapse when the existing job already finished", () => {
		const now = 100000
		const existing = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		existing.status = "COMPLETED"
		existing.createdAt = now - 100
		const candidate = buildPrintJob({ docType: "invoice", docId: "INV-1" })
		expect(
			isDuplicateWithinWindow(existing, idempotencyKeyOf(candidate), now),
		).toBe(false)
	})

	it("returns false for a missing existing job", () => {
		expect(isDuplicateWithinWindow(null, "invoice:INV-1:", 1)).toBe(false)
	})
})

describe("status constants", () => {
	it("exposes disjoint terminal and in-progress sets", () => {
		expect(TERMINAL_STATUSES).toContain("COMPLETED")
		expect(TERMINAL_STATUSES).toContain("FAILED")
		expect(TERMINAL_STATUSES).toContain("PARTIAL")
		expect(TERMINAL_STATUSES).toContain("CANCELLED")
		expect(IN_PROGRESS_STATUSES).toEqual(["QUEUED", "PROCESSING"])
		TERMINAL_STATUSES.forEach((s) => {
			expect(IN_PROGRESS_STATUSES).not.toContain(s)
		})
	})
})