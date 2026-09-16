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

const mocks = vi.hoisted(() => {
	const createTable = (rows = new Map()) => ({
		rows,
		get: async (key) => rows.get(key),
		put: async (row) => {
			const id = row.id ?? row.key ?? `${rows.size + 1}`
			rows.set(id, { ...row, id })
			return id
		},
		add: async (row) => {
			const id = row.id ?? `${rows.size + 1}`
			rows.set(id, { ...row, id })
			return id
		},
		update: async (id, patch) => {
			const current = rows.get(id)
			if (!current) return 0
			rows.set(id, { ...current, ...patch })
			return 1
		},
		delete: async (id) => {
			if (id == null) return 0
			return rows.delete(id) ? 1 : 0
		},
		toArray: async () => Array.from(rows.values()),
		where(field) {
			return {
				equals(value) {
					return {
						toArray: async () =>
							Array.from(rows.values()).filter((row) => row[field] === value),
					}
				},
			}
		},
	})

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

import { OfflineStore } from "@/services/offline-store"

const store = new OfflineStore(mocks.fakeDb)

function clearTables() {
	for (const table of Object.values(mocks.tables)) {
		table.rows.clear()
	}
}

describe("checkpoints", () => {
	beforeEach(clearTables)

	it("starts at 0 for a fresh installation", async () => {
		expect(await store.getCheckpoint()).toBe(0)
	})

	it("round-trips a checkpoint timestamp", async () => {
		const ts = new Date("2026-01-01T00:00:00Z").getTime()
		await store.setCheckpoint(ts)
		expect(await store.getCheckpoint()).toBe(ts)
	})
})

describe("sync queue", () => {
	beforeEach(clearTables)

	it("enqueues and lists pending operations", async () => {
		const id = await store.enqueue("invoice", "INV-1", "create", { total: 10 })
		expect(id).toBeTruthy()

		const pending = await store.pendingOperations()
		expect(pending).toHaveLength(1)
		expect(pending[0]).toMatchObject({
			entityType: "invoice",
			status: "pending",
		})
		expect(await store.getQueueCount()).toBe(1)
	})

	it("filters pending operations by entity type", async () => {
		await store.enqueue("invoice", "INV-1", "create", {})
		await store.enqueue("customer", "C-1", "create", {})
		expect(await store.pendingOperations("invoice")).toHaveLength(1)
		expect(await store.pendingOperations("customer")).toHaveLength(1)
		expect(await store.getQueueCount("invoice")).toBe(1)
	})

	it("marks rows synced / failed out of the pending set", async () => {
		const id = await store.enqueue("invoice", "INV-1", "create", {})
		await store.markSynced(id, "REM-1")
		expect(await store.pendingOperations()).toHaveLength(0)

		const id2 = await store.enqueue("invoice", "INV-2", "create", {})
		await store.markFailed(id2, "validation rejected")
		const failed = mocks.tables.syncQueue.rows.get(id2)
		expect(failed.status).toBe("failed")
		expect(failed.attemptCount).toBe(1)
	})
})

describe("applyRemoteChanges", () => {
	beforeEach(clearTables)

	it("upserts valid remote rows", async () => {
		const outcome = await store.applyRemoteChanges("customers", [
			{
				id: "C-1",
				data: { code: "C1", name: "Ali" },
				updatedAt: "2026-01-02T00:00:00Z",
			},
		])
		expect(outcome.applied).toHaveLength(1)
		expect(mocks.tables.customers.rows.get("C-1")).toMatchObject({
			code: "C1",
			name: "Ali",
			syncStatus: "synced",
		})
	})

	it("drops invalid rows and audits instead of failing the batch", async () => {
		const outcome = await store.applyRemoteChanges("customers", [
			{ id: "C-2", data: { code: "" }, updatedAt: "2026-01-02T00:00:00Z" },
		])
		expect(outcome.applied).toHaveLength(0)
		expect(mocks.tables.customers.rows.has("C-2")).toBe(false)
		expect(mocks.tables.syncAudit.rows.size).toBe(1)
	})

	it("keeps the local copy when it is newer than the remote one", async () => {
		mocks.tables.customers.rows.set("C-3", {
			id: "C-3",
			code: "C3",
			name: "Local",
			updatedAt: "2026-01-10T00:00:00Z",
		})

		const outcome = await store.applyRemoteChanges("customers", [
			{
				id: "C-3",
				data: { code: "C3", name: "Remote" },
				updatedAt: "2026-01-01T00:00:00Z",
			},
		])

		expect(outcome.conflicts).toHaveLength(1)
		expect(mocks.tables.customers.rows.get("C-3").name).toBe("Local")
	})

	it("applies remote tombstones", async () => {
		mocks.tables.customers.rows.set("C-4", {
			id: "C-4",
			code: "C4",
			name: "Gone",
		})
		await store.applyRemoteChanges("customers", [
			{ id: "C-4", deleted: true, updatedAt: "2026-01-03T00:00:00Z" },
		])
		expect(mocks.tables.customers.rows.has("C-4")).toBe(false)
	})
})
