/**
 * Server error normalization.
 *
 * The DyPOS method router answers with a JSON envelope. On failure the body may
 * be JSON (`{ exc_type, _server_messages, message, exception }`) or plain text
 * (proxy 502/504 from the edge, tunnel restarts, PowerShell-curl noise). This
 * module turns ANY of those into a single predictable `Error` shape so callers
 * never have to branch on transport accidents.
 *
 * Shape (kept stable for POS/src/composables/useInvoice.js, which reads
 * `exc_type`, `_server_messages`, `httpStatus`, `messages`, `exception`, `data`):
 *
 *   error.message      → human/Arabic-safe headline
 *   error.exc_type     → machine code (e.g. "ValidationError")
 *   error.messages     → string[] of every server message
 *   error._server_messages → raw JSON string from the server (or undefined)
 *   error.httpStatus   → numeric HTTP status
 *   error.status       → alias of httpStatus (legacy consumers)
 *   error.offline      → true when the browser reports no connectivity
 */

/** Offline fast-fail: never wait for a doomed socket to time out. */
export function isDefinitelyOffline() {
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return true
		}
	} catch {
		/* non-browser bundling — assume online */
	}
	return false
}

export function createOfflineError(context) {
	const error = new Error(
		"لا يوجد اتصال بالإنترنت — سيُحفظ العمل محليًا ويُزامَن لاحقًا",
	)
	error.code = "OFFLINE"
	error.status = 0
	error.httpStatus = 0
	error.offline = true
	error.context = context
	return error
}

const FALLBACK_MESSAGES = [
	"تعذّر إتمام العملية — حاول مرة أخرى",
	"Internal Server Error",
]

/**
 * Parse one entry of `_server_messages` (usually `{"message": "..."}` JSON).
 * @param {unknown} entry
 * @returns {string|null}
 */
function parseServerMessage(entry) {
	if (entry == null) return null
	if (typeof entry === "string") {
		try {
			const parsed = JSON.parse(entry)
			if (typeof parsed === "string") return parsed
			if (parsed && typeof parsed.message === "string") return parsed.message
		} catch {
			return entry
		}
		return entry
	}
	if (typeof entry === "object" && "message" in entry) {
		return String(entry.message)
	}
	return null
}

/**
 * Build the canonical Error from a non-2xx response.
 *
 * @param {Response} response
 * @param {string} context  Endpoint/method name (for logs and messages).
 * @param {string} rawText Already-read response body.
 * @param {unknown} [fallbackOptions] Caller options (only `onError` is read).
 * @returns {Error & Record<string, unknown>}
 */
export function buildServerError(response, context, rawText, fallbackOptions) {
	let payload = null
	try {
		payload = JSON.parse(rawText)
	} catch {
		payload = null
	}

	const serverMessages = Array.isArray(payload?._server_messages)
		? payload._server_messages
		: payload?._server_messages
			? [payload._server_messages]
			: []

	const messages = [
		...serverMessages.map(parseServerMessage),
		typeof payload?.message === "string" ? payload.message : null,
		typeof payload?._error_message === "string" ? payload._error_message : null,
	].filter((m) => typeof m === "string" && m.trim().length > 0)

	const headline = messages[0] || (rawText || "").trim().slice(0, 300)
	const error = new Error(
		[context, payload?.exc_type, headline].filter(Boolean).join(" — ") ||
			FALLBACK_MESSAGES[0],
	)

	error.exc_type = payload?.exc_type
	error._server_messages = payload?._server_messages
	error.httpStatus = response.status
	error.status = response.status
	error.exception = payload?.exception
	error.data = payload?.data
	error.messages = messages.length > 0 ? messages : [FALLBACK_MESSAGES[0]]
	error.response = response

	if (typeof fallbackOptions?.onError === "function") {
		fallbackOptions.onError({ response, status: response.status, error })
	}

	return error
}

/**
 * Build a canonical Error for a transport fault (DNS, TLS, offline, abort).
 * @param {unknown} cause
 * @param {string} context
 * @returns {Error & Record<string, unknown>}
 */
export function buildTransportError(cause, context) {
	if (cause?.offline) return cause
	const reason = cause instanceof Error ? cause : new Error(String(cause))
	const error = new Error(
		`تعذّر الاتصال بالخادم${context ? ` (${context})` : ""}: ${reason.message}`,
	)
	error.code = reason.code || "NETWORK"
	error.status = 0
	error.httpStatus = 0
	error.offline = isDefinitelyOffline()
	error.cause = reason
	error.messages = [error.message]
	return error
}
