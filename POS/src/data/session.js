import { reactive, computed } from "vue"
import { cleanupUserSession } from "@/utils/sessionCleanup"
import { logger } from "@/utils/logger"
import { endpoints } from "@/utils/apiEndpoints"
import { userRepository } from "@/repositories/userRepository"

const log = logger.create("LocalSession")

/** Navigation callback set by main.js to break circular dep with router */
let navigateToLogin = null

export function setNavigateToLogin(fn) {
	navigateToLogin = fn
}

const SESSION_STORAGE_KEY = "dypos_user_session"

/**
 * Absolute offline-session lifetime: 8h. The local session is an
 * operational feature (till keeps selling without network), not a bypass:
 * it expires, it is device-bound (localStorage + IndexedDB on this terminal
 * only), and permissions come from the stored role. Server sessions (JWT)
 * remain the authority whenever linkage is granted.
 */
export const LOCAL_SESSION_TTL_MS = 8 * 60 * 60 * 1000

export let lastLoginSource = "none"
export let lastServerAuth = null

function readStoredSession() {
	try {
		const raw = localStorage.getItem(SESSION_STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		if (!parsed?.email) return null
		// Expiry is enforced at read time: an expired session never authenticates.
		if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
			try {
				localStorage.removeItem(SESSION_STORAGE_KEY)
			} catch {
				/* storage unavailable */
			}
			return null
		}
		return parsed
	} catch {
		return null
	}
}

/**
 * Local session management — completely offline, no runtime framework needed.
 *
 * Contract (same surface the app already uses):
 * - `sessionUser()` → user id/email or null (expired sessions read as null)
 * - `sessionRole()` → persisted role (or "POS User" when unknown)
 * - `session.login.submit({ email, password })` → local-first login
 * - `session.logout.submit()` → local teardown, never throws
 * - `session.user`, `session.isLoggedIn`
 *
 * Canonical online payload is { username, password } (server loginSchema);
 * `email` is sent alongside as an alias so older backends keep working.
 * Login order: online API attempt (fail-soft on network/5xx only) → local
 * Dexie users table (PBKDF2, same scheme as Register). An explicit server
 * rejection (401/403/429) is surfaced, never masked by a local fallback —
 * converting an upstream failure into a fake success is forbidden.
 */
export function sessionUser() {
	const stored = readStoredSession()
	if (stored?.email) return stored.email
	try {
		const cookies = new URLSearchParams(document.cookie.split("; ").join("&"))
		const user = cookies.get("user_id")
		if (user && user !== "Guest") return user
	} catch {
		/* non-browser bundling */
	}
	return null
}

/**
 * Role of the current local session.
 *
 * Identity lives in the local session only — there is no server/desk global to
 * read a role from, so this is the single source of truth for the POS.
 */
export function sessionRole() {
	const stored = readStoredSession()
	if (stored?.role) return stored.role
	return "POS User"
}

export function sessionTenantId() {
	return readStoredSession()?.tenantId || null
}

function persistSession(user) {
	session.user = user.email
	const now = Date.now()
	try {
		localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				email: user.email,
				full_name: user.full_name,
				user_id: user.id,
				role: user.role,
				tenantId: user.tenantId || user.tenant_id || null,
				loginTime: now,
				expiresAt: now + LOCAL_SESSION_TTL_MS,
			}),
		)
	} catch (error) {
		log.warn("Could not persist local session", error)
	}
}

async function tryOnlineLogin(email, password, subscriberCode = "") {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 3500)
	try {
		const response = await fetch(endpoints.auth.login, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
			// Canonical: { username }. `email` stays as an alias for older backends.
			body: JSON.stringify({
				username: email,
				email,
				password,
				...(subscriberCode ? { subscriberCode } : {}),
			}),
		})
		if (
			response.status === 401 ||
			response.status === 403 ||
			response.status === 429
		) {
			// Explicit server verdict — surface it, never mask it with a local fallback.
			const data = await response.json().catch(() => null)
			const error = new Error(data?.error || "فشل تسجيل الدخول")
			error.status = response.status
			throw error
		}
		if (!response.ok) {
			// Network/5xx/Cloudflare 403 — treat as network failure, fall back to local
			log.warn("Online login failed with status", response.status)
			return null
		}
		const data = await response.json().catch(() => null)
		return data || null
	} catch (error) {
		// Explicit rejections (401/403/429) propagate; network/abort/5xx fall through to local.
		if (error?.status === 401 || error?.status === 403 || error?.status === 429)
			throw error
		log.debug(
			"Online login unavailable, falling back to local",
			error?.message || error,
		)
		return null
	} finally {
		clearTimeout(timeoutId)
	}
}

/**
 * Canonical offline login — ONE implementation (S3), zero network always.
 *
 * Verifies against Dexie and establishes the reactive session + storage
 * that the router guard reads. Every local path (the login page, PIN,
 * biometric) MUST come through here. A second copy of this finalization
 * lived in `useLoginRuntime#attemptLocalLogin`: it verified the password
 * correctly and then wrote the Pinia proxy's readonly `user` instead of
 * this reactive one — so the guard kept reading logged-out and the cashier
 * stayed on the login screen after a CORRECT password. That copy is gone;
 * this function is the only writer.
 *
 * @returns {Promise<{success: boolean, user?: *, error?: string}>}
 */
export async function submitLocalLogin(email, password) {
	const cleanEmail = String(email || "").trim()
	const localResult = await userRepository.authenticate(cleanEmail, password)
	if (!localResult.success) return localResult
	persistSession(localResult.user)
	session.login.reset()
	lastLoginSource = "local"
	lastServerAuth = null
	log.info("Local login successful", cleanEmail)
	return { success: true, user: session.user }
}

export async function refreshOnlineSession(
	email,
	password,
	subscriberCode = "",
) {
	const onlineAuth = await tryOnlineLogin(email, password, subscriberCode)
	const onlineUser = onlineAuth?.user || null
	if (!(onlineUser?.username || onlineUser?.email)) return null
	lastServerAuth = onlineAuth?.token
		? {
				token: onlineAuth.token,
				refreshToken:
					onlineAuth.refreshToken || onlineAuth.refresh_token || null,
				expiresIn: Number(
					onlineAuth.expiresIn || onlineAuth.expires_in || 86400,
				),
				user: onlineUser,
			}
		: null
	return { ...onlineAuth, user: onlineUser }
}

export const session = reactive({
	user: sessionUser(),

	isLoggedIn: computed(() => !!session.user),

	login: {
		async submit({ email, password, subscriberCode = "" } = {}) {
			const cleanEmail = String(email || "").trim()
			const cleanSubscriberCode = String(subscriberCode || "")
				.trim()
				.toUpperCase()
			if (!cleanEmail || !password) {
				throw new Error("بيانات الدخول ناقصة")
			}

			// 1) Local Core first. An installed terminal must enter without
			// waiting for API/CSRF/DNS/Cloudflare (single implementation:
			// submitLocalLogin above — never a second copy).
			const localResult = await submitLocalLogin(cleanEmail, password)
			if (localResult.success) return session.user

			// 2) Only when no local identity exists, try the explicitly
			// demanded server login. Network failure falls back to the local
			// error instead of holding the cashier for a long timeout.
			const onlineAuth = await tryOnlineLogin(
				cleanEmail,
				password,
				cleanSubscriberCode,
			)
			const onlineUser = onlineAuth?.user || null
			if (onlineUser?.username || onlineUser?.email) {
				lastServerAuth = onlineAuth?.token
					? {
							token: onlineAuth.token,
							refreshToken:
								onlineAuth.refreshToken || onlineAuth.refresh_token || null,
							expiresIn: Number(
								onlineAuth.expiresIn || onlineAuth.expires_in || 86400,
							),
							user: onlineUser,
						}
					: null
				persistSession({
					email: onlineUser.email || onlineUser.username,
					full_name:
						onlineUser.full_name ||
						onlineUser.fullName ||
						onlineUser.username ||
						onlineUser.email,
					id: onlineUser.id || onlineUser.user_id || null,
					role: onlineUser.role || "POS User",
					tenantId: onlineUser.tenantId || onlineUser.tenant_id || null,
				})
				lastLoginSource = "server"
				session.login.reset()
				return session.user
			}

			throw new Error(localResult.error || "فشل تسجيل الدخول المحلي")
		},

		reset() {
			// No-op: no server resource to reset.
		},
	},

	logout: {
		async submit() {
			try {
				await cleanupUserSession()
			} catch (error) {
				log.warn("Session cleanup failed", error)
			}
			try {
				localStorage.removeItem(SESSION_STORAGE_KEY)
			} catch {
				/* storage unavailable */
			}
			session.user = null
			try {
				if (navigateToLogin) {
					await navigateToLogin()
				}
			} catch {
				/* already on login */
			}
		},

		reset() {
			// No-op.
		},
	},
})

export default session
