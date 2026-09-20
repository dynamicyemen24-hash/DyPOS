import { describe, expect, it, vi } from "vitest"
import { useDebouncedSearch } from "@/composables/useDebouncedSearch"

describe("useDebouncedSearch (VueUse)", () => {
	it("debounces rapid keystrokes into one search", async () => {
		vi.useFakeTimers()
		try {
			let calls = 0
			const { setQuery, results } = useDebouncedSearch(
				async (q) => {
					calls++
					return [`hit:${q}`]
				},
				{ delay: 200 },
			)
			setQuery("ق")
			setQuery("قل")
			setQuery("قلم")
			expect(calls).toBe(0)
			await vi.advanceTimersByTimeAsync(250)
			expect(calls).toBe(1)
			expect(results.value).toEqual(["hit:قلم"])
		} finally {
			vi.useRealTimers()
		}
	})

	it("runImmediate bypasses debounce and drops stale responses", async () => {
		let resolveFirst = null
		const gate = new Promise((r) => {
			resolveFirst = r
		})
		const searchFn = vi.fn(async (q) => (q === "slow" ? gate : [`fast:${q}`]))
		const { runImmediate, results } = useDebouncedSearch(searchFn, {
			delay: 10,
		})
		const p1 = runImmediate("slow")
		const p2 = runImmediate("fast")
		resolveFirst(["stale"])
		await Promise.all([p1, p2])
		expect(results.value).toEqual(["fast:fast"])
		expect(searchFn).toHaveBeenCalledTimes(2)
	})
})
