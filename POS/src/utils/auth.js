import { logger } from "./logger"
import { cleanupUserSession } from "@/utils/sessionCleanup"
import { session as piniaSession } from "@/stores/session"
import {
	normalizeAuthError,
	extractAuthStatus,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
} from "@/utils/authErrors"

const log = logger.create("Auth")

export { cleanupUserSession }

export {
	normalizeAuthError,
	extractAuthStatus,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
}

/**
 * Best-effort full logout teardown. Does not throw; logs and swallows
 * per-step failures so logout never hangs.
 */
export async function terminateSession() {
	try {
		await piniaSession.logout()
	} catch (error) {
		log.warn("DyPOS session logout failed", error)
		try {
			await cleanupUserSession()
		} catch (cleanupError) {
			log.warn("DyPOS session cleanup failed", cleanupError)
		}
	}
}

export default {
	cleanupUserSession,
	normalizeAuthError,
	extractAuthStatus,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
	terminateSession,
}
