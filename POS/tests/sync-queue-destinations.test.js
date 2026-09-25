/**
 * Queue destination-awareness regression (runtime sync targets).
 *
 * The legacy same-origin path must behave byte-identically, while a chosen
 * branch/cloud destination syncs via idempotent REST with per-destination
 * marking — one device, many ledgers, no double-posts, no silent loss.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	call: vi.fn(),
}))

vi.mock("@/services/sync-remote", () => ({
	pushInvoiceToDestination: vi.fn(),
}))

const rows = new Map()
let seq = 1

vi.mock("@/utils/offline/db", () => ({
	db: {
		invoice_queue: {
			add: async (row) => {
				const id = seq++
				rows.set(id, { ...row, id })
				return id
			},
			get: async (id) => rows.get(id) || null,
			update: async (id, patch) => {
				const cur = rows.get(id)
				if (!cur) return 0
				rows.set(id, { ...cur, ...patch })
				return 1
			},
			filter: (fn) => {
				const matched = [...rows.values()].filter(fn)
				return {
					toArray: async () => matched,
					delete: async () => {
						for (const r of matched) rows.delete(r.id)
						return matched.length
					},
				}
			},
		},
	},
}))

import { pushInvoiceToDestination } from "@/services/sync-remote"
import {
	applySyncedTo,
	getOfflineInvoices,
	syncOfflineInvoices,
} from "@/utils/offline/sync"

const BRANCH = {
	id: "b1",
	name: "فرع العليا",
	kind: "branch",
	baseUrl: "http://10.0.0.5:3001",
}

function queueInvoice(overrides = {}) {
	return {
		id: 1,
		offline_id: "pos_offline_1",
		timestamp: Date.now(),
		synced: false,
		data: { customer: "x", items: [], payments: [] },
		...overrides,
	}
}

beforeEach(() => {
	rows.clear()
	seq = 1
	localStorage.clear()
	vi.mocked(pushInvoiceToDestination).mockReset()
})

describe("applySyncedTo (pure)", () => {
	it("legacy default keeps the flat flags", () => {
		expect(applySyncedTo({}, null, "INV-1")).toMatchObject({
			synced: true,
			server_invoice: "INV-1",
			syncedTo: { local: expect.any(Object) },
		})
	})

	it("remote destinations accumulate without touching legacy flags", () => {
		const first = applySyncedTo({}, "b1", "B-9", "uuid-9")
		expect(first.synced).toBeUndefined()
		expect(first.syncedTo.b1).toMatchObject({
			serverName: "B-9",
			invoiceId: "uuid-9",
		})
		const second = applySyncedTo(
			{ syncedTo: first.syncedTo },
			"b2",
			"B-2",
			"uuid-2",
		)
		expect(Object.keys(second.syncedTo).sort()).toEqual(["b1", "b2"])
	})
})

describe("getOfflineInvoices destination filter", () => {
	it("default path returns legacy-unsynced only", async () => {
		const { db } = await import("@/utils/offline/db")
		await db.invoice_queue.add(queueInvoice({ id: undefined }))
		await db.invoice_queue.add(
			queueInvoice({ synced: true, server_invoice: "INV-1" }),
		)
		expect((await getOfflineInvoices()).length).toBe(1)
		// The legacy-synced row is STILL pending for the branch (multi-ledger).
		expect((await getOfflineInvoices("b1")).length).toBe(2)
	})

	it("remote filter hides rows already synced to that destination", async () => {
		const { db } = await import("@/utils/offline/db")
		const id = await db.invoice_queue.add(queueInvoice({ id: undefined }))
		await db.invoice_queue.update(id, applySyncedTo(null, "b1", "B-9", "u"))
		expect((await getOfflineInvoices("b1")).length).toBe(0)
		expect((await getOfflineInvoices("b2")).length).toBe(1)
		expect((await getOfflineInvoices()).length).toBe(1)
	})
})

describe("syncOfflineInvoices to a runtime destination", () => {
	it("pushes via REST, marks per-destination, never touches legacy flags", async () => {
		const { db } = await import("@/utils/offline/db")
		const id = await db.invoice_queue.add(queueInvoice({ id: undefined }))
		vi.mocked(pushInvoiceToDestination).mockResolvedValueOnce({
			ok: true,
			deduped: false,
			invoiceId: "srv-1",
			serverName: "INV-9",
		})

		const result = await syncOfflineInvoices({
			destination: BRANCH,
			token: "tok",
		})

		expect(result).toMatchObject({ success: 1, failed: 0 })
		expect(pushInvoiceToDestination).toHaveBeenCalledTimes(1)
		expect(vi.mocked(pushInvoiceToDestination).mock.calls[0][2]).toMatchObject({
			token: "tok",
		})
		const row = await db.invoice_queue.get(id)
		expect(row.synced).toBe(false)
		expect(row.syncedTo.b1).toMatchObject({ serverName: "INV-9" })
		// Legacy pending still lists it (never reached the default server).
		expect((await getOfflineInvoices()).length).toBe(1)
	})

	it("records failures with the remote Arabic message", async () => {
		const { db } = await import("@/utils/offline/db")
		await db.invoice_queue.add(queueInvoice({ id: undefined }))
		vi.mocked(pushInvoiceToDestination).mockResolvedValueOnce({
			ok: false,
			code: "UNKNOWN_SKU",
			message: "أصناف غير معرّفة",
		})

		const result = await syncOfflineInvoices({ destination: BRANCH })
		expect(result.failed).toBe(1)
		expect(String(result.errors[0].error.message)).toContain("أصناف")
	})
})
