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
	posContext,
	generateTerminalId,
	resolveTerminalId,
	importTerminalCode,
	refreshPosContext,
	applyPosContext,
	TERMINAL_STORAGE_KEY,
} from "@/utils/posContext"

function createStorage(initial = {}) {
	const data = { ...initial }
	return {
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = String(value)
		},
		removeItem: (key) => {
			delete data[key]
		},
	}
}

describe("generateTerminalId", () => {
	it("produces TERM-prefixed unique ids", () => {
		const a = generateTerminalId()
		const b = generateTerminalId()
		expect(a).toMatch(/^TERM-/)
		expect(b).toMatch(/^TERM-/)
		expect(a).not.toBe(b)
	})
})

describe("resolveTerminalId", () => {
	beforeEach(() => {
		posContext.terminalId = null
	})

	it("generates and persists a new id on first use", () => {
		const storage = createStorage()
		const id = resolveTerminalId(storage)
		expect(id).toMatch(/^TERM-/)
		expect(storage.getItem(TERMINAL_STORAGE_KEY)).toBe(id)
		expect(posContext.terminalId).toBe(id)
	})

	it("reuses a persisted id instead of regenerating", () => {
		const persisted = "TERM-existing"
		const storage = createStorage({ [TERMINAL_STORAGE_KEY]: persisted })
		const id = resolveTerminalId(storage)
		expect(id).toBe(persisted)
	})

	it("still works when storage is unavailable", () => {
		const id = resolveTerminalId(null)
		expect(id).toMatch(/^TERM-/)
	})
})

describe("importTerminalCode", () => {
	it("persists a provisioned code", () => {
		const storage = createStorage()
		expect(importTerminalCode("POS-STORE-01", storage)).toBe("POS-STORE-01")
		expect(storage.getItem(TERMINAL_STORAGE_KEY)).toBe("POS-STORE-01")
	})

	it("rejects empty codes", () => {
		expect(() => importTerminalCode("", createStorage())).toThrow()
		expect(() => importTerminalCode(null, createStorage())).toThrow()
	})
})

describe("refreshPosContext", () => {
	beforeEach(() => {
		Object.assign(posContext, {
			tenantId: null,
			tenantName: null,
			branchCode: null,
			branchName: null,
			terminalId: "TERM-x",
			posProfile: null,
			company: null,
		})
	})

	it("unwraps nested bootstrap objects", () => {
		refreshPosContext({
			bootstrapData: {
				tenant: { name: "Acme" },
				branch: { name: "Riyadh", code: "RUH-1" },
				pos_profile: { name: "Main POS" },
				company: "Acme Co",
			},
			auth: { tenantId: "t_123", employeeId: "e_9" },
		})

		expect(posContext.tenantId).toBe("t_123")
		expect(posContext.tenantName).toBe("Acme")
		expect(posContext.branchName).toBe("Riyadh")
		expect(posContext.branchCode).toBe("RUH-1")
		expect(posContext.posProfile).toBe("Main POS")
		expect(posContext.company).toBe("Acme Co")
	})

	it("falls back to prior context rather than nulling it", () => {
		posContext.branchName = "Jeddah"
		refreshPosContext({ bootstrapData: null })
		expect(posContext.branchName).toBe("Jeddah")
		expect(posContext.tenantId).toBeNull()
	})
})

describe("applyPosContext", () => {
	it("applies explicit branch overrides", () => {
		const snapshot = applyPosContext({
			branch: { name: "Dammam", code: "DMM-2" },
		})
		expect(snapshot.branchName).toBe("Dammam")
		expect(snapshot.branchCode).toBe("DMM-2")
	})
})
