import { logger } from "./logger"
import { cleanupUserSession } from "@/utils/sessionCleanup"
import {
	normalizeAuthError,
	extractAuthStatus,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
} from "@/utils/authErrors"

const log = logger.create("Auth")
/**
 * Auth facade — the single entry point for the authentication layer.
 *
 * Re-exports the low-level cleanup and classification helpers so consumers
 * (Login.vue, session store) never reach into implementation details.
 *
 * NOTE: the default export below needs REAL local bindings — shorthand
 * object properties are NOT re-exports. A missing import here throws
 * ReferenceError at module load and breaks every importer (this bricked
 * Login.vue entirely until fixed).
 */

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
