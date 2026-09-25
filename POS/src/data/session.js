import { reactive, computed } from "vue"
import { cleanupUserSession } from "@/utils/sessionCleanup"
import { logger } from "@/utils/logger"
import { endpoints } from "@/utils/apiEndpoints"
import { userRepository } from "@/repositories/userRepository"
import router from "@/router"

const log = logger.create("LocalSession")

const SESSION_STORAGE_KEY = "dypos_user_session"

/**
 * Local session management — completely offline, no Frappe dependency.
 *
 * Contract (same surface the app already uses):
 * - `sessionUser()` → user id/email or null
 * - `session.login.submit({ email, password })` → local-first login
 * - `session.logout.submit()` → local teardown, never throws
 * - `session.user`, `session.isLoggedIn`
 *
 * Login order: online API attempt (fail-soft) → local Dexie users table
 * (SHA-256, same scheme as Register). Offline or dead backend never blocks.
 */
export function sessionUser() {
	try {
		const raw = localStorage.getItem(SESSION_STORAGE_KEY)
		if (raw) {
			const parsed = JSON.parse(raw)
			if (parsed?.email) return parsed.email
		}
	} catch {
		/* corrupted session payload — fall through to cookies */
	}
	try {
		const cookies = new URLSearchParams(document.cookie.split("; ").join("&"))
		const user = cookies.get("user_id")
		if (user && user !== "Guest") return user
	} catch {
		/* non-browser bundling */
	}
	return null
}

function persistSession(user) {
	session.user = user.email
	try {
		localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				email: user.email,
				full_name: user.full_name,
				user_id: user.id,
				role: user.role,
				loginTime: Date.now(),
			}),
		)
	} catch (error) {
		log.warn("Could not persist local session", error)
	}
}

async function tryOnlineLogin(email, password) {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 8000)
	try {
		const response = await fetch(endpoints.auth.login, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
			body: JSON.stringify({ email, password }),
		})
		if (!response.ok) return null
		const data = await response.json().catch(() => null)
		return data?.user || null
	} catch {
		return null
	} finally {
		clearTimeout(timeoutId)
	}
}

export const session = reactive({
	user: sessionUser(),

	isLoggedIn: computed(() => !!session.user),

	login: {
		async submit({ email, password } = {}) {
			const cleanEmail = String(email || "").trim()
			if (!cleanEmail || !password) {
				throw new Error("بيانات الدخول ناقصة")
			}

			// 1) Online attempt (fail-soft — never blocks offline login).
			const onlineUser = await tryOnlineLogin(cleanEmail, password)
			if (onlineUser?.email) {
				persistSession({
					email: onlineUser.email,
					full_name: onlineUser.full_name || onlineUser.email,
					id: onlineUser.id || onlineUser.user_id || null,
					role: onlineUser.role || "POS User",
				})
				session.login.reset()
				return session.user
			}

			// 2) Local users table via the user repository.
			const result = await userRepository.authenticate(cleanEmail, password)
			if (!result.success) {
				throw new Error(result.error || "فشل تسجيل الدخول المحلي")
			}

			persistSession(result.user)
			session.login.reset()
			log.info("Local login successful", cleanEmail)
			return session.user
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
				await router.replace({ name: "Login" })
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
