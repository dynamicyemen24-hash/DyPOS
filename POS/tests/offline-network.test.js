/**
 * Offline fast-fail regression.
 *
 * Cashier devices (phones/tablets on dead store wifi) must learn "offline"
 * in MILLISECONDS and drop to queue/cache mode — never burn 15s timeouts ×
 * retries per tap. apiWrapper.call() short-circuits when the radios report
 * offline, and the shared retry classifiers treat offline verdicts as
 * permanent (never retried).
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	call: vi.fn(),
}))

import { call as frappeCall } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { isRetryableError } from "@/utils/idempotency"
import { isRetryable } from "@/utils/network"

function setOnline(value) {
	Object.defineProperty(window.navigator, "onLine", {
		value,
		configurable: true,
	})
}

afterEach(() => {
	setOnline(true)
	vi.mocked(frappeCall).mockReset()
})

describe("offline verdicts are never retried", () => {
	it("isRetryableError({offline:true}) is false even with retryable status", () => {
		expect(isRetryableError({ offline: true, status: 503 })).toBe(false)
		expect(isRetryableError({ offline: true })).toBe(false)
	})

	it("isRetryable({offline:true}) is false", () => {
		expect(isRetryable({ offline: true, status: 503 })).toBe(false)
	})

	it("sanity: real retryables still retry", () => {
		expect(isRetryableError({ status: 503 })).toBe(true)
		expect(isRetryable({ status: 429 })).toBe(true)
		expect(isRetryableError({ status: 405 })).toBe(false)
	})
})

describe("apiWrapper.call offline fast-fail", () => {
	it("rejects in ms without touching the network", async () => {
		setOnline(false)
		vi.mocked(frappeCall).mockRejectedValueOnce(new Error("must not be called"))
		const started = Date.now()
		await expect(call("DyPOS.api.ping", {})).rejects.toMatchObject({
			offline: true,
			code: "OFFLINE",
		})
		expect(Date.now() - started).toBeLessThan(1000)
		expect(frappeCall).not.toHaveBeenCalled()
	})

	it("online path still performs the call", async () => {
		setOnline(true)
		vi.mocked(frappeCall).mockResolvedValueOnce({ pong: true })
		await expect(call("DyPOS.api.ping", {})).resolves.toEqual({
			pong: true,
		})
		expect(frappeCall).toHaveBeenCalledTimes(1)
	})
})
