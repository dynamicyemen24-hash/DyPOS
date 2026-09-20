import { logger } from "./logger"

const log = logger.create("Auth")
/**
 * Auth facade — the single entry point for the authentication layer.
 *
 * Re-exports the low-level cleanup and classification helpers so consumers
 * (Login.vue, session store) never reach into implementation details.
 */

export { cleanupUserSession } from "@/utils/sessionCleanup"

export {
	normalizeAuthError,
	extractAuthStatus,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
} from "@/utils/authErrors"

/**
 * Best-effort full logout teardown. Does not throw; logs and swallows
 * per-step failures so logout never hangs.
 */
export async function terminateSession() {
	try {
		const { session } = await import("@/data/session")
		await session.logout.submit()
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
