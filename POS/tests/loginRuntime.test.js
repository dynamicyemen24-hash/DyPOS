/**
 * useLoginRuntime — the login screen's runtime readiness.
 *
 * Why this file exists at all: the logic it covers used to live inline in
 * `pages/Login.vue`, where it could not be reached by a test. The suite
 * stayed green through a `ReferenceError` on every offline path, because no
 * test ever touched it.
 *
 * The two names the old inline copy called but never defined — `log` and
 * `isBrowser` — are asserted at the bottom: a future refactor that drops
 * either one must fail here, not in a customer's shop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	detectOfflineMode,
	isBrowser,
	loginRateLimiter,
	log,
	sanitizeForInput,
} from "../src/composables/useLoginRuntime.js"

describe("useLoginRuntime — exported bindings", () => {
	it("defines `log` with the four levels the login screen calls", () => {
		// `log.info()`/`log.warn()` were called ~18 times in Login.vue against
		// an undefined identifier. These must exist as real functions.
		for (const level of ["debug", "info", "warn", "error"]) {
			expect(typeof log[level], `log.${level} missing`).toBe("function")
		}
	})

	it("defines `isBrowser` as a boolean (guards SSR and the vitest env)", () => {
		expect(typeof isBrowser).toBe("boolean")
	})

	it("binds sanitizeForInput to the securityHardening implementation", () => {
		// Same fn the login form sanitises credentials with — if the wiring
		// breaks, credentials would reach session.login() unsanitised.
		expect(typeof sanitizeForInput).toBe("function")
		expect(sanitizeForInput("<b>x</b>")).not.toContain("<b>")
	})

	it("exposes exactly one rate limiter instance", () => {
		expect(loginRateLimiter).toBeTruthy()
		expect(typeof loginRateLimiter.getState).toBe("function")
		expect(typeof loginRateLimiter.recordFailure).toBe("function")
		expect(typeof loginRateLimiter.recordSuccess).toBe("function")
	})
})

describe("detectOfflineMode", () => {
	const originalFetch = global.fetch

	beforeEach(() => {
		global.fetch = vi.fn()
	})

	afterEach(() => {
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it("reports online when the backend answers 200", async () => {
		global.fetch.mockResolvedValue({ ok: true, status: 200 })

		await expect(detectOfflineMode()).resolves.toBe(false)
	})

	it("reports offline on 503 (server up but degraded)", async () => {
		global.fetch.mockResolvedValue({ ok: false, status: 503 })

		await expect(detectOfflineMode()).resolves.toBe(true)
	})

	it("reports offline on a non-503 error status", async () => {
		global.fetch.mockResolvedValue({ ok: false, status: 502 })

		await expect(detectOfflineMode()).resolves.toBe(true)
	})

	it("reports offline when fetch throws (device has no network)", async () => {
		global.fetch.mockRejectedValue(new TypeError("Failed to fetch"))

		await expect(detectOfflineMode()).resolves.toBe(true)
	})

	it("reports offline when the ping times out", async () => {
		const abort = Object.assign(new Error("aborted"), {
			name: "AbortError",
		})
		global.fetch.mockRejectedValue(abort)

		await expect(detectOfflineMode()).resolves.toBe(true)
	})

	it("probes the ping endpoint with a no-store, same-origin GET", async () => {
		global.fetch.mockResolvedValue({ ok: true, status: 200 })

		await detectOfflineMode()

		const [url, options] = global.fetch.mock.calls[0]
		expect(url).toMatch(/\/ping$/)
		expect(options.method).toBe("GET")
		// A cached ping would report a stale "online" on a dead terminal.
		expect(options.cache).toBe("no-store")
		expect(options.credentials).toBe("same-origin")
		// Without an abort signal the 3s timeout in the source is unenforceable.
		expect(options.signal).toBeInstanceOf(AbortSignal)
	})
})
