/**
 * Oversight report gate: the audit ledger is readable by supervisors and
 * auditors, invisible to cashiers — at the tab level AND the loader level,
 * so a deep link cannot bypass the rule. No network is touched.
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

const mocks = vi.hoisted(() => {
	const rows = new Map()
	const syncAudit = {
		rows,
		orderBy() {
			return {
				reverse: () => ({
					limit: (n) => ({
						toArray: async () =>
							Array.from(rows.values())
								.sort((a, b) => Number(a.id) - Number(b.id))
								.reverse()
								.slice(0, n),
					}),
				}),
			}
		},
		add: async (row) => {
			const id = rows.size + 1
			rows.set(id, { ...row, id })
			return id
		},
	}
	return {
		rows,
		fakeDb: { syncAudit, table: (name) => ({ syncAudit })[name] },
	}
})

vi.mock("@/services/db", () => ({
	default: mocks.fakeDb,
}))

import { loadLocalAudit } from "@/data/workScreens"

function signInAs(role) {
	localStorage.setItem(
		"dypos_user_session",
		JSON.stringify({ email: `${role}@shop.test`, role, loginTime: Date.now() }),
	)
}

beforeEach(() => {
	mocks.rows.clear()
	localStorage.clear()
})

describe("loadLocalAudit (oversight report source)", () => {
	it("refuses CASHIER (deep links cannot bypass the hidden tab)", async () => {
		signInAs("CASHIER")
		await mocks.fakeDb.syncAudit.add({
			entityType: "invoice",
			entityId: "INV-1",
			conflictType: "status",
			resolution: "voided",
			details: { reason: "خطأ", actor: "manager@shop.test" },
			createdDate: new Date(),
		})
		const result = await loadLocalAudit(200)
		expect(result.rows).toHaveLength(0)
		expect(result.error).toMatch(/صلاحية/)
	})

	it("shows voids, dead-letters and conflicts newest-first for MANAGER", async () => {
		signInAs("MANAGER")
		await mocks.fakeDb.syncAudit.add({
			entityType: "invoice",
			entityId: "INV-1",
			conflictType: "status",
			resolution: "voided",
			details: { reason: "مكررة", actor: "manager@shop.test" },
			createdDate: new Date("2026-01-01T10:00:00Z"),
		})
		await mocks.fakeDb.syncAudit.add({
			entityType: "invoice",
			entityId: "INV-2",
			conflictType: "transport",
			resolution: "dead-letter",
			details: { message: "الشبكة ميتة", attemptCount: 10 },
			createdDate: new Date("2026-01-02T10:00:00Z"),
		})
		const result = await loadLocalAudit(200)
		expect(result.error).toBeNull()
		expect(result.source).toBe("local")
		expect(result.rows).toHaveLength(2)
		expect(result.rows[0].event).toMatch(/فشل مزامنة/)
		expect(result.rows[1].event).toMatch(/إلغاء/)
		expect(result.rows[1].actor).toBe("manager@shop.test")
	})

	it("lets AUDITOR read (read-only oversight role)", async () => {
		signInAs("AUDITOR")
		const result = await loadLocalAudit(200)
		expect(result.error).toBeNull()
	})
})
