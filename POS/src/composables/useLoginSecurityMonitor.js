import {
	checkSessionSecurity,
	handleSessionAbsoluteTimeout,
	handleSessionIdleTimeout,
	installSecurityMonitor,
} from "@/utils/securityHardening"

/**
 * The periodic session-security monitor, owned by one module.
 *
 * ## Why this is extracted
 *
 * `Login.vue` is at its file-size cap and this pair (`install` + `stop`) was
 * an inline `setInterval` living in the page. The cap only moves DOWN, so the
 * rule is extract first, then lower the number in the same commit.
 *
 * ## The defect this module exists to prevent
 *
 * The interval used to be assigned to a local `const` that was never stored and
 * never cleared — so the timer outlived the component and kept calling
 * `checkSessionSecurity()` on a page that was no longer mounted. A login screen
 * is entered and left repeatedly (every session expiry, every back-navigation),
 * so those timers accumulate for as long as the tab lives.
 *
 * Keeping the timer and its stop handle in ONE closure is what makes the leak
 * structurally impossible: there is no way to start the monitor without
 * holding the handle that stops it.
 *
 * The four handlers are imported here rather than injected: they all come from
 * one module and none is ever substituted, so threading them through a factory
 * only pushed four import lines into `Login.vue`.
 *
 * @param {object} [options]
 * @param {number} [options.intervalMs] - policy check period; tests shrink it.
 */
export function createSessionSecurityMonitor({ intervalMs = 60 * 1000 } = {}) {
	/** Handle returned by `installSecurityMonitor`; null when not installed. */
	let stopListener = null
	let timer = null

	function start() {
		// Idempotent: a second call must not install a second listener or a
		// second interval — which is exactly how the old leak doubled up.
		if (stopListener) return

		stopListener = installSecurityMonitor()

		// Independent of user activity: an unattended till still has to expire.
		timer = setInterval(() => {
			const status = checkSessionSecurity()
			if (status === "idle_timeout") handleSessionIdleTimeout()
			if (status === "absolute_timeout") handleSessionAbsoluteTimeout()
		}, intervalMs)
	}

	/** Idempotent teardown — safe even if `start()` was never called. */
	function stop() {
		if (stopListener) {
			stopListener()
			stopListener = null
		}
		if (timer) {
			clearInterval(timer)
			timer = null
		}
	}

	return { start, stop }
}

export default createSessionSecurityMonitor
