/**
 * نظام الطوابير — طبقة المجال (منطق خالص، بلا قاعدة بيانات).
 *
 * لماذا هذا الملف موجود: نظام الطابور كُتب كاملًا (21 وحدة) ولم يكن
 * له **ولا اختبار واحد**. «مُختبَر» هنا لا تعني «نُظر فيه»: منطق اختيار
 * التذكرة التالية يحدد من ينال حقه، ومسار آلة الحالات يمنع إنهاء تذكرة
 * مرتين. خطأ في أيٍّ منهما يظهر أمام الزبون لا في السجل.
 *
 * ما تغطيه هذه الطبقة: من يُنادى، وأي انتقال حالة مسموح، وكيف تُحسب
 * المدد. ما يغطيه `queueRepository.test.js`: نفس القرارات بعد أن تصل
 * إلى IndexedDB، بما فيها الذرّية التي يمنع بها كاونتر واحد من نداء
 * تذكرتين.
 */
import { describe, expect, it } from "vitest"

import {
	assertCanCall,
	assertCounterFree,
	compareCandidates,
	isQueueEmpty,
	requireNext,
	selectNext,
	selectRecall,
	waitingTickets,
} from "@/components/selfCheckout/queue/core/domain/rules/CallingRules"
import {
	assertTransition,
	canTransition,
	isActiveInQueue,
	isTerminal,
	nextStatuses,
	statusLabelAr,
	TERMINAL_STATUSES,
} from "@/components/selfCheckout/queue/core/domain/state/QueueStateMachine"
import {
	issueTicket,
	occupiesCounter,
	releaseCounter,
	serveDuration,
	transitionTicket,
	waitDuration,
} from "@/components/selfCheckout/queue/core/domain/entities/QueueTicket"
import { QueueEventBus } from "@/components/selfCheckout/queue/core/domain/events/QueueEventBus"
import {
	compareQueueNumbers,
	createQueueNumber,
	isQueueNumber,
	normalizePrefix,
	prefixFromNumber,
	sequenceFromNumber,
} from "@/components/selfCheckout/queue/core/domain/valueObjects/QueueNumber"
import {
	assertCanIssue,
	createQueueStatus,
	labelFor,
} from "@/components/selfCheckout/queue/core/domain/valueObjects/QueueStatus"
import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "@/components/selfCheckout/queue/shared/errors/QueueError"

/** تذكرة مصغّرة — القيمة الوحيدة التي تحتاجها قواعد الاختيار. */
const ticket = (over = {}) => ({
	id: over.id ?? "t",
	number: over.number ?? "A-001",
	sequence: over.sequence ?? 1,
	serviceId: over.serviceId ?? "svc",
	serviceName: "خدمة",
	status: over.status ?? "WAITING",
	priority: over.priority ?? "NORMAL",
	issuedAt: over.issuedAt ?? 1_000,
	firstCalledAt: over.firstCalledAt,
	calledAt: over.calledAt,
	servingAt: over.servingAt,
	completedAt: over.completedAt,
	counterId: over.counterId,
	counterName: over.counterName,
	sessionId: over.sessionId ?? "s1",
	callCount: over.callCount ?? 0,
	updatedAt: over.issuedAt ?? 1_000,
})

/** يلتقط رمز خطأ الطابور بدل مقارنة الرسالة العربية. */
const codeOf = (fn) => {
	try {
		fn()
	} catch (error) {
		expect(error, "the throw must be a QueueError").toBeInstanceOf(QueueError)
		return error.code
	}
	throw new Error("expected the call to throw, it returned")
}

describe("queue number — the number a customer is called by", () => {
	it("builds a padded number and round-trips its parts", () => {
		const built = createQueueNumber("A", 7)
		expect(built.value).toBe("A-007")
		expect(sequenceFromNumber(built.value)).toBe(7)
		expect(prefixFromNumber(built.value)).toBe("A")
		expect(isQueueNumber(built.value)).toBe(true)
	})

	it("refuses a zero or negative sequence (0 is reserved for 'no ticket')", () => {
		expect(codeOf(() => createQueueNumber("A", 0))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
		expect(codeOf(() => createQueueNumber("A", -3))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
		expect(codeOf(() => createQueueNumber("A", 1.5))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
	})

	it("refuses a sequence past the cap, and an empty prefix", () => {
		expect(codeOf(() => createQueueNumber("A", 99_999))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
		expect(codeOf(() => createQueueNumber("", 1))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
	})

	it("normalises a prefix: uppercase, alphanumeric only, at most 4", () => {
		expect(normalizePrefix("cash")).toBe("CASH")
		expect(normalizePrefix("a-1")).toBe("A1")
		expect(normalizePrefix("  svc  ")).toBe("SVC")
	})

	it("orders by the NUMBER, not the text ('A-10' after 'A-9')", () => {
		// The text sort that a plain `.sort()` performs puts A-10 first,
		// which calls the wrong customer and skips A-9 entirely.
		expect(compareQueueNumbers("A-9", "A-10")).toBeLessThan(0)
		expect(["A-10", "A-9", "A-100"].sort(compareQueueNumbers)).toEqual([
			"A-9",
			"A-10",
			"A-100",
		])
	})

	it("treats an unparsable number as 'no value' rather than crashing", () => {
		expect(sequenceFromNumber("nonsense")).toBeNull()
		expect(sequenceFromNumber("")).toBeNull()
		expect(isQueueNumber("nonsense")).toBe(false)
	})
})

describe("queue status — one state per question the screen asks", () => {
	it("answers hasWaiting/hasServing from the counts, not from prose", () => {
		const snapshot = createQueueStatus("OPEN", 3, 1, true)
		expect(snapshot.hasWaiting).toBe(true)
		expect(snapshot.hasServing).toBe(true)
		expect(snapshot.labelAr).toBe("يوجد خدمة وانتظار")
	})

	it("keeps 'empty' distinct from 'cannot take tickets'", () => {
		// A closed session with nobody waiting is NOT an empty open queue:
		// conflating them is how a screen says "no queue" while tickets exist.
		expect(labelFor(false, false)).toBe("الطابور فارغ")
		expect(codeOf(() => assertCanIssue(false, 0))).toBe(
			QUEUE_ERROR_CODES.SESSION_CLOSED,
		)
		expect(codeOf(() => assertCanIssue(true, -1))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
	})
})

describe("ticket lifecycle — stamps are set by the transition, not the caller", () => {
	const base = () =>
		issueTicket({
			id: "t1",
			number: "A-001",
			sequence: 1,
			serviceId: "svc",
			serviceName: "كاشير",
			sessionId: "s1",
			now: 1_000,
		})

	it("issues a WAITING ticket with a frozen identity", () => {
		const issued = base()
		expect(issued.status).toBe("WAITING")
		expect(issued.priority).toBe("NORMAL")
		expect(issued.callCount).toBe(0)
		expect(issued.issuedAt).toBe(1_000)
		// Frozen: the entity never mutates in place, so a rollback is exact.
		expect(Object.isFrozen(issued)).toBe(true)
	})

	it("stamps calledAt and advances callCount on every call", () => {
		const called = transitionTicket(base(), "CALLED", 5_000, {
			counterId: "c1",
		})
		expect(called.calledAt).toBe(5_000)
		expect(called.callCount).toBe(1)
		expect(called.firstCalledAt).toBe(5_000)
		expect(called.counterId).toBe("c1")

		// A recall re-calls: the count must move, and firstCalledAt must NOT —
		// otherwise the average wait is silently recomputed from attempt 2.
		const recalled = transitionTicket(called, "RECALLED", 9_000)
		const again = transitionTicket(recalled, "CALLED", 12_000)
		expect(again.callCount).toBe(2)
		expect(again.calledAt).toBe(12_000)
		expect(again.firstCalledAt).toBe(5_000)
	})

	it("measures the wait from issue to FIRST call, and the serve from start to end", () => {
		const called = transitionTicket(base(), "CALLED", 4_000)
		const serving = transitionTicket(called, "SERVING", 6_000)
		const done = transitionTicket(serving, "COMPLETED", 9_000)
		expect(waitDuration(done, 99_000)).toBe(3_000)
		expect(serveDuration(done, 99_000)).toBe(3_000)
		expect(waitDuration(base(), 4_500)).toBe(3_500) // still waiting
		expect(serveDuration(base(), 9_000)).toBe(0) // never served
	})

	it("clears the counter with undefined, never null", () => {
		// A NULL current_ticket_id is still "occupied" to a partial index,
		// which is the difference between a freed counter and a permanently
		// busy one.
		const held = releaseCounter(
			ticket({ counterId: "c1", counterName: "كاونتر ١" }),
		)
		expect(held).toEqual({ counterId: undefined, counterName: undefined })
		expect("counterId" in held).toBe(true)
		expect(held.counterId).not.toBeNull()
		// No counter held ⇒ nothing to release.
		expect(releaseCounter(ticket())).toEqual({})
	})

	it("knows which statuses hold a counter", () => {
		expect(occupiesCounter("CALLED")).toBe(true)
		expect(occupiesCounter("SERVING")).toBe(true)
		expect(occupiesCounter("WAITING")).toBe(false)
		expect(occupiesCounter("COMPLETED")).toBe(false)
	})
})

describe("state machine — the only legal transitions", () => {
	it("allows the happy path end to end", () => {
		expect(canTransition("WAITING", "CALLED")).toBe(true)
		expect(canTransition("CALLED", "SERVING")).toBe(true)
		expect(canTransition("SERVING", "COMPLETED")).toBe(true)
	})

	it("refuses to serve a ticket that was never called", () => {
		expect(canTransition("WAITING", "SERVING")).toBe(false)
		expect(canTransition("WAITING", "COMPLETED")).toBe(false)
		expect(
			codeOf(() =>
				assertTransition("WAITING", "COMPLETED", { ticketNumber: "A-001" }),
			),
		).toBe(QUEUE_ERROR_CODES.INVALID_TRANSITION)
	})

	it("has no exit from a terminal state", () => {
		for (const terminal of TERMINAL_STATUSES) {
			expect(nextStatuses(terminal)).toEqual([])
			expect(isTerminal(terminal)).toBe(true)
		}
		expect(canTransition("COMPLETED", "CALLED")).toBe(false)
		expect(canTransition("CANCELLED", "SERVING")).toBe(false)
	})

	it("routes recall through waiting so the display separates the two lists", () => {
		expect(canTransition("RECALLED", "CALLED")).toBe(true)
		expect(canTransition("RECALLED", "SERVING")).toBe(false)
	})

	it("carries the ticket number and both states into the error", () => {
		try {
			assertTransition("COMPLETED", "CALLED", {
				ticketNumber: "A-042",
				counterId: "c3",
			})
			throw new Error("expected a throw")
		} catch (error) {
			expect(error).toBeInstanceOf(QueueError)
			expect(error.details.ticketNumber).toBe("A-042")
			expect(error.details.from).toBe("COMPLETED")
			expect(error.details.to).toBe("CALLED")
			expect(error.message).toContain("مكتملة") // Arabic, per invariant 7
		}
	})

	it("names every status in Arabic for the screen", () => {
		expect(statusLabelAr("WAITING")).toBe("في الانتظار")
		expect(statusLabelAr("COMPLETED")).toBe("مكتملة")
		expect(statusLabelAr("WAITING")).not.toBe("WAITING")
	})
})

describe("calling rules — who is served next", () => {
	it("serves the oldest first within a priority", () => {
		const rows = [
			ticket({ id: "c", number: "A-003", sequence: 3, issuedAt: 3_000 }),
			ticket({ id: "a", number: "A-001", sequence: 1, issuedAt: 1_000 }),
			ticket({ id: "b", number: "A-002", sequence: 2, issuedAt: 2_000 }),
		]
		expect(selectNext(rows)?.id).toBe("a")
		expect(waitingTickets(rows).map((t) => t.id)).toEqual(["a", "b", "c"])
	})

	it("serves an urgent ticket ahead of older normal ones", () => {
		// The whole point of a priority: a customer flagged urgent must not
		// sit behind twenty normal tickets.
		const rows = [
			ticket({ id: "n1", number: "A-001", issuedAt: 1_000 }),
			ticket({ id: "n2", number: "A-002", issuedAt: 2_000 }),
			ticket({
				id: "u",
				number: "A-003",
				issuedAt: 3_000,
				priority: "URGENT",
			}),
		]
		expect(selectNext(rows)?.id).toBe("u")
		expect(compareCandidates(rows[2], rows[0])).toBeLessThan(0)
	})

	it("breaks a same-millisecond tie by sequence, so the order is total", () => {
		const rows = [
			ticket({ id: "second", number: "A-002", sequence: 2, issuedAt: 5_000 }),
			ticket({ id: "first", number: "A-001", sequence: 1, issuedAt: 5_000 }),
		]
		expect(selectNext(rows)?.id).toBe("first")
	})

	it("includes a skipped ticket again (it reappears in the queue)", () => {
		const rows = [
			ticket({ id: "s", number: "A-001", status: "SKIPPED", issuedAt: 1_000 }),
			ticket({ id: "w", number: "A-002", issuedAt: 2_000 }),
		]
		expect(selectNext(rows)?.id).toBe("s")
		expect(isActiveInQueue("SKIPPED")).toBe(true)
	})

	it("never serves a ticket that is being served or already done", () => {
		const rows = [
			ticket({ id: "serving", status: "SERVING" }),
			ticket({ id: "done", status: "COMPLETED", issuedAt: 1 }),
			ticket({ id: "cancel", status: "CANCELLED", issuedAt: 2 }),
		]
		expect(selectNext(rows)).toBeNull()
		expect(isQueueEmpty(rows)).toBe(true)
		expect(codeOf(() => requireNext(rows))).toBe(QUEUE_ERROR_CODES.QUEUE_EMPTY)
	})

	it("honours a counter dedicated to one service", () => {
		const rows = [
			ticket({ id: "other", serviceId: "bar", issuedAt: 1_000 }),
			ticket({ id: "mine", serviceId: "kitchen", issuedAt: 5_000 }),
		]
		expect(selectNext(rows, "kitchen")?.id).toBe("mine")
		// A dedicated counter with nothing of its own waits rather than
		// serving another department's customer.
		expect(selectNext([rows[0]], "kitchen")).toBeNull()
	})

	it("refuses a call on a counter that still holds a ticket", () => {
		expect(codeOf(() => assertCounterFree("t1"))).toBe(
			QUEUE_ERROR_CODES.COUNTER_BUSY,
		)
		expect(() => assertCounterFree(undefined)).not.toThrow()
	})

	it("refuses to call a ticket that is not waiting", () => {
		expect(
			codeOf(() => assertCanCall(ticket({ status: "SERVING" }), "c1")),
		).toBe(QUEUE_ERROR_CODES.INVALID_TRANSITION)
		expect(codeOf(() => assertCanCall(ticket(), ""))).toBe(
			QUEUE_ERROR_CODES.VALIDATION,
		)
	})

	it("recalls the most RECENT call of that counter", () => {
		// The customer remembers "I was called a moment ago", so recency
		// wins here — the opposite of the queue order.
		const rows = [
			ticket({
				id: "old",
				number: "A-001",
				status: "CALLED",
				counterId: "c1",
				calledAt: 1_000,
			}),
			ticket({
				id: "new",
				number: "A-009",
				status: "RECALLED",
				counterId: "c1",
				calledAt: 5_000,
			}),
			ticket({
				id: "other",
				number: "A-002",
				status: "CALLED",
				counterId: "c2",
				calledAt: 9_000,
			}),
		]
		expect(selectRecall(rows, "c1")?.id).toBe("new")
		expect(selectRecall(rows, "c2")?.id).toBe("other")
		expect(selectRecall(rows, "c3")).toBeNull()
	})
})

describe("event bus — delivery must be exactly once and in order", () => {
	const event = (over = {}) => ({
		id: over.id ?? `e-${over.version ?? 1}`,
		type: over.type ?? "TICKET_CALLED",
		version: over.version ?? 1,
		at: over.at ?? 1_000,
		sessionId: "s1",
		origin: "kiosk",
		...over,
	})

	it("delivers once, then drops the replay of the same event", async () => {
		// A reconnect replays events the device already handled. Running
		// "complete ticket" twice frees the counter twice and doubles
		// served_count.
		const bus = new QueueEventBus()
		const seen = []
		bus.on("TICKET_CALLED", (e) => seen.push(e.id))

		const first = event({ id: "x", version: 1 })
		expect(await bus.emit(first)).toBe(true)
		expect(await bus.emit(first)).toBe(false)
		expect(seen).toEqual(["x"])
		expect(bus.dropped).toBe(1)
	})

	it("drops an older version that arrives after a newer one", async () => {
		// Out-of-order delivery after an outage: two screens showing two
		// different numbers is the visible symptom.
		const bus = new QueueEventBus()
		const seen = []
		bus.onAny((e) => seen.push(e.version))

		expect(await bus.emit(event({ id: "n", version: 12 }))).toBe(true)
		expect(await bus.emit(event({ id: "o", version: 10 }))).toBe(false)
		expect(seen).toEqual([12])
		expect(bus.version).toBe(12)
	})

	it("isolates a failing handler from the rest", async () => {
		// A broken customer-display component must not silence the voice
		// announcement or the dashboard refresh.
		const bus = new QueueEventBus()
		const seen = []
		bus.on("TICKET_CALLED", () => {
			throw new Error("display is broken")
		})
		bus.on("TICKET_CALLED", (e) => seen.push(e.id))

		await expect(bus.emit(event({ id: "ok", version: 1 }))).resolves.toBe(true)
		expect(seen).toEqual(["ok"])
	})

	it("stops delivering after unsubscribe", async () => {
		const bus = new QueueEventBus()
		const seen = []
		const off = bus.on("TICKET_CALLED", (e) => seen.push(e.id))
		await bus.emit(event({ id: "a", version: 1 }))
		off()
		await bus.emit(event({ id: "b", version: 2 }))
		expect(seen).toEqual(["a"])
	})

	it("knows when a device is behind the local version", async () => {
		// After a sync the device adopts the version it now holds, so the
		// same events are not replayed into it a second time.
		const bus = new QueueEventBus()
		await bus.emit(event({ id: "a", version: 5 }))
		expect(bus.isSynced(5)).toBe(true)
		expect(bus.isSynced(3)).toBe(false)
		bus.adoptVersion(9)
		expect(bus.isSynced(9)).toBe(true)
	})
})
