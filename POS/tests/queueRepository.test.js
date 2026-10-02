/**
 * Ù†Ø¸Ø§Ù… Ø§Ù„Ø·ÙˆØ§Ø¨ÙŠØ± â€” Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ ÙÙˆÙ‚ IndexedDB Ø­Ù‚ÙŠÙ‚ÙŠ.
 *
 * `queueDomain.test.js` ÙŠØ«Ø¨Øª Ø£Ù† Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯ ØµØ­ÙŠØ­Ø©. Ù‡Ø°Ø§ ÙŠØ«Ø¨Øª Ø£Ù†Ù‡Ø§ **ØªÙØ·Ø¨ÙŽÙ‘Ù‚**:
 * Ø§Ù„Ø£Ø±Ù‚Ø§Ù… ØªÙÙ‚Ø±Ø£ Ù…Ù† ÙÙ‡Ø§Ø±Ø³ DexieØŒ ÙˆØ§Ù„Ù…Ø¹Ø§Ù…Ù„Ø§Øª ØªÙÙ‚ÙÙ„ØŒ ÙˆØ§Ù„Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø§Ù„Ù…ØªØ²Ø§Ù…Ù†Ø©
 * Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„ÙƒØ§ÙˆÙ†ØªØ± Ù„Ø§ ØªÙ†Ø§Ø¯ÙŠ ØªØ°ÙƒØ±ØªÙŠÙ†.
 *
 * Ù„Ù…Ø§Ø°Ø§ IndexedDB Ø­Ù‚ÙŠÙ‚ÙŠ Ù„Ø§ Ø¬Ø¯ÙˆÙ„ ÙˆÙ‡Ù…ÙŠ: Ø§Ù„Ù…Ù„Ù `setupIndexedDB.js` ÙŠÙ†Øµ Ø¹Ù„Ù‰
 * Ø£Ù† Ø¯Ù„Ø§Ù„Ø© Ø§Ù„Ù…Ø¹Ø§Ù…Ù„Ø§Øª (ÙƒÙ„-Ø£Ùˆ-Ù„Ø§-Ø´ÙŠØ¡ Ø¹Ø¨Ø± Ø«Ù„Ø§Ø«Ø© Ø¬Ø¯Ø§ÙˆÙ„) Ù‡ÙŠ Ø¯Ù„Ø§Ù„Ø© Dexie
 * Ù†ÙØ³Ù‡Ø§. Ø§Ø®ØªØ¨Ø§Ø±Ù‡Ø§ Ø¨Ø¨Ø¯ÙŠÙ„ Ù…ÙƒØªÙˆØ¨ ÙŠØ¯ÙˆÙŠÙ‹Ø§ ÙŠØ¤ÙƒØ¯ Ø§Ù„Ø¨Ø¯ÙŠÙ„.
 */
import { beforeEach, describe, expect, it } from "vitest"

import db from "@/services/db"
import { DexieQueueRepository } from "@/components/selfCheckout/queue/core/infrastructure/storage/QueueStorageAdapter"
import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "@/components/selfCheckout/queue/shared/errors/QueueError"

const TENANT = "acme"
const OTHER_TENANT = "globex"

/**
 * Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© ØªÙÙ†Ø´Ø£ Ø¨Ù€ IndexedDB ÙˆÙ‡Ù…ÙŠ **Ù…Ø´ØªØ±Ùƒ Ø¨ÙŠÙ† Ù…Ù„ÙØ§Øª Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±** (Ø§Ù„Ø§Ø³Ù…
 * Ù†ÙØ³Ù‡ `DyPOS-Offline-v1`)ØŒ ÙÙ‚Ø§Ø¹Ø¯Ø© Ø¨Ù‚ÙŠØª Ù…Ù† Ù…Ù„Ù Ø¢Ø®Ø± Ù‚Ø¯ ØªÙƒÙˆÙ† Ø¹Ù†Ø¯ Ø¥ØµØ¯Ø§Ø± 5 â€”
 * ÙˆÙ‚Ø¨Ù„ ØªØ±Ù‚ÙŠØ© Dexie Ù„Ø§ ÙŠØ¸Ù‡Ø± Ø¬Ø¯ÙˆÙ„Ù Ø§Ù„Ø·Ø§Ø¨ÙˆØ± Ø¥Ø·Ù„Ø§Ù‚Ù‹Ø§ ÙˆÙŠÙ‚Ø±Ø£ ÙƒÙ„ Ø§Ø³ØªØ¯Ø¹Ø§Ø¡
 * `NotFoundError` Ø¹Ù„Ù‰ Ø£Ù†Ù‡ Ø®Ø·Ø£ Ù…Ø®Ø·Ø·. Ù„Ø°Ù„Ùƒ ÙŠÙÙ†Ø´Ø£ Ø§Ù„Ø¥ØµØ¯Ø§Ø± Ø§Ù„Ø­Ø§Ù„ÙŠ ØµØ±Ø§Ø­Ø©Ù‹
 * Ù‚Ø¨Ù„ Ø£ÙˆÙ„ Ø§Ø³ØªØ®Ø¯Ø§Ù…ØŒ ÙˆÙŠÙØ­Ø°Ù Ø¨Ø¹Ø¯Ù‡.
 */
const openCurrent = async () => {
	await db.open()
	expect(
		db.tables.map((table) => table.name),
		"the queue tables must exist at the current schema version",
	).toEqual(
		expect.arrayContaining(["queueTickets", "queueCounters", "queueServices"]),
	)
}

/** ÙŠÙ„ØªÙ‚Ø· Ø±Ù…Ø² Ø®Ø·Ø£ Ø§Ù„Ø·Ø§Ø¨ÙˆØ± Ù…Ù† Ø¹Ù…Ù„ÙŠØ© ØºÙŠØ± Ù…ØªØ²Ø§Ù…Ù†Ø©. */
const codeOf = async (fn) => {
	try {
		await fn()
	} catch (error) {
		expect(error, "the rejection must be a QueueError").toBeInstanceOf(
			QueueError,
		)
		return error.code
	}
	throw new Error("expected the call to reject, it resolved")
}

/** Ø®Ø¯Ù…Ø© ÙˆØ§Ø­Ø¯Ø© Ù„ÙƒÙ„ Ù…Ø³ØªØ£Ø¬Ø± â€” Ø¥ØµØ¯Ø§Ø± Ø§Ù„ØªØ°ÙƒØ±Ø© Ù„Ø§ ÙŠÙ‚Ø¨Ù„ Ø®Ø¯Ù…Ø© Ù…Ù† Ù…Ø³ØªØ£Ø¬Ø± Ø¢Ø®Ø±. */
const seedService = async (tenantId = TENANT) => {
	await db.queueServices.add({
		id: `svc-${tenantId}`,
		tenantId,
		code: "GEN",
		name: "Ø§Ù„Ø§Ø³ØªÙ‚Ø¨Ø§Ù„",
		nameEn: "Reception",
		prefix: "A",
		active: 1,
		colorToken: "primary",
		sortOrder: 0,
	})
	return `svc-${tenantId}`
}

let repo

beforeEach(async () => {
	await openCurrent()
	for (const table of [
		db.queueTickets,
		db.queueCounters,
		db.queueServices,
		db.queueSessions,
		db.queueCalls,
		db.queueEvents,
	]) {
		await table.clear()
	}
	// A fresh repository per test: its monotonic version counter is state.
	repo = new DexieQueueRepository()
})

describe("queue session and numbering", () => {
	it("numbers tickets from 1 with no gaps and no duplicates", async () => {
		const serviceId = await seedService()
		const session = await repo.openSession(TENANT, "20260101")
		expect(session.status).toBe("OPEN")
		expect(session.lastSequence).toBe(0)

		const numbers = []
		for (let i = 0; i < 3; i += 1) {
			const ticket = await repo.issueTicket({
				tenantId: TENANT,
				sessionId: session.id,
				serviceId,
			})
			numbers.push(ticket.number)
		}
		expect(numbers).toEqual(["A-001", "A-002", "A-003"])
	})

	it("gives two counters in parallel two DIFFERENT numbers", async () => {
		// Both kiosks read the counter, both write 41, and the customer is
		// handed a duplicate number. The counter is bumped inside the write
		// transaction precisely so this cannot happen.
		const serviceId = await seedService()
		const session = await repo.openSession(TENANT, "20260101")
		const [first, second] = await Promise.all([
			repo.issueTicket({ tenantId: TENANT, sessionId: session.id, serviceId }),
			repo.issueTicket({ tenantId: TENANT, sessionId: session.id, serviceId }),
		])
		expect(first.number).not.toBe(second.number)
		expect([first.number, second.number].sort()).toEqual(["A-001", "A-002"])
	})

	it("reopening the same business date keeps the counter (no reused number)", async () => {
		// Resetting to 1 would hand a customer a number they already held
		// this morning. Reopening returns the SAME session and counter.
		const serviceId = await seedService()
		const first = await repo.openSession(TENANT, "20260101")
		await repo.issueTicket({
			tenantId: TENANT,
			sessionId: first.id,
			serviceId,
		})
		const again = await repo.openSession(TENANT, "20260101")
		expect(again.id).toBe(first.id)
		expect(again.lastSequence).toBe(1)
		expect(again.status).toBe("OPEN")
	})

	it("refuses a ticket once the session is closed", async () => {
		const serviceId = await seedService()
		const session = await repo.openSession(TENANT, "20260101")
		await repo.closeSession(TENANT, session.id)
		expect(
			await codeOf(() =>
				repo.issueTicket({
					tenantId: TENANT,
					sessionId: session.id,
					serviceId,
				}),
			),
		).toBe(QUEUE_ERROR_CODES.SESSION_CLOSED)
	})

	it("refuses a service belonging to another tenant", async () => {
		// Tenant fail-closed (invariant 1): the kiosk of shop A must not be
		// able to issue into shop B's catalogue.
		await seedService(OTHER_TENANT)
		const session = await repo.openSession(TENANT, "20260101")
		expect(
			await codeOf(() =>
				repo.issueTicket({
					tenantId: TENANT,
					sessionId: session.id,
					serviceId: `svc-${OTHER_TENANT}`,
				}),
			),
		).toBe(QUEUE_ERROR_CODES.VALIDATION)
	})
})

describe("counter lifecycle and the atomic call", () => {
	/** Ø¬Ù„Ø³Ø© + ÙƒØ§ÙˆÙ†ØªØ± Ù…ÙØªÙˆØ­ØŒ Ø¬Ø§Ù‡Ø²Ø§Ù† Ù„Ù„Ù†Ø¯Ø§Ø¡. */
	const ready = async (tenantId = TENANT) => {
		const serviceId = await seedService(tenantId)
		const session = await repo.openSession(tenantId, "20260101")
		const counter = await repo.createCounter(tenantId, session.id, {
			name: "ÙƒØ§ÙˆÙ†ØªØ± Ù¡",
		})
		await repo.openCounter(tenantId, counter.id)
		const issue = () =>
			repo.issueTicket({ tenantId, sessionId: session.id, serviceId })
		return { session, counter: { ...counter, status: "OPEN" }, issue }
	}

	it("serves one ticket per call, oldest first", async () => {
		const { counter, issue } = await ready()
		const first = await issue()
		const second = await issue()

		const call = await repo.callNext(TENANT, counter.id, 5_000)
		expect(call.ticket.id).toBe(first.id)
		expect(call.ticket.status).toBe("CALLED")
		expect(call.ticket.counterId).toBe(counter.id)
		expect(call.ticket.firstCalledAt).toBe(5_000)
		expect(call.counter.currentTicketId).toBe(first.id)

		// A window serves one customer at a time, so the next call only
		// happens after this one is finished - that is what makes a counter's
		// single occupancy a real guarantee rather than a label.
		await repo.startServing(TENANT, counter.id, 5500)
		await repo.completeTicket(TENANT, counter.id, 6000)

		const next = await repo.callNext(TENANT, counter.id, 6500)
		expect(next.ticket.id).toBe(second.id)
	})

	it("refuses a second call on an occupied counter", async () => {
		// Two cashiers pressing "call next" on one window. The second press
		// must fail loudly with the SPECIFIC reason (COUNTER_BUSY), not a
		// generic database error â€” the message is what the cashier reads.
		const { counter, issue } = await ready()
		await issue()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)
		expect(await codeOf(() => repo.callNext(TENANT, counter.id, 6_000))).toBe(
			QUEUE_ERROR_CODES.COUNTER_BUSY,
		)
	})

	it("never hands the same ticket to two concurrent calls", async () => {
		// The promise-level version of the same race: both calls start before
		// either resolves, so only the transaction lock can separate them.
		const { counter, issue, session } = await ready()
		const a = await issue()
		const b = await issue()

		const results = await Promise.allSettled([
			repo.callNext(TENANT, counter.id, 5_000),
			repo.callNext(TENANT, counter.id, 5_001),
		])
		const fulfilled = results.filter((r) => r.status === "fulfilled")
		expect(fulfilled).toHaveLength(1)

		const calledId = fulfilled[0].value.ticket.id
		expect([a.id, b.id]).toContain(calledId)
		// And the stored counter agrees with the winner â€” no lost update.
		const snapshot = await repo.getSnapshot(TENANT, session.id)
		expect(snapshot.counters[0].currentTicketId).toBe(calledId)
	})

	it("reports an empty queue instead of returning a null ticket", async () => {
		// An empty queue is a NORMAL state, not a crash: the screen shows
		// "no one waiting" and the cashier presses the button again later.
		const { counter } = await ready()
		expect(await codeOf(() => repo.callNext(TENANT, counter.id, 5_000))).toBe(
			QUEUE_ERROR_CODES.QUEUE_EMPTY,
		)
	})

	it("refuses to call on a closed counter", async () => {
		const { counter, issue } = await ready()
		await issue()
		await repo.closeCounter(TENANT, counter.id)
		expect(await codeOf(() => repo.callNext(TENANT, counter.id, 5_000))).toBe(
			QUEUE_ERROR_CODES.COUNTER_CLOSED,
		)
	})

	it("will not close a counter that still holds a customer", async () => {
		// Otherwise the cashier's only ticket becomes unreachable and the
		// counter is shut with someone still being served.
		const { counter, issue } = await ready()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)
		expect(await codeOf(() => repo.closeCounter(TENANT, counter.id))).toBe(
			QUEUE_ERROR_CODES.COUNTER_BUSY,
		)
	})

	it("completes a service, frees the counter and records the performance", async () => {
		const { counter, issue, session } = await ready()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)
		await repo.startServing(TENANT, counter.id, 6_000)
		const done = await repo.completeTicket(TENANT, counter.id, 9_000)

		expect(done.status).toBe("COMPLETED")
		expect(done.servingAt).toBe(6_000)
		expect(done.completedAt).toBe(9_000)

		const after = await repo.getSnapshot(TENANT, session.id)
		const stored = after.counters[0]
		expect(stored.currentTicketId).toBeUndefined() // freed, not null
		expect(stored.servedCount).toBe(1)
		expect(stored.totalServeMs).toBe(3_000) // from start, not from the call
	})

	it("skips a no-show: the ticket returns to the queue and the counter frees", async () => {
		const { counter, issue, session } = await ready()
		const first = await issue()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)

		const skipped = await repo.skipTicket(TENANT, counter.id, 7_000)
		expect(skipped.ticket.status).toBe("SKIPPED")
		expect(skipped.ticket.counterId).toBeUndefined()

		const snapshot = await repo.getSnapshot(TENANT, session.id)
		expect(snapshot.counters[0].currentTicketId).toBeUndefined()

		// The skipped customer is callable again â€” that is the whole point.
		const recalled = await repo.callNext(TENANT, counter.id, 8_000)
		expect(recalled.ticket.id).toBe(first.id)
		expect(recalled.ticket.callCount).toBe(2)
	})

	it("transfers a ticket to a free counter and releases the first", async () => {
		const { session, counter, issue } = await ready()
		const other = await repo.createCounter(TENANT, session.id, {
			name: "ÙƒØ§ÙˆÙ†ØªØ± Ù¢",
		})
		await repo.openCounter(TENANT, other.id)
		await issue()
		const called = await repo.callNext(TENANT, counter.id, 5_000)

		const moved = await repo.transferTicket(TENANT, counter.id, other.id, 6_000)
		expect(moved.status).toBe("TRANSFERRED")
		expect(moved.counterId).toBe(other.id)

		const snapshot = await repo.getSnapshot(TENANT, session.id)
		const byId = Object.fromEntries(snapshot.counters.map((c) => [c.id, c]))
		expect(byId[counter.id].currentTicketId).toBeUndefined()
		expect(byId[other.id].currentTicketId).toBe(called.ticket.id)
	})

	it("refuses a transfer onto an occupied counter", async () => {
		const { session, counter, issue } = await ready()
		const other = await repo.createCounter(TENANT, session.id, {
			name: "ÙƒØ§ÙˆÙ†ØªØ± Ù¢",
		})
		await repo.openCounter(TENANT, other.id)
		await issue()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)
		await repo.callNext(TENANT, other.id, 5_001)
		expect(
			await codeOf(() =>
				repo.transferTicket(TENANT, counter.id, other.id, 6_000),
			),
		).toBe(QUEUE_ERROR_CODES.COUNTER_BUSY)
	})

	it("refuses to transfer a counter to itself", async () => {
		const { counter, issue } = await ready()
		await issue()
		await repo.callNext(TENANT, counter.id, 5_000)
		expect(
			await codeOf(() =>
				repo.transferTicket(TENANT, counter.id, counter.id, 6_000),
			),
		).toBe(QUEUE_ERROR_CODES.VALIDATION)
	})

	it("scopes every counter read to its tenant", async () => {
		// Invariant 1: a foreign counter is refused. The refusal must also
		// leave it untouched â€” a cross-tenant open would be a write leak.
		const { counter } = await ready(OTHER_TENANT)
		await repo.closeCounter(OTHER_TENANT, counter.id) // parked, free
		expect(await codeOf(() => repo.openCounter(TENANT, counter.id))).toBe(
			QUEUE_ERROR_CODES.COUNTER_CLOSED,
		)
		const stored = await db.queueCounters.get(counter.id)
		expect(stored.status).toBe("CLOSED") // untouched by the foreign attempt
	})
})
