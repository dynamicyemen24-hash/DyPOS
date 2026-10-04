/**
 * Auth error normalization + classification.
 *
 * Pure module: no runtime dependencies, safe to test and reuse anywhere
 * (Login, session store, shift dialog, service workers).
 */

const DEFAULT_MESSAGE = "تعذر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى."
const OFFLINE_MESSAGE =
	"لا يوجد اتصال بالشبكة حاليًا. يمكنك المتابعة محليًا وستُزامَن العمليات عند عودة الاتصال."
const UPSTREAM_UNAVAILABLE_MESSAGE =
	"خدمة المزامنة غير متاحة حاليًا. يعمل البيع المحلي دون اتصال وستُرسل العمليات تلقائيًا عند عودة الخدمة."

/**
 * Extract the closest HTTP status-like code from any error shape
 * (dypos-ui, fetch, axios, or plain { status } objects).
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
		return "البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من البيانات وحاول مرة أخرى."
	}

	if (status === 403) {
		return "ليس لديك صلاحية للوصول إلى نقطة البيع. تواصل مع المدير لمنح الصلاحية."
	}

	if (status === 429) {
		return "تم تجاوز عدد المحاولات المسموح بها. انتظر قليلًا ثم حاول مرة أخرى."
	}

	if (status === 503) {
		return UPSTREAM_UNAVAILABLE_MESSAGE
	}

	if (!online) {
		return OFFLINE_MESSAGE
	}

	// Never leak a raw (often English) transport message to the cashier:
	// fall back to an Arabic message that names the recovery.
	const raw =
		error?.message ||
		error?.response?.data?.message ||
		error?.data?.message ||
		""
	if (raw && /[\u0600-\u06FF]/.test(raw)) return raw
	return DEFAULT_MESSAGE
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
	UPSTREAM_UNAVAILABLE_MESSAGE,
	extractAuthStatus,
	normalizeAuthError,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
}
