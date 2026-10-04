/**
 * Session-security monitor — the timer that used to outlive the page.
 *
 * `Login.vue` kept an `installSessionSecurityMonitor` / `stopSessionSecurityMonitor`
 * pair inline, with the interval handle in a local `const` that was never
 * cleared. The login screen is entered and left repeatedly, so those timers
 * accumulated for as long as the tab lived, each one still calling
 * `checkSessionSecurity()` on an unmounted page.
 *
 * The extraction to `composables/useLoginSecurityMonitor.js` is only correct if
 * the contract is FROZEN, so these assertions are the contract:
 *   - start is idempotent (no second listener, no second interval)
 *   - stop is idempotent and works without a prior start
 *   - stop actually clears the interval (the leak itself)
 *   - the policy check dispatches on status and does nothing for "valid"
 *
 * The handlers come from `@/utils/securityHardening`, which is mocked here: the
 * test is about the timer and the handle, not about the policy itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/securityHardening", () => ({
	installSecurityMonitor: vi.fn(() => vi.fn()),
	checkSessionSecurity: vi.fn(() => "valid"),
	handleSessionIdleTimeout: vi.fn(),
	handleSessionAbsoluteTimeout: vi.fn(),
}))

const securityHardening = await import("@/utils/securityHardening")
const { createSessionSecurityMonitor } = await import(
	"@/composables/useLoginSecurityMonitor"
)

beforeEach(() => {
	vi.useFakeTimers()
	securityHardening.installSecurityMonitor.mockClear()
	securityHardening.checkSessionSecurity.mockClear()
	securityHardening.checkSessionSecurity.mockReturnValue("valid")
})

afterEach(() => {
	vi.clearAllTimers()
	vi.useRealTimers()
})

describe("session security monitor", () => {
	it("installs the listener and a policy interval", () => {
		const monitor = createSessionSecurityMonitor({ intervalMs: 1000 })
		monitor.start()

		expect(securityHardening.installSecurityMonitor).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(1000)
		expect(securityHardening.checkSessionSecurity).toHaveBeenCalledTimes(1)
	})

	it("is idempotent — a second start adds no second listener or interval", () => {
		const monitor = createSessionSecurityMonitor({ intervalMs: 1000 })
		monitor.start()
		monitor.start()
		monitor.start()

		expect(securityHardening.installSecurityMonitor).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(1000)
		expect(securityHardening.checkSessionSecurity).toHaveBeenCalledTimes(1)
	})

	it("STOP clears the interval — the leak this module exists to prevent", () => {
		const monitor = createSessionSecurityMonitor({ intervalMs: 1000 })
		monitor.start()
		monitor.stop()

		vi.advanceTimersByTime(5000)
		// The old code kept firing after the page was gone.
		expect(securityHardening.checkSessionSecurity).not.toHaveBeenCalled()
		expect(securityHardening.installSecurityMonitor).toHaveBeenCalledTimes(1)
	})

	it("stop is safe when never started", () => {
		const monitor = createSessionSecurityMonitor()
		expect(() => monitor.stop()).not.toThrow()
		expect(securityHardening.installSecurityMonitor).not.toHaveBeenCalled()
	})

	it("restarts cleanly after a stop", () => {
		const monitor = createSessionSecurityMonitor({ intervalMs: 1000 })
		monitor.start()
		monitor.stop()
		monitor.start()

		expect(securityHardening.installSecurityMonitor).toHaveBeenCalledTimes(2)
		vi.advanceTimersByTime(1000)
		expect(securityHardening.checkSessionSecurity).toHaveBeenCalledTimes(1)
	})

	it("dispatches on status and stays silent for a valid session", () => {
		const monitor = createSessionSecurityMonitor({ intervalMs: 1000 })
		monitor.start()

		vi.advanceTimersByTime(1000)
		expect(securityHardening.handleSessionIdleTimeout).not.toHaveBeenCalled()
		expect(
			securityHardening.handleSessionAbsoluteTimeout,
		).not.toHaveBeenCalled()

		securityHardening.checkSessionSecurity.mockReturnValue("idle_timeout")
		vi.advanceTimersByTime(1000)
		expect(securityHardening.handleSessionIdleTimeout).toHaveBeenCalledTimes(1)
		expect(
			securityHardening.handleSessionAbsoluteTimeout,
		).not.toHaveBeenCalled()

		securityHardening.checkSessionSecurity.mockReturnValue("absolute_timeout")
		vi.advanceTimersByTime(1000)
		expect(
			securityHardening.handleSessionAbsoluteTimeout,
		).toHaveBeenCalledTimes(1)
	})
})
