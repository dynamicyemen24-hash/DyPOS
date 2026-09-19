import { describe, expect, it, vi } from "vitest"

import { useCachedResource } from "@/composables/useCachedResource"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe("useCachedResource", () => {
	it("loads once and serves the cached value to late callers", async () => {
		const loader = vi.fn(async (key) => `v:${key}`)
		const res = useCachedResource(loader, { ttl: 1000 })

		expect(res.loading.value).toBe(false)
		const p1 = res.load("a")
		expect(res.loading.value).toBe(true)
		const [v1, v2] = await Promise.all([p1, res.load("a")])
		expect(v1).toBe("v:a")
		expect(v2).toBe("v:a")
		expect(res.data.value).toBe("v:a")
		expect(res.loading.value).toBe(false)
		expect(res.error.value).toBe(null)
		// Concurrent duplicate calls share one in-flight promise.
		expect(loader).toHaveBeenCalledTimes(1)
	})

	it("revalidates stale keys in the background while serving stale data", async () => {
		let n = 0
		const loader = vi.fn(async () => `v${++n}`)
		const res = useCachedResource(loader, { ttl: 30 })

		await res.load("a")
		expect(res.data.value).toBe("v1")
		await sleep(50)
		// Stale read returns instantly; refresh happens behind it.
		const v = await res.load("a")
		expect(v).toBe("v1")
		await sleep(20)
		await res.refresh()
		expect(res.data.value).toBe("v3")
	})

	it("invalidate forces the next load to refetch", async () => {
		let n = 0
		const loader = vi.fn(async () => ++n)
		const res = useCachedResource(loader, { ttl: 60_000 })

		await res.load("a")
		expect(res.data.value).toBe(1)
		res.invalidate("a")
		expect(res.stale.value).toBe(true)
		await res.load("a")
		expect(res.data.value).toBe(2)
		expect(res.stale.value).toBe(false)
	})

	it("surfaces loader errors without poisoning later loads", async () => {
		let fail = true
		const loader = vi.fn(async () => {
			if (fail) throw new Error("boom")
			return "recovered"
		})
		const res = useCachedResource(loader, { ttl: 1000 })

		await expect(res.load("a")).rejects.toThrow("boom")
		expect(res.error.value?.message).toBe("boom")
		expect(res.loading.value).toBe(false)
		fail = false
		await expect(res.load("a")).resolves.toBe("recovered")
		expect(res.data.value).toBe("recovered")
	})

	it("rejects a non-function loader", () => {
		expect(() => useCachedResource(null)).toThrow(TypeError)
	})
})
