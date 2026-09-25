import { reactive, computed } from "vue"
import { cleanupUserSession } from "@/utils/sessionCleanup"
import { logger } from "@/utils/logger"
import router from "@/router"

const log = logger.create("LocalSession")

// Lazy-loaded Pinia session to avoid initialization order issues
let _piniaSession = null
function getPiniaSession() {
	if (!_piniaSession) {
		try {
			// Dynamic import to avoid circular dependency and Pinia initialization issues
			const { useSessionStore } = require("@/stores/session")
			_piniaSession = useSessionStore()
		} catch {
			// Fallback for test environments without Pinia
			_piniaSession = {
				user: null,
				isLoggedIn: false,
				async login() { return null },
				async logout() {},
				async refresh() {},
			}
		}
	}
	return _piniaSession
}

/**
 * Local session management — completely offline, no Frappe dependency.
 * Uses Pinia session store as the source of truth.
 */
export function sessionUser() {
	return getPiniaSession().user
}

export const session = reactive({
	async login(credentials) {
		const { email, password } = credentials || {}
		if (!email || !password) {
			throw new Error("بيانات الدخول ناقصة")
		}

		const piniaSession = getPiniaSession()
		await piniaSession.login({ usr: email, pwd: password })

		session.user = piniaSession.user
		session.login.reset()
		return { success: true }
	},

	async logout() {
		try {
			const piniaSession = getPiniaSession()
			await piniaSession.logout()
		} catch (error) {
			log.warn("Session logout error:", error)
		}

		await cleanupUserSession()
		session.user = null
		router.replace({ name: "Login" })
	},

	user: null,
	isLoggedIn: computed(() => getPiniaSession().isLoggedIn),

	login: {
		reset() {
			// No-op for local session
		},
	},
})

export default session