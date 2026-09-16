/**
 * Dycos platform auth — manages the offline-sync access token independently
 * from the UI session so a network disconnect never blocks the UX.
 */

import db from "./db.js"
import { SyncError, SyncErrorKind } from "./sync-error.js"

const TOKEN_KEY = "dycos_access_token"
const REFRESH_KEY = "dycos_refresh_token"
const EXPIRY_KEY = "dycos_token_expiry"

const TENANT_KEY = "dycos_tenant_id"
const EMPLOYEE_KEY = "dycos_employee_id"

/**
 * Platform API base URL. Configurable via VITE_PLATFORM_URL; defaults to the
 * same origin (same-site deployment).
 */
export function getPlatformBaseUrl() {
	return import.meta.env?.VITE_PLATFORM_URL || ""
}

/**
 * Auth state
 */
export const authState = {
	token: null,
	refreshToken: null,
	expiry: null,
	tenantId: null,
	employeeId: null,
	isLoading: false,
	isInitialized: false,
}

/**
 * Load persisted auth from localStorage + IndexedDB at boot.
 */
export async function initAuth() {
	if (authState.isInitialized) return

	try {
		const [
			indexedToken,
			indexedRefresh,
			indexedExpiry,
			indexedTenant,
			indexedEmployee,
		] = await Promise.all([
			db.settings.get("dycos_token"),
			db.settings.get("dycos_refresh_token"),
			db.settings.get("dycos_token_expiry"),
			db.settings.get("dycos_tenant_id"),
			db.settings.get("dycos_employee_id"),
		])

		authState.token =
			localStorage.getItem(TOKEN_KEY) || indexedToken?.value || null
		authState.refreshToken =
			localStorage.getItem(REFRESH_KEY) || indexedRefresh?.value || null
		authState.expiry = (() => {
			const raw = localStorage.getItem(EXPIRY_KEY) || indexedExpiry?.value
			if (!raw) return null
			const parsed = new Date(raw)
			return Number.isNaN(parsed.getTime()) ? null : parsed
		})()
		authState.tenantId =
			localStorage.getItem(TENANT_KEY) || indexedTenant?.value || null
		authState.employeeId =
			localStorage.getItem(EMPLOYEE_KEY) || indexedEmployee?.value || null
	} catch (error) {
		// Degraded storage — continue with in-memory state only.
		try {
			authState.token = localStorage.getItem(TOKEN_KEY) || null
			authState.refreshToken = localStorage.getItem(REFRESH_KEY) || null
		} catch (storageError) {
			/* localStorage unavailable */
		}
	} finally {
		authState.isInitialized = true
	}
}

/**
 * Persist a fresh token set (memory + localStorage + IndexedDB).
 */
export async function saveAuth(
	token,
	refreshToken,
	expiresInSeconds = 3600,
	tenantId = null,
	employeeId = null,
) {
	const expiry = new Date(Date.now() + expiresInSeconds * 1000)
	authState.token = token
	authState.refreshToken = refreshToken
	authState.expiry = expiry
	authState.tenantId = tenantId
	authState.employeeId = employeeId

	try {
		localStorage.setItem(TOKEN_KEY, token)
		localStorage.setItem(REFRESH_KEY, refreshToken)
		localStorage.setItem(EXPIRY_KEY, expiry.getTime().toString())
		if (tenantId) localStorage.setItem(TENANT_KEY, tenantId)
		if (employeeId) localStorage.setItem(EMPLOYEE_KEY, employeeId)
	} catch (error) {
		/* localStorage may be disabled — memory state still valid */
	}

	try {
		await Promise.all([
			db.settings.put({ key: "dycos_token", value: token }),
			db.settings.put({ key: "dycos_refresh_token", value: refreshToken }),
			db.settings.put({
				key: "dycos_token_expiry",
				value: expiry.toISOString(),
			}),
			db.settings.put({ key: "dycos_tenant_id", value: tenantId }),
			db.settings.put({ key: "dycos_employee_id", value: employeeId }),
		])
	} catch (error) {
		/* IndexedDB may be unavailable — memory + localStorage still valid */
	}
}

/**
 * Is the current token still within its validity window?
 */
export function isTokenValid() {
	if (!authState.token || !authState.expiry) return false
	return Date.now() < authState.expiry.getTime()
}

/**
 * Return the token only when currently valid.
 */
export function getEffectiveToken() {
	return isTokenValid() ? authState.token : null
}

/**
 * Revoke all persisted platform auth (logout / token invalidation).
 */
export async function revokeAuth() {
	authState.token = null
	authState.refreshToken = null
	authState.expiry = null
	authState.tenantId = null
	authState.employeeId = null

	try {
		localStorage.removeItem(TOKEN_KEY)
		localStorage.removeItem(REFRESH_KEY)
		localStorage.removeItem(EXPIRY_KEY)
		localStorage.removeItem(TENANT_KEY)
		localStorage.removeItem(EMPLOYEE_KEY)
	} catch (error) {
		/* localStorage unavailable */
	}

	try {
		await Promise.all([
			db.settings.delete("dycos_token"),
			db.settings.delete("dycos_refresh_token"),
			db.settings.delete("dycos_token_expiry"),
			db.settings.delete("dycos_tenant_id"),
			db.settings.delete("dycos_employee_id"),
		])
	} catch (error) {
		/* IndexedDB unavailable */
	}
}

/**
 * Refresh the access token using the stored refresh token.
 * @param {string} refreshToken
 * @returns {Promise<Object>} `{ access_token, refresh_token?, expires_in?, tenant_id?, employee_id? }`
 */
export async function refreshTokenViaPlatform(refreshToken) {
	const response = await fetch(
		`${getPlatformBaseUrl()}/api/platform/auth/refresh`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		},
	)

	if (!response.ok) {
		throw new SyncError(
			response.status === 401
				? SyncErrorKind.AUTH_REVOKED
				: SyncErrorKind.AUTH_EXPIRED,
			"فشل تحديث رمز الوصول",
			{ statusCode: response.status },
		)
	}

	const data = await response.json()
	if (!data.access_token) {
		throw new SyncError(
			SyncErrorKind.AUTH_REVOKED,
			"لم تُرجع المنصة رمز وصول جديد",
		)
	}
	return data
}

/**
 * Return a valid access token, transparently refreshing when needed.
 */
export async function getValidToken() {
	if (isTokenValid()) return authState.token

	if (!authState.refreshToken) {
		throw new SyncError(
			SyncErrorKind.AUTH_REQUIRED,
			"لا يوجد رمز تحديث — يحتاج إعادة تسجيل الدخول",
		)
	}

	try {
		const result = await refreshTokenViaPlatform(authState.refreshToken)
		await saveAuth(
			result.access_token,
			result.refresh_token || authState.refreshToken,
			result.expires_in || 3600,
			result.tenant_id || authState.tenantId,
			result.employee_id || authState.employeeId,
		)
		return authState.token
	} catch (error) {
		if (error.kind === SyncErrorKind.AUTH_REVOKED) {
			await revokeAuth()
		}
		throw error
	}
}

export default {
	authState,
	initAuth,
	saveAuth,
	isTokenValid,
	getEffectiveToken,
	getValidToken,
	revokeAuth,
	getPlatformBaseUrl,
}
