import { ref, computed } from "vue"

// NOTE: intentionally NO static import of "@/utils/translation" here.
// translation.ts pulls frappe-ui (createResource → ~icons/*) which has no
// resolver under vitest/jsdom. The translation plugin installs `__` on
// window/globalProperties at runtime, so resolve it dynamically with an
// identity fallback (Arabic source strings are already production-ready).
function __(msg, replace) {
	try {
		const fn =
			(typeof window !== "undefined" && window.__) ||
			(typeof globalThis !== "undefined" && globalThis.__)
		if (typeof fn === "function") return fn(msg, replace)
	} catch {
		/* fall through to identity */
	}
	if (replace) {
		return String(msg).replace(/{(\d+)}/g, (_, n) => replace[n] ?? _)
	}
	return msg
}

// Toast timing — graded by severity (Arabic messages read slower):
// error 6s / warning 5s / success+info 4s. Hover pauses the countdown.
const TOAST_DURATIONS = Object.freeze({
	error: 6000,
	warning: 5000,
	success: 4000,
	info: 4000,
})
const TOAST_FADE_DURATION = 300 // Fade animation duration
const TOAST_QUEUE_DELAY = 300 // Delay between queued toasts

// Global toast state
const toastQueue = ref([])
const currentToast = ref(null)
const showToast = ref(false)
let toastTimer = null
let isProcessing = false

// For backward compatibility
const toastNotification = computed(() => currentToast.value)

function processQueue() {
	if (isProcessing || toastQueue.value.length === 0) {
		return
	}

	isProcessing = true
	currentToast.value = toastQueue.value.shift()
	showToast.value = true

	// Clear any existing timer
	if (toastTimer) {
		clearTimeout(toastTimer)
	}

	// Auto-hide after a severity-graded duration (hover pauses — see pauseToast/resumeToast)
	const duration =
		TOAST_DURATIONS[currentToast.value?.type] ?? TOAST_DURATIONS.info
	pauseStartedAt = Date.now()
	toastTimer = setTimeout(() => {
		showToast.value = false
		setTimeout(() => {
			currentToast.value = null
			isProcessing = false
			// Process next toast in queue
			if (toastQueue.value.length > 0) {
				setTimeout(processQueue, TOAST_QUEUE_DELAY)
			}
		}, TOAST_FADE_DURATION)
	}, duration)
}

let pausedRemaining = null
let pauseStartedAt = 0

function pauseToast() {
	if (!toastTimer || !currentToast.value) return
	clearTimeout(toastTimer)
	toastTimer = null
	const duration =
		TOAST_DURATIONS[currentToast.value?.type] ?? TOAST_DURATIONS.info
	pausedRemaining = Math.max(500, duration - (Date.now() - pauseStartedAt))
}

function resumeToast() {
	if (toastTimer || !currentToast.value || pausedRemaining == null) return
	const remaining = pausedRemaining
	pausedRemaining = null
	pauseStartedAt = Date.now()
	toastTimer = setTimeout(() => {
		showToast.value = false
		setTimeout(() => {
			currentToast.value = null
			isProcessing = false
			if (toastQueue.value.length > 0) {
				setTimeout(processQueue, TOAST_QUEUE_DELAY)
			}
		}, TOAST_FADE_DURATION)
	}, remaining)
}

export function useToast() {
	function showToastNotification(title, message, type = "success") {
		// Add to queue
		toastQueue.value.push({ title, message, type })
		// Start processing if not already
		processQueue()
	}

	function showSuccess(message) {
		showToastNotification(__("Success"), message, "success")
	}

	function showError(message) {
		showToastNotification(__("Error"), message, "error")
	}

	function showWarning(message) {
		showToastNotification(__("Validation Error"), message, "warning")
	}

	function showInfo(message) {
		showToastNotification(__("Info"), message, "info")
	}

	/** Strip Frappe's HTML message markup down to plain text for a toast. */
	function flattenMessage(value) {
		return String(value)
			.replace(/<br\s*\/?>/gi, " ")
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim()
	}

	/**
	 * Pull a human-readable message out of a Frappe error.
	 *
	 * Two shapes matter:
	 *  - frappe-ui's call()/frappeRequest() reject with an Error whose
	 *    `.message` is only "<method> <exc_type>" (e.g. "…save_product
	 *    ValidationError"). The real text is on `.messages`, an array
	 *    frappe-ui has already parsed out of _server_messages.
	 *  - A raw fetch() gets the untouched response, where the same text is
	 *    still a JSON string in `_server_messages`.
	 *
	 * Checking only _server_messages misses every error raised through the
	 * app's `call` wrapper, which is nearly all of them.
	 */
	function parseErrorMessage(error) {
		if (!error) return ""

		// frappe-ui shape: already-parsed array of message strings.
		if (Array.isArray(error.messages) && error.messages.length > 0) {
			const seen = new Set()
			for (const entry of error.messages) {
				const text = flattenMessage(entry?.message ?? entry)
				if (text && !seen.has(text)) {
					seen.add(text)
					return text
				}
			}
		}

		// Raw response shape: _server_messages is a JSON string of JSON strings.
		try {
			if (error._server_messages) {
				const messages = JSON.parse(error._server_messages)
				if (Array.isArray(messages) && messages.length > 0) {
					const first =
						typeof messages[0] === "string"
							? JSON.parse(messages[0])
							: messages[0]
					if (first?.message) return flattenMessage(first.message)
				}
			}
		} catch {
			// Fall through to the generic message below.
		}

		// error.message is a useful fallback for plain Errors, but frappe-ui's
		// "<method> <exc_type>" string tells the user nothing.
		const message = error.message ? String(error.message) : ""
		if (message && error.exc_type && message.includes(error.exc_type)) return ""
		return message
	}

	/**
	 * Show an error toast, preferring the server's own explanation.
	 * Never throws — an error handler that throws turns a failed action into a
	 * silent one.
	 */
	function handleError(error, defaultMessage = __("An error occurred")) {
		let message = defaultMessage
		try {
			message = parseErrorMessage(error) || defaultMessage
		} catch {
			message = defaultMessage
		}
		showError(message)
	}

	function hideToast() {
		if (toastTimer) {
			clearTimeout(toastTimer)
			toastTimer = null
		}
		showToast.value = false
		setTimeout(() => {
			currentToast.value = null
			isProcessing = false
			// Process next toast in queue
			if (toastQueue.value.length > 0) {
				setTimeout(processQueue, TOAST_QUEUE_DELAY)
			}
		}, TOAST_FADE_DURATION)
	}

	function clearAllToasts() {
		if (toastTimer) {
			clearTimeout(toastTimer)
			toastTimer = null
		}
		toastQueue.value = []
		showToast.value = false
		currentToast.value = null
		isProcessing = false
	}

	return {
		// State
		toastNotification,
		showToast,
		toastQueue,

		// Actions
		showSuccess,
		showError,
		showWarning,
		showInfo,
		handleError,
		hideToast,
		clearAllToasts,
		pauseToast,
		resumeToast,
	}
}
