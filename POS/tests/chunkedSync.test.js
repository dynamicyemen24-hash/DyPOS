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

import {
	INITIAL_SYNC_MAX_PAGES,
	INITIAL_SYNC_PAGE_SIZE,
	pushPriorityFor,
	runInitialSync,
	pushPendingChanges,
} from "@/services/sync-core"

/**
 * A fake sync store that records applied remote rows per page.
 */
function createSyncStore() {
	const local = new Map()
	const checkpoint = { value: 0 }
	return {
		local,
		checkpoint,
		async applyRemoteChanges(entityType, rows) {
			const applied = []
			for (const change of rows) {
				const id = change.id ?? change.data?.id
				local.set(`${entityType}:${id}`, change.data ?? change)
				applied.push({ id })
			}
			return { applied, conflicts: [] }
		},
		async getCheckpoint() {
			return checkpoint.value
		},
		async setCheckpoint(ts) {
			checkpoint.value = ts
			return ts
		},
		async markLastSync() {},
	}
}

function makeChanges(count, offset = 0) {
	return Array.from({ length: count }, (_, index) => ({
		entityType: "items",
		id: `I-${offset + index + 1}`,
		data: {
			code: `C${offset + index + 1}`,
			name: `Item ${offset + index}`,
			price: 10,
		},
		updatedAt: "2026-01-02T00:00:00Z",
	}))
}

describe("chunked initial sync — المزامنة الأولية المجزأة", () => {
	it("يجلب صفحة واحدة عندما تكون أصغر من حجم الصفحة", async () => {
		const store = createSyncStore()
		const calls = []
		const protocol = {
			async get(_endpoint, params) {
				calls.push(params)
				return {
					changes: makeChanges(120),
					server_time: 1_700_000_000_000,
				}
			},
		}

		const result = await runInitialSync({ protocol, store })

		expect(calls).toHaveLength(1)
		expect(calls[0].since).toBe(0)
		expect(calls[0].limit).toBe(INITIAL_SYNC_PAGE_SIZE)
		expect(result.applied).toBe(120)
		expect(result.pages).toBe(1)
		expect(result.serverTime).toBe(1_700_000_000_000)
		expect(store.checkpoint.value).toBe(1_700_000_000_000)
	})

	it("يستمر عبر عدة صفحات ويمرر التقدم إلى onProgress", async () => {
		const store = createSyncStore()
		const pages = [makeChanges(2, 0), makeChanges(2, 2), makeChanges(1, 4)]
		let pageIndex = 0
		const progress = []
		const protocol = {
			async get() {
				const changes = pages[pageIndex] ?? []
				const isLast = pageIndex === pages.length - 1
				pageIndex += 1
				return {
					changes,
					has_more: !isLast,
					next_cursor: isLast ? undefined : `cursor-${pageIndex}`,
					server_time: 1_700_000_000_000 + pageIndex,
				}
			},
		}

		const result = await runInitialSync({
			protocol,
			store,
			pageSize: 2,
			onProgress: (p) => progress.push({ ...p }),
		})

		expect(result.pages).toBe(3)
		expect(result.applied).toBe(5)
		expect(progress.map((p) => p.applied)).toEqual([2, 4, 5])
		expect(store.local.size).toBe(5)
	})

	it("يوقف الحلقة عند حد الأمان الأقصى للصفحات", async () => {
		const store = createSyncStore()
		let calls = 0
		const protocol = {
			async get() {
				calls += 1
				return {
					changes: makeChanges(INITIAL_SYNC_PAGE_SIZE),
					has_more: true,
					server_time: 1_700_000_000_000,
				}
			},
		}

		const result = await runInitialSync({ protocol, store })
		expect(calls).toBe(INITIAL_SYNC_MAX_PAGES)
		expect(result.pages).toBe(INITIAL_SYNC_MAX_PAGES)
	})

	it("لا يقدّم نقطة تفتيش دون توقيت خادم موثوق", async () => {
		const store = createSyncStore()
		const protocol = {
			async get() {
				return { changes: [] }
			},
		}

		const result = await runInitialSync({ protocol, store })
		expect(result.pages).toBe(1)
		expect(result.applied).toBe(0)
		expect(store.checkpoint.value).toBe(0)
	})
})

describe("push priority — أولويات الدفع", () => {
	it("يرتب الأولويات: الفواتير قبل الدفعات قبل العملاء قبل الإعدادات", () => {
		expect(pushPriorityFor("invoice")).toBeLessThan(pushPriorityFor("payment"))
		expect(pushPriorityFor("payment")).toBeLessThan(pushPriorityFor("customer"))
		expect(pushPriorityFor("customer")).toBeLessThan(pushPriorityFor("item"))
		expect(pushPriorityFor("item")).toBeLessThan(pushPriorityFor("settings"))
		expect(pushPriorityFor("unknown-entity")).toBe(9)
	})

	it("يدفع الفواتير أولًا مهما كان ترتيب إدراجها في القائمة", async () => {
		const pushedOrder = []
		const protocol = {
			async post(_endpoint, body) {
				pushedOrder.push(`${body.entity_type}:${body.entity_id}`)
				return { remote_id: body.entity_id }
			},
		}
		const store = {
			async pendingOperations() {
				return [
					{
						id: 1,
						entityType: "settings",
						entityId: "theme",
						operation: "update",
						payload: {},
						createdAt: new Date("2026-01-01T00:00:00Z"),
					},
					{
						id: 2,
						entityType: "invoice",
						entityId: "INV-2",
						operation: "create",
						payload: { customerId: "C1", items: [], total: 5 },
						createdAt: new Date("2026-01-01T00:00:05Z"),
					},
					{
						id: 3,
						entityType: "invoice",
						entityId: "INV-1",
						operation: "create",
						payload: { customerId: "C1", items: [], total: 5 },
						createdAt: new Date("2026-01-01T00:00:01Z"),
					},
				]
			},
			async markSynced() {},
			async markFailed() {},
			async audit() {},
		}

		const result = await pushPendingChanges(protocol, store)

		expect(result.pushed).toBe(3)
		expect(pushedOrder).toEqual([
			"invoice:INV-1",
			"invoice:INV-2",
			"settings:theme",
		])
	})
})
