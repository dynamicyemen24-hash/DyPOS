import { describe, expect, it } from "vitest"

import {
	POS_PERMISSION_KEYS,
	POS_PERMISSION_CHECKS,
	DEFAULT_POS_PERMISSIONS,
	resolvePermissionChecks,
	buildPermissionSnapshot,
	preloadPOSPermissions,
} from "@/utils/permissions"

describe("permission registry", () => {
	it("maps every operation key to a doctype check", () => {
		for (const op of Object.values(POS_PERMISSION_KEYS)) {
			expect(POS_PERMISSION_CHECKS[op]).toBeDefined()
			expect(POS_PERMISSION_CHECKS[op].doctype).toBeTruthy()
			expect(POS_PERMISSION_CHECKS[op].permType).toBeTruthy()
		}
	})

	it("defaults every operation to true (optimistic)", () => {
		for (const op of Object.values(POS_PERMISSION_KEYS)) {
			expect(DEFAULT_POS_PERMISSIONS[op]).toBe(true)
		}
	})

	it("resolves checks for a subset of operations", () => {
		const checks = resolvePermissionChecks([POS_PERMISSION_KEYS.MAKE_SALE])
		expect(checks).toHaveLength(1)
		expect(checks[0]).toMatchObject({
			op: POS_PERMISSION_KEYS.MAKE_SALE,
			doctype: "Sales Invoice",
		})
	})
})

describe("buildPermissionSnapshot", () => {
	it("maps doctype:permType results back to operation keys", () => {
		const snapshot = buildPermissionSnapshot({
			"Sales Invoice:create": true,
			"POS Settings:write": false,
		})
		expect(snapshot[POS_PERMISSION_KEYS.MAKE_SALE]).toBe(true)
		expect(snapshot[POS_PERMISSION_KEYS.EDIT_SETTINGS]).toBe(false)
	})

	it("falls back to defaults for missing results", () => {
		const snapshot = buildPermissionSnapshot({})
		expect(snapshot[POS_PERMISSION_KEYS.VOID_INVOICE]).toBe(true)
	})
})

describe("preloadPOSPermissions", () => {
	it("resolves every operation through the injected checker", async () => {
		const hasPermission = async (_doctype, permType) => permType === "create"

		const result = await preloadPOSPermissions({ hasPermission })

		expect(result[POS_PERMISSION_KEYS.MAKE_SALE]).toBe(true)
		expect(result[POS_PERMISSION_KEYS.VOID_INVOICE]).toBe(false)
	})

	it("keeps optimistic defaults when the checker throws", async () => {
		const result = await preloadPOSPermissions({
			hasPermission: async () => {
				throw new Error("network down")
			},
		})

		for (const op of Object.values(POS_PERMISSION_KEYS)) {
			expect(result[op]).toBe(true)
		}
	})
})
