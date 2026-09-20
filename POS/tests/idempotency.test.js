import { describe, expect, it, vi } from "vitest"
import {
	dedupeInFlight,
	isDedupedResponse,
	isRetryableError,
	newIdempotencyKey,
	retryIdempotent,
} from "@/utils/idempotency"

describe("idempotency keys", () => {
	it("generates UUID v4 keys unique per sale", () => {
		const a = newIdempotencyKey()
		const b = newIdempotencyKey()
		expect(a).not.toBe(b)
		expect(a).toMatch(/^[0-9a-f-]{36}$/i)
	})
})

describe("isRetryableError", () => {
	it("retries network/timeout/5xx/429, never 4xx validation", () => {
		expect(isRetryableError({ status: 500 })).toBe(true)
		expect(isRetryableError({ status: 503 })).toBe(true)
		expect(isRetryableError({ status: 429 })).toBe(true)
		expect(isRetryableError(new Error("network failed"))).toBe(true)
		expect(isRetryableError({ status: 400 })).toBe(false)
		expect(isRetryableError({ status: 404 })).toBe(false)
		expect(isRetryableError({ status: 409 })).toBe(false)
	})
})

describe("retryIdempotent", () => {
	it("succeeds after transient failures with backoff", async () => {
		let n = 0
		const fn = async () => {
			n++
			if (n < 3) throw { status: 503, message: "busy" }
			return "ok"
		}
		const res = await retryIdempotent(fn, { retries: 3, baseMs: 1, maxMs: 5 })
		expect(res).toBe("ok")
		expect(n).toBe(3)
	})

	it("never retries validation errors", async () => {
		let n = 0
		const fn = async () => {
			n++
			throw { status: 400, message: "bad cart" }
		}
		await expect(
			retryIdempotent(fn, { retries: 3, baseMs: 1 }),
		).rejects.toMatchObject({ status: 400 })
		expect(n).toBe(1)
	})

	it("calls onRetry observer without breaking retry", async () => {
		let n = 0
		const seen = []
		const fn = async () => {
			n++
			if (n === 1) throw { status: 500 }
			return 42
		}
		const res = await retryIdempotent(fn, {
			retries: 2,
			baseMs: 1,
			maxMs: 5,
			onRetry: (info) => seen.push(info),
		})
		expect(res).toBe(42)
		expect(seen.length).toBe(1)
	})
})

describe("dedupeInFlight (double-tap guard)", () => {
	it("concurrent identical keys share one promise", async () => {
		let calls = 0
		const fn = async () => {
			calls++
			await new Promise((r) => setTimeout(r, 10))
			return "once"
		}
		const key = "sale-123"
		const [a, b, c] = await Promise.all([
			dedupeInFlight(key, fn),
			dedupeInFlight(key, fn),
			dedupeInFlight(key, fn),
		])
		expect(a).toBe("once")
		expect(b).toBe("once")
		expect(c).toBe("once")
		expect(calls).toBe(1)
	})

	it("sequential calls after settle execute fresh", async () => {
		let calls = 0
		const fn = async () => ++calls
		const key = "seq-key"
		expect(await dedupeInFlight(key, fn)).toBe(1)
		expect(await dedupeInFlight(key, fn)).toBe(2)
	})
})

describe("isDedupedResponse", () => {
	it("detects server dedupe flags", () => {
		expect(isDedupedResponse({ deduped: true })).toBe(true)
		expect(isDedupedResponse({ data: { deduped: true } })).toBe(true)
		expect(isDedupedResponse({ id: "x" })).toBe(false)
	})
})
