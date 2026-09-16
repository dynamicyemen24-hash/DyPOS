/**
 * Auth error normalization + classification.
 *
 * Pure module: no runtime dependencies, safe to test and reuse anywhere
 * (Login, session store, shift dialog, service workers).
 */

const DEFAULT_MESSAGE = "تعذر تسجيل الدخول. حاول مرة أخرى."
const OFFLINE_MESSAGE = "لا يوجد اتصال بالشبكة حاليًا."

/**
 * Extract the closest HTTP status-like code from any error shape
 * (frappe-ui, fetch, axios, or plain { status } objects).
 * @param {*} error
 * @returns {number|null}
 */
export function extractAuthStatus(error) {
	if (!error) return null
	if (typeof error.status === "number") return error.status
	if (typeof error.statusCode === "number") return error.statusCode
	if (typeof error.httpStatus === "number") return error.httpStatus
	if (error.response?.status) return error.response.status
	if (error.data?.status) return error.data.status
	return null
}

/**
 * Human-readable login error for the auth surface.
 * @param {*} error
 * @param {Object} [opts]
 * @param {boolean} [opts.online=true] - Current connectivity state.
 * @returns {string}
 */
export function normalizeAuthError(error, { online = true } = {}) {
	if (!error) {
		return DEFAULT_MESSAGE
	}

	const status = extractAuthStatus(error)

	if (status === 401) {
		return "البريد الإلكتروني أو كلمة المرور غير صحيحة."
	}

	if (status === 403) {
		return "ليس لديك صلاحية للوصول إلى نقطة البيع."
	}

	if (status === 429) {
		return "تم تجاوز عدد المحاولات المسموح بها. حاول لاحقًا."
	}

	if (!online) {
		return OFFLINE_MESSAGE
	}

	return (
		error?.message ||
		error?.response?.data?.message ||
		error?.data?.message ||
		DEFAULT_MESSAGE
	)
}

/**
 * True when the user's session expired and full re-authentication is needed.
 */
export function isAuthExpiryError(error) {
	if (!error) return false
	const status = extractAuthStatus(error)
	if (status === 401) return true
	const exc = error?.exc_type || error?.exception
	if (
		typeof exc === "string" &&
		/SessionExpired|AuthenticationError|CsrfError/i.test(exc)
	) {
		return true
	}
	const message = String(error?.message || "") + String(error?.title || "")
	return /session expired|session is expired|expired session/i.test(message)
}

/**
 * True when the user is authenticated but lacks permission for the resource.
 */
export function isAuthForbiddenError(error) {
	if (!error) return false
	const status = extractAuthStatus(error)
	return status === 403 || error?.exc_type === "PermissionError"
}

/**
 * True when the server is throttling authentication attempts.
 */
export function isAuthRateLimitedError(error) {
	if (!error) return false
	const status = extractAuthStatus(error)
	return status === 429
}

/**
 * Aggregate re-auth signal used by the session store: any credential-affecting
 * failure. Network/offline states are NOT treated as re-auth requirements.
 */
export function requiresReauthentication(error) {
	return isAuthExpiryError(error) || isAuthForbiddenError(error)
}

export default {
	DEFAULT_MESSAGE,
	OFFLINE_MESSAGE,
	extractAuthStatus,
	normalizeAuthError,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
}
