import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"

import {
	useFeatureFlag,
	useExposedFeatureList,
} from "@/composables/useFeatureFlag"

beforeEach(() => {
	setActivePinia(createPinia())
})

afterEach(() => {
	vi.unstubAllGlobals()
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe("useFeatureFlag", () => {
	it("mirrors the store default (ON) before any fetch", () => {
		const { flagName, enabled, isOffline, loaded } =
			useFeatureFlag("print_spool")
		expect(flagName.value).toBe("PRINT_SPOOL")
		expect(enabled.value).toBe(true)
		expect(isOffline.value).toBe(false)
		expect(loaded.value).toBe(false)
	})

	it("is reactive: enabled flips when the server turns the flag OFF", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockReturnValueOnce(
					Promise.resolve({
						ok: true,
						status: 200,
						json: async () => ({
							features: [{ name: "PRINT_SPOOL", enabled: true }],
						}),
					}),
				)
				.mockReturnValueOnce(
					Promise.resolve({
						ok: true,
						status: 200,
						json: async () => ({
							features: [{ name: "PRINT_SPOOL", enabled: false }],
						}),
					}),
				),
		)
		const flag = useFeatureFlag("PRINT_SPOOL")
		await flag.refresh()
		expect(flag.enabled.value).toBe(true)
		await flag.refresh()
		expect(flag.enabled.value).toBe(false)
		expect(flag.store.enabled("PRINT_SPOOL")).toBe(false)
	})

	it("goes offline-safe when the network is down", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("offline"))),
		)
		const flag = useFeatureFlag("PRINT_SPOOL")
		await flag.refresh()
		expect(flag.isOffline.value).toBe(true)
		expect(flag.enabled.value).toBe(true) // defaults ON, never blocked
	})
})

describe("useExposedFeatureList", () => {
	it("exposes a bounded reactive snapshot of all known flags", () => {
		const { features, loaded } = useExposedFeatureList()
		expect(loaded.value).toBe(false)
		expect(Object.keys(features.value)).toContain("PRINT_SPOOL")
		expect(features.value.OFFLINE_MODE).toBe(true)
		expect(typeof useExposedFeatureList().refresh).toBe("function")
	})
})
