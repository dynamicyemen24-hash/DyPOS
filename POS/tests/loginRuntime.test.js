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
import { describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import { defineComponent, ref } from "vue"
import { mount } from "@vue/test-utils"

import {
	detectOfflineMode,
	isBrowser,
	loginRateLimiter,
	log,
	sanitizeForInput,
} from "../src/composables/useLoginRuntime.js"
import {
	LINK_MODES,
	LINK_REASONS,
	setLinkMode,
} from "../src/services/link-consent.js"

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

describe("detectOfflineMode — pure local, zero network", () => {
	it("is standalone without linkage consent", async () => {
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
		// The probe era is over: deciding the mode by pinging the backend
		// was itself an undemanded connection on every boot.
		await expect(detectOfflineMode()).resolves.toBe(true)
	})

	it("leaves standalone mode only through granted linkage", async () => {
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
		await expect(detectOfflineMode()).resolves.toBe(true)
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		await expect(detectOfflineMode()).resolves.toBe(false)
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
	})

	it("never calls fetch while deciding the mode", async () => {
		const originalFetch = global.fetch
		const spy = vi.fn(async () => ({ ok: true, status: 200 }))
		global.fetch = spy
		try {
			setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
			await detectOfflineMode()
			setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
			await detectOfflineMode()
			expect(spy).not.toHaveBeenCalled()
		} finally {
			global.fetch = originalFetch
		}
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
	})
})

describe("Login.vue template timer safety", () => {
	it("never resolves browser setTimeout through the Vue render context", async () => {
		const { readFile } = await import("node:fs/promises")
		const source = await readFile(
			join(process.cwd(), "src/pages/Login.vue"),
			"utf8",
		)

		expect(source).not.toMatch(
			/@(?:blur|click|input|change)="[^"]*\bsetTimeout\s*\(/,
		)
		expect(source).toContain('@blur="deferHideEmailSuggestions"')
	})

	it("owns the browser timer in the composable and cancels the previous hide", async () => {
		const { useLoginEmailBlur } = await import(
			"../src/composables/useLoginEmailBlur.js"
		)
		vi.useFakeTimers()
		const visible = ref(true)
		let api
		const wrapper = mount(
			defineComponent({
				setup() {
					api = useLoginEmailBlur({ showEmailSuggestions: visible, delay: 200 })
					return () => null
				},
			}),
		)

		api.deferHideEmailSuggestions()
		vi.advanceTimersByTime(199)
		expect(visible.value).toBe(true)
		api.deferHideEmailSuggestions()
		vi.advanceTimersByTime(1)
		expect(visible.value).toBe(true)
		vi.advanceTimersByTime(199)
		expect(visible.value).toBe(false)

		wrapper.unmount()
		vi.useRealTimers()
	})
})
