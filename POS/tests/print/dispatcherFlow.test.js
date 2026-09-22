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

import { JOB_STATUSES } from "@/print/spool/printJobFactory"
import { createPrintDispatcher } from "@/print/spool/printDispatcher"
import { findJobForReprint } from "@/print/history/printHistory"

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
		id: overrides.id || `job-${Math.random().toString(36).slice(2)}`,
		docType: "invoice",
		docId: "SI-1",
		title: "SI-1",
		status: JOB_STATUSES.QUEUED,
		attempts: 0,
		maxAttempts: 3,
		copies: 2,
		printedCopies: 0,
		priority: 0,
		spoolNo: "SPR-000001",
		deviceId: "browser",
		createdAt: Date.now(),
		pendingRetryTime: null,
		...overrides,
	}
}

describe("dispatcher per-copy loop", () => {
	it("preserves printedCopies when a later copy fails (no duplicate reprint)", async () => {
		const job = fakeJob({ copies: 3, maxAttempts: 3 })
		const store = makeStore([job])
		const calls = []
		let jammed = false

		const renderer = vi.fn(async (s) => ({
			html: `<html>copy ${s.copyNo}</html>`,
		}))
		const executor = vi.fn(async (s) => {
			calls.push(s.copyNo)
			if (s.copyNo === 2 && !jammed) {
				jammed = true
				throw new Error("printer jam")
			}
			return { printedCopies: 1 }
		})
		const resolvePlan = vi.fn(async () => ({ copies: 3, deviceId: "browser" }))

		const dispatcher = createPrintDispatcher({
			store,
			render: renderer,
			execute: executor,
			resolvePlan,
			onTerminal: () => {},
		})

		await dispatcher.drain()

		// Copy 1 printed, copy 2 jammed — checkpoint must survive.
		const final = store.getById(job.id)
		expect(calls).toEqual([1, 2])
		expect(final.printedCopies).toBe(1)
		expect(final.status).toBe(JOB_STATUSES.QUEUED) // retry scheduled
		expect(final.lastError).toBe("printer jam")

		// Second pass resumes at copy 2, does NOT re-print copy 1.
		// (Clear the backoff deadline so the retry is immediately eligible.)
		store.getById(job.id).pendingRetryTime = null
		await dispatcher.drain()
		const after = store.getById(job.id)
		expect(after.printedCopies).toBe(3)
		expect(after.status).toBe(JOB_STATUSES.COMPLETED)
	})

	it("resumes a PARTIAL job from its checkpoint on retryNow", async () => {
		const job = fakeJob({
			copies: 4,
			maxAttempts: 1,
			printedCopies: 2,
			status: JOB_STATUSES.FAILED,
			attempts: 1,
			lastError: "late jam",
		})
		const store = makeStore([job])
		const copies = []
		const dispatcher = createPrintDispatcher({
			store,
			render: vi.fn(async (s) => ({ html: `x ${s.copyNo}` })),
			execute: vi.fn(async (s) => {
				copies.push(s.copyNo)
				return { printedCopies: 1 }
			}),
			resolvePlan: vi.fn(async () => ({ copies: 4, deviceId: "browser" })),
			onTerminal: () => {},
		})

		await dispatcher.retryNow(job.id)

		expect(copies).toEqual([3, 4]) // skipped the already-printed 1–2
		expect(store.getById(job.id).printedCopies).toBe(4)
		expect(store.getById(job.id).status).toBe(JOB_STATUSES.COMPLETED)
	})
})

describe("dispatcher terminal notification", () => {
	it("notifies waiters on FAILED (not just COMPLETED)", async () => {
		const job = fakeJob({ maxAttempts: 1 })
		const store = makeStore([job])
		const terminals = []
		const dispatcher = createPrintDispatcher({
			store,
			render: vi.fn(async () => ({ html: "x" })),
			execute: vi.fn(async () => {
				throw new Error("no paper")
			}),
			resolvePlan: vi.fn(async () => ({ copies: 1, deviceId: "browser" })),
			onTerminal: (j) => terminals.push(j.status),
		})

		await dispatcher.drain()

		expect(terminals).toEqual([JOB_STATUSES.FAILED])
		const final = store.getById(job.id)
		expect(final.status).toBe(JOB_STATUSES.FAILED)
		expect(final.lastError).toBe("no paper")
	})
})

describe("findJobForReprint disk fallback", () => {
	it("clones from the persisted row when the job left the live list", async () => {
		const store = makeStore([])
		store.history = [
			{
				jobId: "job-abc",
				docId: "SI-9",
				docType: "invoice",
				status: JOB_STATUSES.COMPLETED,
			},
		]
		store.getByIdFromDisk = vi.fn(async (id) =>
			id === "job-abc" ? fakeJob({ id: "job-abc", printedCount: 2 }) : null,
		)

		const source = await findJobForReprint(store, "job-abc")
		expect(source.id).toBe("job-abc")
		expect(source.printedCount).toBe(2)
	})

	it("rejects a reprint when no payload survives", async () => {
		const store = makeStore([])
		store.history = [{ jobId: "gone", docId: "X", docType: "invoice" }]
		store.getByIdFromDisk = vi.fn(async () => null)

		await expect(findJobForReprint(store, "gone")).rejects.toThrow(
			"no longer available",
		)
	})
})