/**
 * Durable local sale — the device-is-the-database promise.
 *
 * A cashier presses pay on a dead network (or seconds before a power cut)
 * and the sale must land WHOLE: invoice row + payment rows + sync-queue row
 * + reservation commits + stock decrements in ONE atomic unit. A queue row
 * without an invoice is a silent loss at sync time; an invoice without a
 * queue row is a ghost the server never learns.
 *
 * Also pins: replay idempotency (double-tap, same invoiceNo → single sale),
 * unknown-stock items keep their ACTIVE reservation guard, void permission
 * gates with audit + queued void op, and dead-letter recovery.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

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

/** Capable fake: compound where + first + bulk ops + orderBy (what the
 * durable write path needs beyond the basic table fake). */
function createTable(rows = new Map()) {
	const match = (row, field, value) => {
		if (field.startsWith("[") && field.endsWith("]")) {
			const keys = field.slice(1, -1).split("+")
			return keys.every((key, index) => row[key] === value[index])
		}
		return row[field] === value
	}
	const table = {
		rows,
		get: async (key) => rows.get(key),
		put: async (row) => {
			const id = row.id ?? row.key ?? `k${rows.size + 1}`
			rows.set(id, { ...row, id })
			return id
		},
		add: async (row) => {
			const id = row.id ?? `k${rows.size + 1}`
			rows.set(id, { ...row, id })
			return id
		},
		bulkAdd: async (list) => {
			const ids = []
			for (const row of list) ids.push(await table.add(row))
			return ids
		},
		bulkPut: async (list) => {
			for (const row of list) await table.put(row)
			return list.length
		},
		update: async (id, patch) => {
			const current = rows.get(id)
			if (!current) return 0
			rows.set(id, { ...current, ...patch })
			return 1
		},
		delete: async (id) => (rows.delete(id) ? 1 : 0),
		toArray: async () => Array.from(rows.values()),
		where(field) {
			const query = {
				equals(value) {
					const matched = Array.from(rows.values()).filter((row) =>
						match(row, field, value),
					)
					return {
						toArray: async () => matched,
						first: async () => matched[0] ?? null,
						delete: async () => {
							for (const row of matched) rows.delete(row.id)
							return matched.length
						},
					}
				},
			}
			return query
		},
		orderBy(field) {
			const sorted = () =>
				Array.from(rows.values()).sort((a, b) =>
					String(a[field] ?? "") < String(b[field] ?? "")
						? -1
						: String(a[field] ?? "") > String(b[field] ?? "")
							? 1
							: 0,
				)
			return {
				reverse: () => ({
					limit: (n) => ({
						toArray: async () => sorted().reverse().slice(0, n),
					}),
					toArray: async () => sorted().reverse(),
				}),
				limit: (n) => ({ toArray: async () => sorted().slice(0, n) }),
				toArray: async () => sorted(),
			}
		},
	}
	return table
}

const mocks = vi.hoisted(() => {
	const tables = {
		customers: createTable(),
		items: createTable(),
		stock: createTable(),
		invoices: createTable(),
		payments: createTable(),
		settings: createTable(),
		syncQueue: createTable(),
		syncAudit: createTable(),
		sessions: createTable(),
		dailyReports: createTable(),
		reservations: createTable(),
		users: createTable(),
	}
	const fakeDb = {
		...tables,
		table: (name) => tables[name],
	}
	return { tables, fakeDb }
})

vi.mock("@/services/db", () => ({
	default: mocks.fakeDb,
}))

import { OfflineStore, upsertQueueRow } from "@/services/offline-store"
import { voidSale } from "@/repositories/saleRepository"

const store = new OfflineStore(mocks.fakeDb)

function clearTables() {
	for (const table of Object.values(mocks.tables)) table.rows.clear()
	localStorage.clear()
}

function signInAs(role, email = "cashier@shop.test") {
	localStorage.setItem(
		"dypos_user_session",
		JSON.stringify({ email, role, loginTime: Date.now() }),
	)
}

const SALE_DOC = () => ({
	entityType: "invoice",
	entityId: "POS-BR-T1-20260101-00001",
	operation: "create",
	queuePayload: {
		invoice_id: "POS-BR-T1-20260101-00001",
		customerId: null,
		items: [
			{
				productId: "ITEM-1",
				code: "A1",
				name: "صنف",
				quantity: 2,
				unitPrice: 50,
			},
		],
		total: 100,
	},
	invoice: {
		invoiceNo: "POS-BR-T1-20260101-00001",
		customerId: null,
		items: [
			{
				productId: "ITEM-1",
				code: "A1",
				name: "صنف",
				quantity: 2,
				unitPrice: 50,
			},
		],
		total: 100,
		paid: 100,
		balance: 0,
		date: new Date().toISOString(),
		terminalId: "T1",
		shiftId: null,
	},
	payments: [{ method: "cash", amount: 100, reference: null, date: null }],
	commitItems: [{ itemId: "ITEM-1", qty: 2 }],
})

describe("enqueueInvoiceSale (atomic durable write)", () => {
	beforeEach(clearTables)

	it("writes invoice + payment + queue row + commits reservation + decrements stock", async () => {
		mocks.tables.reservations.rows.set("r1", {
			id: "r1",
			invoiceId: "POS-BR-T1-20260101-00001",
			itemId: "ITEM-1",
			qty: 2,
			status: "active",
		})
		mocks.tables.stock.rows.set("s1", {
			id: "s1",
			itemId: "ITEM-1",
			qty: 10,
			batchNo: "B1",
		})

		const result = await store.enqueueInvoiceSale(SALE_DOC())
		expect(result.replayed).toBe(false)

		const invoices = await mocks.tables.invoices.toArray()
		expect(invoices).toHaveLength(1)
		expect(invoices[0]).toMatchObject({
			invoiceNo: "POS-BR-T1-20260101-00001",
			total: 100,
			paid: 100,
			status: "COMPLETED",
		})
		const payments = await mocks.tables.payments.toArray()
		expect(payments).toHaveLength(1)
		expect(payments[0]).toMatchObject({ method: "cash", amount: 100 })
		const queue = await mocks.tables.syncQueue.toArray()
		expect(queue).toHaveLength(1)
		expect(queue[0]).toMatchObject({
			status: "pending",
			entityId: "POS-BR-T1-20260101-00001",
		})
		const reservation = mocks.tables.reservations.rows.get("r1")
		expect(reservation.status).toBe("committed")
		expect(mocks.tables.stock.rows.get("s1").qty).toBe(8)
	})

	it("replays the same invoiceNo instead of duplicating (double-tap safe)", async () => {
		const first = await store.enqueueInvoiceSale(SALE_DOC())
		const second = await store.enqueueInvoiceSale(SALE_DOC())
		expect(first.replayed).toBe(false)
		expect(second.replayed).toBe(true)
		expect(await mocks.tables.invoices.toArray()).toHaveLength(1)
		expect(await mocks.tables.payments.toArray()).toHaveLength(1)
		expect(await mocks.tables.syncQueue.toArray()).toHaveLength(1)
	})

	it("keeps ACTIVE reservations for unknown-stock items (guard preserved)", async () => {
		mocks.tables.reservations.rows.set("r9", {
			id: "r9",
			invoiceId: "POS-BR-T1-20260101-00001",
			itemId: "GHOST-ITEM",
			qty: 1,
			status: "active",
		})
		const doc = SALE_DOC()
		doc.commitItems = []
		await store.enqueueInvoiceSale(doc)
		expect(mocks.tables.reservations.rows.get("r9").status).toBe("active")
	})

	it("rejects empty sales before writing anything", async () => {
		const doc = SALE_DOC()
		doc.invoice.items = []
		await expect(store.enqueueInvoiceSale(doc)).rejects.toThrow()
		expect(await mocks.tables.invoices.toArray()).toHaveLength(0)
		expect(await mocks.tables.syncQueue.toArray()).toHaveLength(0)
	})
})

describe("upsertQueueRow (single dedupe rule)", () => {
	beforeEach(clearTables)

	it("adds once then updates the pending row on retry", async () => {
		const first = await upsertQueueRow(mocks.fakeDb, {
			entityType: "invoice",
			entityId: "INV-7",
			operation: "create",
			payload: { total: 10 },
		})
		const second = await upsertQueueRow(mocks.fakeDb, {
			entityType: "invoice",
			entityId: "INV-7",
			operation: "create",
			payload: { total: 12 },
		})
		expect(first.updated).toBe(false)
		expect(second.updated).toBe(true)
		expect(second.id).toBe(first.id)
		const rows = await mocks.tables.syncQueue.toArray()
		expect(rows).toHaveLength(1)
		expect(rows[0].payload.total).toBe(12)
	})
})

describe("voidSale (permission-gated, audited, queued)", () => {
	beforeEach(clearTables)

	async function completedSale() {
		await store.enqueueInvoiceSale(SALE_DOC())
		const [invoice] = await mocks.tables.invoices.toArray()
		return invoice
	}

	it("rejects an empty reason", async () => {
		signInAs("ADMIN")
		const invoice = await completedSale()
		await expect(voidSale(invoice.id, "")).rejects.toThrow()
	})

	it("rejects anonymous callers", async () => {
		const invoice = await completedSale()
		await expect(voidSale(invoice.id, "خطأ")).rejects.toThrow()
	})

	it("rejects CASHIER voiding a COMPLETED (money-moved) sale", async () => {
		signInAs("CASHIER")
		const invoice = await completedSale()
		await expect(voidSale(invoice.id, "خطأ")).rejects.toThrow(/مشرف/)
	})

	it("rejects AUDITOR voids entirely (read-only)", async () => {
		signInAs("AUDITOR")
		const invoice = await completedSale()
		await expect(voidSale(invoice.id, "مراجعة")).rejects.toThrow()
	})

	it("lets MANAGER void a COMPLETED sale with audit + queued void op", async () => {
		signInAs("MANAGER", "manager@shop.test")
		const invoice = await completedSale()
		const voided = await voidSale(invoice.id, "فاتورة مكررة")
		expect(voided.status).toBe("VOIDED")
		expect(voided.voidReason).toBe("فاتورة مكررة")
		expect(voided.voidedBy).toBe("manager@shop.test")

		const audits = await mocks.tables.syncAudit.toArray()
		expect(
			audits.some(
				(a) =>
					a.resolution === "voided" && a.details?.reason === "فاتورة مكررة",
			),
		).toBe(true)
		const ops = await mocks.tables.syncQueue.toArray()
		expect(
			ops.some(
				(op) => op.operation === "update" && op.payload?.voided === true,
			),
		).toBe(true)
	})

	it("lets CASHIER void an unpaid OPEN sale", async () => {
		signInAs("CASHIER")
		const doc = SALE_DOC()
		doc.invoice.paid = 0
		doc.invoice.balance = 100
		doc.payments = []
		await store.enqueueInvoiceSale(doc)
		const [invoice] = await mocks.tables.invoices.toArray()
		expect(invoice.status).toBe("OPEN")
		const voided = await voidSale(invoice.id, "زبون غادر")
		expect(voided.status).toBe("VOIDED")
	})
})

describe("dead-letter recovery", () => {
	beforeEach(clearTables)

	it("marks retry exhaustion as failed AND audits it, then reopens on retry", async () => {
		const rowId = await mocks.tables.syncQueue.add({
			entityType: "invoice",
			entityId: "INV-9",
			operation: "create",
			payload: {},
			createdAt: new Date(),
			attemptCount: 9,
			status: "pending",
		})
		await store.markRetry(rowId, "الشبكة ميتة")
		const dead = mocks.tables.syncQueue.rows.get(rowId)
		expect(dead.status).toBe("failed")
		const audits = await mocks.tables.syncAudit.toArray()
		expect(audits.some((a) => a.resolution === "dead-letter")).toBe(true)

		expect(await store.retryFailed(rowId)).toBe(true)
		const reopened = mocks.tables.syncQueue.rows.get(rowId)
		expect(reopened.status).toBe("pending")
		expect(reopened.attemptCount).toBe(0)
	})

	it("refuses to reopen non-failed rows", async () => {
		const rowId = await mocks.tables.syncQueue.add({
			entityType: "invoice",
			entityId: "INV-10",
			operation: "create",
			payload: {},
			createdAt: new Date(),
			attemptCount: 0,
			status: "pending",
		})
		expect(await store.retryFailed(rowId)).toBe(false)
		expect(await store.retryFailed("missing")).toBe(false)
	})
})
