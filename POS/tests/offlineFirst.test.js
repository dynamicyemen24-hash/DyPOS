/**
 * Offline-first regression gate.
 *
 * Locks in the v1.37.0 upgrade campaign guarantees:
 * 1. apiEndpoints: canonical /api/* paths (never /api/method/* Frappe paths).
 * 2. useSessionTimeout: no auto-start on mount — the session-expiry popup
 *    must never appear on guest pages (Login/Register/Forgot/Reset).
 * 3. translate(): Arabic source-string fallback with zero network.
 */
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

// Isolate the composable from the session store chain (which pulls the
// Frappe UI package — unrelated to session-timeout logic under test).
vi.mock("@/stores/session", () => ({
	session: { isLoggedIn: false },
}))

import { endpoints, buildUrl, API_BASE } from "@/utils/apiEndpoints"
import { useSessionTimeout } from "@/composables/useSessionTimeout"
import { translate } from "@/utils/translation"

describe("apiEndpoints (canonical offline-first map)", () => {
	it("uses /api/* paths, never Frappe /api/method/* paths", () => {
		const seen = []
		const walk = (node) => {
			if (typeof node === "string") {
				seen.push(node)
				return
			}
			if (node && typeof node === "object") Object.values(node).forEach(walk)
		}
		walk(endpoints)
		expect(seen.length).toBeGreaterThan(10)
		for (const url of seen) {
			expect(url.startsWith(API_BASE)).toBe(true)
			expect(url).not.toContain("/api/method/")
		}
	})

	it("exposes the offline-detection ping + auth + localization surface", () => {
		expect(endpoints.ping).toBe("/api/ping")
		expect(endpoints.auth.login).toBe("/api/auth/login")
		expect(endpoints.auth.register).toBe("/api/auth/register")
		expect(endpoints.localization.translations).toBe(
			"/api/localization/translations",
		)
		expect(endpoints.features).toBe("/api/features")
		expect(endpoints.sync.push).toBe("/api/sync/push")
		expect(endpoints.sync.pull).toBe("/api/sync/pull")
	})

	it("buildUrl appends query params", () => {
		const url = buildUrl(endpoints.sync.pull, { checkpoint: 42, limit: 10 })
		expect(url).toContain("checkpoint=42")
		expect(url).toContain("limit=10")
	})
})

describe("useSessionTimeout (explicit start only)", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("never auto-starts: no popup after 31 minutes without start()", () => {
		const t = useSessionTimeout()
		expect(typeof t.start).toBe("function")
		vi.advanceTimersByTime(31 * 60 * 1000)
		expect(t.showWarning.value).toBe(false)
		t.destroy()
	})

	it("start() arms the warning, dismissWarning() clears it", () => {
		const t = useSessionTimeout({
			warningBeforeMs: 5 * 60 * 1000,
			sessionDurationMs: 30 * 60 * 1000,
		})
		t.start(30 * 60 * 1000)
		expect(t.showWarning.value).toBe(false)
		vi.advanceTimersByTime(25 * 60 * 1000 + 1000)
		expect(t.showWarning.value).toBe(true)
		t.dismissWarning()
		expect(t.showWarning.value).toBe(false)
		t.destroy()
	})

	it("destroy() silences a ringing warning", () => {
		const t = useSessionTimeout({
			warningBeforeMs: 1000,
			sessionDurationMs: 2000,
		})
		t.start(2000)
		vi.advanceTimersByTime(1500)
		expect(t.showWarning.value).toBe(true)
		t.destroy()
		expect(t.showWarning.value).toBe(false)
	})
})

describe("translate() (local Arabic fallback)", () => {
	it("returns the Arabic source string when no bundle is loaded", () => {
		expect(translate("حفظ")).toBe("حفظ")
		expect(translate("تسجيل الدخول")).toBe("تسجيل الدخول")
	})

	it("interpolates indexed placeholders", () => {
		expect(translate("مرحبا {0}", { 0: "أحمد" })).toBe("مرحبا أحمد")
	})

	it("falls back to the raw key for unknown strings", () => {
		expect(translate("__missing_key__")).toBe("__missing_key__")
	})
})
