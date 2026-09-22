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

import {
	buildPrintJob,
	JOB_STATUSES,
} from "@/print/spool/printJobFactory"

import {
	applyAttemptResult as dispatcherApply,
	cancelJob,
	isReady,
	readyJobs,
	sortReadyJobs,
} from "@/print/spool/printDispatcher"

import { buildReprintJob } from "@/print/history/printHistory"

describe("applyAttemptResult", () => {
	it("completes when all copies printed", () => {
		const job = buildPrintJob({ docId: "SI-1", copies: 2 })
		const next = dispatcherApply(job, { printedCopies: 2, error: null }, 1000)
		expect(next.status).toBe(JOB_STATUSES.COMPLETED)
		expect(next.finishedAt).toBe(1000)
		expect(next.printedCopies).toBe(2)
	})

	it("schedules a backoff retry when nothing printed yet", () => {
		const job = buildPrintJob({ docId: "SI-1", maxAttempts: 3 })
		const next = dispatcherApply(job, { printedCopies: 0, error: new Error("boom") }, 1000)
		expect(next.status).toBe(JOB_STATUSES.QUEUED)
		expect(next.attempts).toBe(1)
		expect(next.pendingRetryTime).toBeGreaterThan(1000)
		expect(next.lastError).toBe("boom")
	})

	it("dead-letters to FAILED at maxAttempts with no copies", () => {
		let job = buildPrintJob({ docId: "SI-1", maxAttempts: 2 })
		job = dispatcherApply(job, { printedCopies: 0, error: new Error("e1") }, 1)
		job = dispatcherApply(job, { printedCopies: 0, error: new Error("e2") }, 2)
		expect(job.status).toBe(JOB_STATUSES.FAILED)
		expect(job.attempts).toBe(2)
	})

	it("marks PARTIAL when some copies printed but budget exhausted", () => {
		let job = buildPrintJob({ docId: "SI-1", copies: 3, maxAttempts: 2 })
		job = dispatcherApply(job, { printedCopies: 1, error: new Error("e1") }, 1)
		job = dispatcherApply(job, { printedCopies: 1, error: new Error("e2") }, 2)
		expect(job.status).toBe(JOB_STATUSES.PARTIAL)
		expect(job.printedCopies).toBe(1)
	})
})

describe("cancelJob", () => {
	it("cancels a queued job", () => {
		const job = buildPrintJob({ docId: "SI-1" })
		const next = cancelJob(job, 5000)
		expect(next.status).toBe(JOB_STATUSES.CANCELLED)
		expect(next.finishedAt).toBe(5000)
	})

	it("leaves terminal jobs untouched", () => {
		const job = { ...buildPrintJob({ docId: "SI-1" }), status: JOB_STATUSES.COMPLETED }
		expect(cancelJob(job, 5)).toBe(job)
	})
})

describe("ordering", () => {
	it("runs priority jobs before normal ones, FIFO within priority", () => {
		const low1 = buildPrintJob({ docId: "A", priority: 0, title: "low1" })
		const high = buildPrintJob({ docId: "B", priority: 1, title: "high" })
		const low2 = buildPrintJob({ docId: "C", priority: 0, title: "low2" })
		low2.createdAt = low1.createdAt + 10
		high.createdAt = low1.createdAt + 1

		const sorted = sortReadyJobs([low2, high, low1])
		expect(sorted[0]).toBe(high)
		expect(sorted[1]).toBe(low1)
		expect(sorted[2]).toBe(low2)
	})

	it("filters out jobs still inside their retry window", () => {
		const now = 10000
		const retrySoon = {
			...buildPrintJob({ docId: "R", title: "retry" }),
			status: JOB_STATUSES.QUEUED,
			pendingRetryTime: now + 5000,
		}
		const ready = {
			...buildPrintJob({ docId: "X" }),
			status: JOB_STATUSES.QUEUED,
			pendingRetryTime: now - 1,
		}
		const processing = {
			...buildPrintJob({ docId: "Y" }),
			status: JOB_STATUSES.PROCESSING,
		}

		const result = readyJobs([retrySoon, ready, processing], now)
		expect(result).toHaveLength(1)
		expect(result[0]).toBe(ready)
	})

	it("isReady respects the retry deadline", () => {
		const job = { ...buildPrintJob({ docId: "Z" }), pendingRetryTime: 200 }
		expect(isReady(job, 100)).toBe(false)
		expect(isReady(job, 200)).toBe(true)
	})
})

describe("reprint watermark", () => {
	it("builds a reprint job flagged reprintOf", () => {
		const original = buildPrintJob({
			docId: "SI-9",
			payload: { items: [{ name: "x" }] },
			spoolNo: "SPR-000002",
		})
		const reprint = buildReprintJob(original, {
			reprintOf: original.id,
			spoolNo: "SPR-000003",
		})
		expect(reprint.reprintOf).toBe(original.id)
		expect(reprint.spoolNo).toBe("SPR-000003")
		expect(reprint.printedCount).toBe(1)
		expect(reprint.payload).toEqual(original.payload)
		expect(reprint.status).toBe(JOB_STATUSES.QUEUED)
	})
})