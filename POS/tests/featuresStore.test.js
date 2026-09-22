import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"

import {
	useFeaturesStore,
	OFFLINE_DEFAULTS,
	FETCH_TIMEOUT_MS,
} from "@/stores/features"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function jsonResponse(features, ok = true, status = 200) {
	return Promise.resolve({
		ok,
		status,
		json: async () => ({ features }),
	})
}

function jsonFeatures(entries) {
	return Object.entries(entries).map(([name, enabled]) => ({
		name,
		enabled,
		source: "db",
		default: true,
	}))
}

beforeEach(() => {
	setActivePinia(createPinia())
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe("features store — offline-safe defaults", () => {
	it("boots with every exposed default ON and no server dependency", () => {
		const store = useFeaturesStore()
		expect(store.loaded).toBe(false)
		expect(store.isOffline).toBe(false)
		expect(store.enabled("PRINT_SPOOL")).toBe(true)
		expect(store.enabled("OFFLINE_MODE")).toBe(true)
		expect(store.enabled("REALTIME_STOCK")).toBe(true)
		expect(store.features).toEqual(OFFLINE_DEFAULTS)
	})

	it("enabled() normalises names and defaults unknown flags to ON", () => {
		const store = useFeaturesStore()
		expect(store.enabled("print_spool")).toBe(true)
		expect(store.enabled("  smart_search ")).toBe(true)
		expect(store.enabled("TOTALLY_MISSING")).toBe(true)
		expect(store.enabled("")).toBe(false)
		expect(store.enabled(null)).toBe(false)
	})
})

describe("features store — init from /api/features", () => {
	it("fetches /api/features and maps server truth over the defaults", async () => {
		const fetchMock = vi.fn(() =>
			jsonResponse(jsonFeatures({ print_spool: false, SMART_SEARCH: false })),
		)
		vi.stubGlobal("fetch", fetchMock)

		const store = useFeaturesStore()
		const ok = await store.init()

		expect(ok).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock).toHaveBeenCalledWith("/api/features", expect.anything())
		expect(store.loaded).toBe(true)
		expect(store.isOffline).toBe(false)
		expect(store.enabled("PRINT_SPOOL")).toBe(false)
		expect(store.enabled("SMART_SEARCH")).toBe(false)
		// flags the server did not list keep their default ON
		expect(store.enabled("CUSTOMER_CRM")).toBe(true)
		expect(store.enabled("OFFLINE_MODE")).toBe(true)
	})

	it("a failed fetch degrades to offline defaults ON — the POS is never blocked", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("network down"))),
		)
		const store = useFeaturesStore()
		const ok = await store.init()
		expect(ok).toBe(false)
		expect(store.isOffline).toBe(true)
		expect(store.loaded).toBe(true)
		expect(store.enabled("PRINT_SPOOL")).toBe(true)
		expect(store.enabled("SMART_SEARCH")).toBe(true)
	})

	it("times out after 5s and falls back to offline defaults", async () => {
		vi.useFakeTimers()
		// never-settling fetch: the 5s race must win
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		)
		const store = useFeaturesStore()
		const pending = store.init()
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 20)
		expect(await pending).toBe(false)
		expect(store.isOffline).toBe(true)
		expect(store.enabled("PRINT_SPOOL")).toBe(true)
	})
})

describe("features store — hooks + refresh", () => {
	it("registerFeatureHooks refetches on reconnect (offline → online) and is idempotent", async () => {
		let calls = 0
		vi.stubGlobal(
			"fetch",
			vi.fn(() => {
				calls += 1
				return calls === 1
					? Promise.reject(new Error("down"))
					: jsonResponse(jsonFeatures({ print_spool: false }))
			}),
		)
		const store = useFeaturesStore()
		await store.init()
		expect(store.isOffline).toBe(true)

		const first = store.registerFeatureHooks()
		expect(first.installed).toBe(true)
		expect(store.registerFeatureHooks().installed).toBe(false)

		window.dispatchEvent(new Event("online"))
		await sleep(0)
		await sleep(0)

		expect(store.isOffline).toBe(false)
		expect(store.enabled("PRINT_SPOOL")).toBe(false)
		expect(calls).toBe(2)

		first.cleanup()
		expect(store.registerFeatureHooks().installed).toBe(true) // re-registrable after cleanup
	})

	it("refresh() re-fetches and reflects a server-side toggle", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockReturnValueOnce(jsonResponse(jsonFeatures({ PRINT_SPOOL: true })))
				.mockReturnValueOnce(
					jsonResponse(jsonFeatures({ PRINT_SPOOL: false })),
				),
		)
		const store = useFeaturesStore()
		await store.refresh()
		expect(store.enabled("PRINT_SPOOL")).toBe(true)
		await store.refresh()
		expect(store.enabled("PRINT_SPOOL")).toBe(false)
	})
})
