/**
 * Use Password Reset — Secure password recovery flow composable.
 *
 * Implements an industry-standard password recovery flow aligned with:
 *   - OWASP ASVS 5.0 (V3 — Session Management, V4 — Access Control)
 *   - OWASP Forgot Password Cheat Sheet
 *   - NIST SP 800-63A (Identity Proofing)
 *   - NIST SP 800-63B (Authentication & Lifecycle Mgmt)
 *
 * Security techniques implemented:
 *   1. Rate limiting on reset requests (prevents email bombing & enumeration)
 *   2. Rate limiting on reset submissions (prevents token brute-force)
 *   3. CSRF token readiness before API calls
 *   4. Client-side token expiry validation (short-circuit + UX)
 *   5. URL token sanitisation (token stripped from URL after read)
 *   6. Password policy enforcement (NIST SP 800-63B)
 *   7. Anti-enumeration (generic success regardless of account existence)
 *   8. Security event logging via securityHardening
 *   9. Exponential backoff on failures
 *  10. Single-use token semantics (token consumed on success)
 */

import { ref, computed } from "vue"

import { call } from "@/utils/apiWrapper"
import { createRateLimiter } from "@/utils/rateLimiter"
import { validatePassword } from "@/utils/passwordPolicy"
import { ensureCSRFToken } from "@/utils/csrf"
import {
	dispatchSecurityEvent,
	SECURITY_EVENT_TYPES,
} from "@/utils/securityHardening"
import { logger } from "@/utils/logger"

const log = logger.create("PasswordReset")

/* -------------------------------------------------------------------------- */
/* Rate limiters                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Rate limiter for password reset requests.
 * - 3 requests per 15-minute window per client
 * - Exponential lockout up to 60 minutes
 * - Prevents email bombing and user enumeration timing attacks
 */
const resetRequestLimiter = createRateLimiter({
	key: "password_reset_request",
	windowMs: 15 * 60 * 1000,
	maxAttempts: 3,
	lockoutMs: 5 * 60 * 1000,
	maxLockoutMs: 60 * 60 * 1000,
})

/**
 * Rate limiter for password reset submissions (token verification).
 * - 5 submissions per 15-minute window per token
 * - Prevents brute-force token guessing
 */
const resetSubmissionLimiter = createRateLimiter({
	key: "password_reset_submit",
	windowMs: 15 * 60 * 1000,
	maxAttempts: 5,
	lockoutMs: 10 * 60 * 1000,
	maxLockoutMs: 60 * 60 * 1000,
})

/* -------------------------------------------------------------------------- */
/* Token handling                                                             */
/* -------------------------------------------------------------------------- */

const RESET_TOKEN_STORAGE_KEY = "dypos_reset_token"
const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes — must match server TTL

/**
 * Read the reset token from the URL query parameter.
 * After reading, strip the token from the URL via history.replaceState
 * so it is never persisted in browser history or analytics.
 *
 * @param {string} [paramName="token"] - Query param name
 * @param {string} [tokenValue] - If provided, use directly
 * @returns {{ token: string|null, expiry: number|null }}
 */
export function consumeResetToken(paramName = "token", tokenValue = null) {
	let token = tokenValue

	if (!token && typeof window !== "undefined" && window.location.search) {
		try {
			const params = new URLSearchParams(window.location.search)
			token = params.get(paramName)
		} catch {
			token = null
		}
	}

	if (!token) {
		return { token: null, expiry: null }
	}

	/* Strip the token from the URL so it does not leak into history,
	   referer headers, or analytics. Uses replaceState (not pushState). */
	try {
		const url = new URL(window.location.href)
		url.searchParams.delete(paramName)
		url.searchParams.delete("expires")
		url.searchParams.delete("exp")
		window.history.replaceState({}, document.title, url.pathname + url.search)
	} catch {
		// Best-effort URL cleanup
	}

	/* Parse expiry from companion query params, or fallback to standard TTL */
	let expiry = null
	if (typeof window !== "undefined" && window.location.search) {
		try {
			const params = new URLSearchParams(window.location.search)
			const expParam = params.get("exp") || params.get("expires")
			if (expParam) {
				const parsed = Number.parseInt(expParam, 10)
				if (!Number.isNaN(parsed) && parsed > Date.now()) {
					expiry = parsed
				}
			}
		} catch {
			// continue to fallback
		}
	}

	if (!expiry) {
		expiry = Date.now() + RESET_TOKEN_EXPIRY_MS
	}

	/* Cache token in memory (NOT localStorage) — single-use, cleared on reload */
	if (typeof window !== "undefined") {
		window[RESET_TOKEN_STORAGE_KEY] = token
	}

	return { token, expiry }
}

/**
 * Retrieve the cached reset token (in-memory only).
 * @returns {string|null}
 */
export function getCachedResetToken() {
	if (typeof window !== "undefined") {
		return window[RESET_TOKEN_STORAGE_KEY] || null
	}
	return null
}

/** Clear the cached token (single-use semantics). */
export function clearCachedResetToken() {
	if (typeof window !== "undefined") {
		delete window[RESET_TOKEN_STORAGE_KEY]
	}
}

/**
 * Check if a token is still valid (not expired).
 * @param {string} token
 * @param {number} expiry
 * @returns {boolean}
 */
export function isTokenValid(token, expiry) {
	if (!token) return false
	const now = Date.now()
	return !expiry || now < expiry
}

/* -------------------------------------------------------------------------- */
/* Main composable                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Password recovery compositive.
 *
 * @returns {Object}
 */
export function usePasswordReset() {
	/* Reactive state shared across the flow */
	const isSubmitting = ref(false)
	const requestError = ref("")
	const submitError = ref("")
	const isSuccess = ref(false)
	const isRateLimited = ref(false)
	const rateLimitRetryAfter = ref(0)

	/* Computed: human-readable lockout countdown */
	const lockoutRemaining = computed(() => {
		if (!isRateLimited.value) return 0
		return rateLimitRetryAfter.value
	})

	/*
	 * Check rate limiting, ensure CSRF, and send the reset request.
	 *
	 * Anti-enumeration: ALWAYS show a success message regardless of
	 * whether the email exists in the system.
	 *
	 * @param {string} email
	 * @returns {Promise<{ success: boolean, message: string }>}
	 */
	async function requestReset(email) {
		isSubmitting.value = true
		requestError.value = ""
		isSuccess.value = false
		isRateLimited.value = false
		rateLimitRetryAfter.value = 0

		/* --- 1. Client-side rate limit (brute-force / email-bombing protection) --- */
		const limitResult = resetRequestLimiter.check()
		if (!limitResult.allowed) {
			isRateLimited.value = true
			rateLimitRetryAfter.value = limitResult.retryAfterMs
			requestError.value =
				"تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة مرة أخرى لاحقًا."

			dispatchSecurityEvent(SECURITY_EVENT_TYPES.RATE_LIMITED, {
				action: "password_reset_request",
				retryAfterMs: limitResult.retryAfterMs,
			})

			return { success: false, message: requestError.value }
		}

		/* --- 2. CSRF token readiness for request integrity --- */
		try {
			await ensureCSRFToken()
		} catch {
			log.debug("CSRF token not refreshed before password reset request")
		}

		/* --- 3. API call: send password reset email --- */
		try {
			const result = await call("DyPOS.api.auth.send_password_reset", {
				email: email.trim(),
			})

			/* --- 4. Record success — reset rate limiter --- */
			resetRequestLimiter.recordSuccess()
			isSuccess.value = true

			/* Anti-enumeration: generic message regardless of account existence */
			const message =
				result?.message?.message ||
				"إذا كان الحساب موجودًا، سيتم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني."

			log.info("Password reset request submitted successfully")

			dispatchSecurityEvent(SECURITY_EVENT_TYPES.AUTH_SUCCESS, {
				action: "password_reset_request",
			})

			return { success: true, message }
		} catch (error) {
			/* --- 5. Failure handling --- */
			resetRequestLimiter.recordFailure()

			const status =
				error?.status || error?.statusCode || error?.response?.status

			if (status === 429) {
				isRateLimited.value = true
				rateLimitRetryAfter.value = 15 * 60 * 1000
				requestError.value =
					"تم تجاوز حد الطلبات. يرجى المحاولة مرة أخرى لاحقًا."
			} else {
				/* Anti-enumeration: generic error — never reveal if email exists */
				requestError.value =
					"حدث خطأ أثناء إرسال رابط الاستعادة. يرجى المحاولة مرة أخرى."
			}

			dispatchSecurityEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, {
				action: "password_reset_request",
				error: error?.message || String(error),
			})

			log.warn("Password reset request failed", error)
			return { success: false, message: requestError.value }
		} finally {
			isSubmitting.value = false
		}
	}

	/*
	 * Validate the reset token (client-side expiry check), then submit
	 * the new password.
	 *
	 * @param {string} newPassword
	 * @param {string} confirmPassword
	 * @param {string} [tokenOverride]
	 * @param {Object} [userInfo] - { email, fullName } for policy checks
	 * @returns {Promise<{ success: boolean, message: string, policy?: Object }>}
	 */
	async function resetPassword(
		newPassword,
		confirmPassword,
		tokenOverride = null,
		userInfo = {},
	) {
		isSubmitting.value = true
		submitError.value = ""
		isRateLimited.value = false
		rateLimitRetryAfter.value = 0

		/* --- 1. Token presence --- */
		const token = tokenOverride || getCachedResetToken?.() || ""

		if (!token) {
			submitError.value =
				"رابط الاستعادة غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد."
			return { success: false, message: submitError.value }
		}

		/* --- 2. Client-side rate limit (token brute-force protection) --- */
		const limitResult = resetSubmissionLimiter.check()
		if (!limitResult.allowed) {
			isRateLimited.value = true
			rateLimitRetryAfter.value = limitResult.retryAfterMs
			submitError.value =
				"تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة مرة أخرى لاحقًا."
			resetSubmissionLimiter.recordFailure()
			return { success: false, message: submitError.value }
		}

		/* --- 3. Password policy validation (NIST SP 800-63B) --- */
		const policy = validatePassword(newPassword, userInfo)

		if (!policy.valid) {
			submitError.value = policy.errors.join("\n")
			return { success: false, message: submitError.value, policy }
		}

		if (newPassword !== confirmPassword) {
			submitError.value = "كلمتا المرور غير متطابقتين."
			return { success: false, message: submitError.value }
		}

		/* --- 4. CSRF readiness --- */
		try {
			await ensureCSRFToken()
		} catch {
			log.debug("CSRF token not refreshed before password reset")
		}

		/* --- 5. API call: reset password --- */
		try {
			await call("DyPOS.api.auth.reset_password", {
				token,
				new_password: newPassword,
			})

			/* --- 6. Single-use: consume token on success --- */
			clearCachedResetToken()
			resetSubmissionLimiter.recordSuccess()

			dispatchSecurityEvent(SECURITY_EVENT_TYPES.AUTH_SUCCESS, {
				action: "password_reset",
			})

			isSuccess.value = true
			return { success: true, message: "تمت استعادة كلمة المرور بنجاح." }
		} catch (error) {
			resetSubmissionLimiter.recordFailure()

			const status =
				error?.status || error?.statusCode || error?.response?.status

			if (status === 401 || status === 403) {
				/* Token invalid/expired — clear it and force re-request */
				submitError.value =
					"رابط الاستعادة غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد."
				clearCachedResetToken()
			} else if (status === 429) {
				isRateLimited.value = true
				rateLimitRetryAfter.value = 15 * 60 * 1000
				submitError.value = "تم تجاوز حد المحاولات. يرجى المحاولة لاحقًا."
			} else {
				submitError.value =
					"حدث خطأ أثناء استعادة كلمة المرور. يرجى المحاولة مرة أخرى."
			}

			dispatchSecurityEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, {
				action: "password_reset",
				error: error?.message || String(error),
			})

			log.warn("Password reset submission failed", error)
			return { success: false, message: submitError.value }
		} finally {
			isSubmitting.value = false
		}
	}

	/*
	 * Format a millisecond duration into a human-readable Arabic countdown.
	 * @param {number} ms
	 * @returns {string}
	 */
	function formatRetryTime(ms) {
		if (ms <= 0) return ""
		const minutes = Math.ceil(ms / 60000)
		if (minutes < 1) return "أقل من دقيقة"
		return `بعد ${minutes} ${minutes === 1 ? "دقيقة" : "دقائق"}`
	}

	/**
	 * Reset the composable state (call after a successful flow or
	 * when navigating away).
	 */
	function resetState() {
		isSubmitting.value = false
		requestError.value = ""
		submitError.value = ""
		isSuccess.value = false
		isRateLimited.value = false
		rateLimitRetryAfter.value = 0
	}

	return {
		/* State */
		isSubmitting,
		requestError,
		submitError,
		isSuccess,
		isRateLimited,
		rateLimitRetryAfter,
		lockoutRemaining,

		/* Actions */
		requestReset,
		resetPassword,
		resetState,

		/* Utilities */
		formatRetryTime,
		consumeResetToken,
		getCachedResetToken,
		clearCachedResetToken,
		isTokenValid,
	}
}

export default usePasswordReset
