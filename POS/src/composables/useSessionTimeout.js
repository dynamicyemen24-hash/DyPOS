import { ref, watch } from "vue"
import { logger } from "@/utils/logger"
import { session } from "@/stores/session"

const DEFAULT_WARNING_MS = 5 * 60 * 1000
const DEFAULT_SESSION_MS = 30 * 60 * 1000
const COUNTDOWN_INTERVAL = 1000

export function useSessionTimeout({
	warningBeforeMs = DEFAULT_WARNING_MS,
	sessionDurationMs = DEFAULT_SESSION_MS,
	onExtend = null,
	onLogout = null,
} = {}) {
	const showWarning = ref(false)
	const timeRemaining = ref(0)
	const isSessionActive = ref(true)
	const isExtending = ref(false)

	let warningTimer = null
	let countdownTimer = null
	let sessionExpiry = null
	let stopWatcher = null

	function calculateTimeRemaining() {
		if (!sessionExpiry) return 0
		return Math.max(0, sessionExpiry - Date.now())
	}

	function startCountdown() {
		stopCountdown()
		countdownTimer = setInterval(() => {
			const remaining = calculateTimeRemaining()
			timeRemaining.value = remaining

			if (remaining <= 0) {
				stopCountdown()
				isSessionActive.value = false
				showWarning.value = false
				onLogout?.()
			} else if (remaining <= warningBeforeMs) {
				showWarning.value = true
			}
		}, COUNTDOWN_INTERVAL)
	}

	function startSessionDetection() {
		stopWatcher = watch(
			() => session.isLoggedIn,
			(loggedIn) => {
				if (!loggedIn && isSessionActive.value) {
					stopCountdown()
					isSessionActive.value = false
					showWarning.value = false
					onLogout?.()
				}
			},
		)
	}

	async function extendSession() {
		if (isExtending.value) return
		isExtending.value = true

		try {
			await session.refresh()
			sessionExpiry = Date.now() + sessionDurationMs
			showWarning.value = false
			timeRemaining.value = sessionDurationMs
			isExtending.value = false
			startCountdown()
			onExtend?.()
			logger?.info?.("Session extended locally")
		} catch (error) {
			isExtending.value = false
			logger?.warn?.("Failed to extend session", error)
			stopCountdown()
			isSessionActive.value = false
			showWarning.value = false
			onLogout?.()
		}
	}

	function dismissWarning() {
		showWarning.value = false
	}

	function stopCountdown() {
		if (countdownTimer) {
			clearInterval(countdownTimer)
			countdownTimer = null
		}
	}

	function stopWarning() {
		if (warningTimer) {
			clearTimeout(warningTimer)
			warningTimer = null
		}
	}

	function init() {
		stopCountdown()
		stopWarning()
		sessionExpiry = Date.now() + sessionDurationMs
		showWarning.value = false
		timeRemaining.value = sessionDurationMs
		isSessionActive.value = true

		warningTimer = setTimeout(() => {
			showWarning.value = true
			startCountdown()
		}, sessionDurationMs - warningBeforeMs)

		startSessionDetection()
	}

	/**
	 * Start (or restart) the authenticated session timer.
	 * Used by Login.vue after a successful login. Guest pages must never
	 * call this — the session popup must not appear before login.
	 */
	function start(durationMs) {
		stopCountdown()
		stopWarning()
		const duration =
			Number(durationMs) > 0 ? Number(durationMs) : sessionDurationMs
		sessionExpiry = Date.now() + duration
		showWarning.value = false
		timeRemaining.value = duration
		isSessionActive.value = true

		warningTimer = setTimeout(
			() => {
				showWarning.value = true
				startCountdown()
			},
			Math.max(0, duration - warningBeforeMs),
		)

		startSessionDetection()
	}

	function destroy() {
		stopCountdown()
		stopWarning()
		if (stopWatcher) {
			stopWatcher()
			stopWatcher = null
		}
		isSessionActive.value = false
		showWarning.value = false
	}

	// NOTE: no auto onMounted(init) — guest pages (Login/Register/Forgot/Reset)
	// must not start session timers. Authenticated flows call start()/init()
	// explicitly after login.

	return {
		showWarning,
		timeRemaining,
		isSessionActive,
		isExtending,
		extendSession,
		dismissWarning,
		init,
		start,
		destroy,
	}
}

export function createSessionTimeoutManager(options = {}) {
	const { warningBeforeMs, sessionDurationMs, onExtend, onLogout } = options

	const state = {
		showWarning: ref(false),
		timeRemaining: ref(0),
		isSessionActive: ref(true),
		isExtending: ref(false),
	}

	let timer = null
	let countdownInterval = null
	let expiryTime = null

	function start(durationMs) {
		expiryTime = Date.now() + durationMs
		const warnAt = durationMs - (warningBeforeMs || DEFAULT_WARNING_MS)

		timer = setTimeout(() => {
			state.showWarning.value = true
			startCountdownLoop()
		}, warnAt)
	}

	function startCountdownLoop() {
		if (countdownInterval) clearInterval(countdownInterval)
		countdownInterval = setInterval(() => {
			const remaining = Math.max(0, expiryTime - Date.now())
			state.timeRemaining.value = remaining

			if (remaining <= 0) {
				clearInterval(countdownInterval)
				countdownInterval = null
				state.isSessionActive.value = false
				state.showWarning.value = false
				onLogout?.()
			}
		}, 1000)
	}

	async function extend() {
		if (state.isExtending.value) return
		state.isExtending.value = true
		try {
			await session.refresh()
			expiryTime = Date.now() + (sessionDurationMs || DEFAULT_SESSION_MS)
			state.showWarning.value = false
			state.isExtending.value = false
			onExtend?.()
		} catch {
			state.isExtending.value = false
			state.isSessionActive.value = false
			onLogout?.()
		}
	}

	function reset() {
		if (timer) clearTimeout(timer)
		if (countdownInterval) {
			clearInterval(countdownInterval)
			countdownInterval = null
		}
		state.showWarning.value = false
		state.isSessionActive.value = true
	}

	function destroy() {
		if (timer) clearTimeout(timer)
		if (countdownInterval) {
			clearInterval(countdownInterval)
			countdownInterval = null
		}
		state.isSessionActive.value = false
		state.showWarning.value = false
	}

	return {
		...state,
		start,
		extend,
		reset,
		destroy,
	}
}

export default { useSessionTimeout, createSessionTimeoutManager }
