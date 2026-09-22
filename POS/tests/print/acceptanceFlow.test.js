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
	printInvoiceCustom: vi.fn(),
	printInvoiceByName: vi.fn(),
	isLocalOnlyInvoiceName: vi.fn(() => false),
	hydrateLocalOnlyInvoice: vi.fn(async (d) => d),
}))

import { JOB_STATUSES } from "@/print/spool/printJobFactory"
import { createPrintDispatcher } from "@/print/spool/printDispatcher"
import { buildCopyMarks, buildFormVars } from "@/print/forms/formRenderer"
import { buildReprintJob } from "@/print/history/printHistory"

function makeStore(initial = []) {
	const rows = [...initial]
	return {
		jobs: rows,
		history: [],
		upsert: vi.fn(async (job) => {
			const idx = rows.findIndex((j) => j.id === job.id)
			if (idx >= 0) rows[idx] = job
			else rows.push(job)
			return job
		}),
		recordHistory: vi.fn(async () => {}),
		getById: vi.fn((id) => rows.find((j) => j.id === id) || null),
		getByIdFromDisk: vi.fn(async (id) => rows.find((j) => j.id === id) || null),
	}
}

function fakeJob(overrides = {}) {
	return {
		id: `job-${Math.random().toString(36).slice(2)}`,
		docType: "invoice",
		docId: "SI-1",
		title: "SI-1",
		status: JOB_STATUSES.QUEUED,
		attempts: 0,
		maxAttempts: 3,
		copies: 1,
		printedCopies: 0,
		priority: 0,
		spoolNo: "SPR-000001",
		deviceId: "browser",
		payload: null,
		createdAt: Date.now(),
		pendingRetryTime: null,
		...overrides,
	}
}

describe("§14.5 — multiple copies render per-copy watermarks", () => {
	it("renders one copy_no banner per physical copy", async () => {
		const job = fakeJob({ copies: 2, spoolNo: "SPR-000007" })
		const store = makeStore([job])
		const renderedCopyNos = []

		const dispatcher = createPrintDispatcher({
			store,
			render: vi.fn(async (s) => {
				const vars = buildFormVars(s)
				renderedCopyNos.push(s.copyNo)
				return { html: buildCopyMarks(vars) }
			}),
			execute: vi.fn(async () => ({ printedCopies: 1 })),
			resolvePlan: vi.fn(async () => ({ copies: 2, deviceId: "browser" })),
			onCompleted: () => {},
		})

		await dispatcher.drain()

		expect(renderedCopyNos).toEqual([1, 2])
		for (const n of [1, 2]) {
			const vars = buildFormVars({ ...job, copyNo: n, copies: 2 })
			expect(buildCopyMarks(vars)).toContain("class=\"copy-no\"")
			expect(buildCopyMarks(vars)).toContain(`${n} / 2 — SPR-000007`)
		}
		expect(store.getById(job.id).status).toBe(JOB_STATUSES.COMPLETED)
	})

	it("does NOT stamp copy numbering for a single-copy job", () => {
		const vars = buildFormVars(fakeJob({ copies: 1 }))
		expect(buildCopyMarks(vars)).not.toContain("copy-no")
	})
})

describe("§14.6 — reprint stamps a COPY watermark", () => {
	it("builds a reprint job and renders COPY", async () => {
		const original = fakeJob({ docId: "SI-9", spoolNo: "SPR-000001" })
		const reprint = buildReprintJob(original, {
			reprintOf: original.id,
			spoolNo: "SPR-000002",
		})

		const vars = buildFormVars(reprint)
		const marks = buildCopyMarks(vars)

		expect(reprint.reprintOf).toBe(original.id)
		expect(reprint.printedCount).toBe(1)
		expect(marks).toContain("class=\"copy-watermark\">COPY")
		expect(marks).toContain(">COPY</div>")
	})

	it("renders no COPY banner on an original print", () => {
		const original = fakeJob({ docId: "SI-10" })
		const vars = buildFormVars(original)
		expect(buildCopyMarks(vars)).not.toContain("copy-watermark")
	})
})

describe("§14.8 — EOD priority precedes invoices", () => {
	it("dispatches a priority-1 EOD before an already-queued invoice", async () => {
		const invoice = fakeJob({ docId: "SI-A", title: "invoice", createdAt: Date.now() })
		const eod = fakeJob({
			docId: "EOD-1",
			title: "eod",
			docType: "eod",
			priority: 1,
			createdAt: Date.now() + 1,
		})
		const store = makeStore([invoice, eod])
		const execOrder = []

		const dispatcher = createPrintDispatcher({
			store,
			render: vi.fn(async () => ({ html: "<b>x</b>" })),
			execute: vi.fn(async (s) => {
				execOrder.push(s.docType)
				return { printedCopies: 1 }
			}),
			resolvePlan: vi.fn(async (s) => ({
				copies: 1,
				deviceId: "browser",
				doc: s.docType,
			})),
			onCompleted: () => {},
		})

		await dispatcher.drain()

		expect(execOrder).toEqual(["eod", "invoice"])
		expect(store.getById(eod.id).status).toBe(JOB_STATUSES.COMPLETED)
		expect(store.getById(invoice.id).status).toBe(JOB_STATUSES.COMPLETED)
	})
})