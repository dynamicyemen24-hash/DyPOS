import { clearAllDrafts } from "@/utils/draftManager"
import { clearAllOfflineReceiptPayloads } from "@/utils/offline/offlineReceiptCache"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSUIStore } from "@/stores/posUI"
import { useSessionLock } from "@/composables/useSessionLock"
import { shiftState } from "@/composables/useShift"
import { logger } from "@/utils/logger"

const log = logger.create("SessionCleanup")

/**
 * ============================================================================
 * DyPOS — User Session Cleanup
 * ============================================================================
 *
 * Security boundary for shared POS devices.
 *
 * This module is the SINGLE client-side cleanup entry point for:
 *
 * - Logout
 * - Forced logout
 * - Session expiry
 * - Account switching
 * - Lock-screen sign out
 * - Shift-close sign out
 *
 * Design principles:
 *
 * 1. Idempotent
 * 2. Best-effort
 * 3. Fail-safe
 * 4. SSR-safe
 * 5. No device configuration loss
 * 6. No user data leakage between cashiers
 * 7. No dependency on authentication implementation
 * 8. No UI navigation
 * 9. No server logout
 *
 * IMPORTANT:
 * This module destroys CLIENT-SIDE state only.
 * Server authentication invalidation remains the responsibility of the
 * authentication/session layer.
 */

/* -------------------------------------------------------------------------- */
/* Storage contract                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Explicit user-owned localStorage keys.
 *
 * DO NOT put device-level configuration here.
 */
const USER_LOCAL_STORAGE_KEYS = Object.freeze([
	"pos_session_lock",
	"pos_session_pwd_hash",
	"pos_lock_attempts",
	"pos_shift_data",
	"pos_recent_customers",
	"pos_frequent_customers",
	"pos_customers_last_sync",
	"pos_invoice_filters",
])

/**
 * Namespaced user storage.
 *
 * Any future user-specific feature should preferably use one of these
 * namespaces rather than adding arbitrary storage keys.
 */
const USER_LOCAL_STORAGE_PREFIXES = Object.freeze(["pos_user_", "pos_cashier_"])

/**
 * Session storage is intentionally explicit.
 *
 * Do not clear the entire sessionStorage because other application
 * infrastructure may legitimately own unrelated entries.
 */
const USER_SESSION_STORAGE_KEYS = Object.freeze([
	"pos_session_lock",
	"pos_lock_attempts",
	"pos_shift_data",
])

/* -------------------------------------------------------------------------- */
/* Runtime state                                                              */
/* -------------------------------------------------------------------------- */

let cleanupPromise = null
let cleanupGeneration = 0

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function now() {
	return typeof performance !== "undefined" ? performance.now() : Date.now()
}

/* -------------------------------------------------------------------------- */
/* Result helpers                                                             */
/* -------------------------------------------------------------------------- */

function createSectionResult(success = true, extra = {}) {
	return {
		success,
		...extra,
	}
}

function createCleanupResult() {
	return {
		success: true,
		partial: false,
		generation: cleanupGeneration,

		localStorage: null,
		sessionStorage: null,
		sessionLock: null,
		pinia: null,
		shift: null,
		offlineReceipts: null,
		drafts: null,

		errors: [],
		durationMs: 0,
	}
}

function recordError(result, section, error) {
	if (!error) {
		return
	}

	result.errors.push({
		section,
		error,
	})
}

/* -------------------------------------------------------------------------- */
/* LocalStorage                                                               */
/* -------------------------------------------------------------------------- */

function clearUserLocalStorage() {
	if (!isBrowser()) {
		return createSectionResult(true, {
			cleared: 0,
			failed: 0,
		})
	}

	let cleared = 0
	let failed = 0

	/**
	 * Explicitly registered keys.
	 */
	for (const key of USER_LOCAL_STORAGE_KEYS) {
		try {
			localStorage.removeItem(key)
			cleared += 1
		} catch (error) {
			failed += 1

			log.warn?.("Unable to clear localStorage key", {
				key,
				error,
			})
		}
	}

	/**
	 * Future-proof namespaced keys.
	 *
	 * Iterate backwards because localStorage is a live collection.
	 */
	for (let index = localStorage.length - 1; index >= 0; index -= 1) {
		let key = null

		try {
			key = localStorage.key(index)
		} catch {
			continue
		}

		if (!key) {
			continue
		}

		const userOwned = USER_LOCAL_STORAGE_PREFIXES.some((prefix) =>
			key.startsWith(prefix),
		)

		if (!userOwned) {
			continue
		}

		try {
			localStorage.removeItem(key)
			cleared += 1
		} catch (error) {
			failed += 1

			log.warn?.("Unable to clear user-scoped localStorage key", {
				key,
				error,
			})
		}
	}

	return createSectionResult(failed === 0, {
		cleared,
		failed,
	})
}

/* -------------------------------------------------------------------------- */
/* SessionStorage                                                             */
/* -------------------------------------------------------------------------- */

function clearUserSessionStorage() {
	if (!isBrowser() || typeof sessionStorage === "undefined") {
		return createSectionResult(true, {
			cleared: 0,
			failed: 0,
		})
	}

	let cleared = 0
	let failed = 0

	for (const key of USER_SESSION_STORAGE_KEYS) {
		try {
			sessionStorage.removeItem(key)
			cleared += 1
		} catch (error) {
			failed += 1

			log.warn?.("Unable to clear sessionStorage key", {
				key,
				error,
			})
		}
	}

	return createSectionResult(failed === 0, {
		cleared,
		failed,
	})
}

/* -------------------------------------------------------------------------- */
/* Session lock                                                               */
/* -------------------------------------------------------------------------- */

function resetSessionLock() {
	try {
		const { stopActivityTracking, clearLock } = useSessionLock()

		/**
		 * Stop producers first.
		 *
		 * Otherwise an activity listener/timer could recreate session
		 * state immediately after it has been deleted.
		 */
		stopActivityTracking()
		clearLock()

		return createSectionResult(true)
	} catch (error) {
		log.error?.("Session lock cleanup failed", error)

		return createSectionResult(false, { error })
	}
}

/* -------------------------------------------------------------------------- */
/* Pinia                                                                       */
/* -------------------------------------------------------------------------- */

function resetPiniaStores() {
	const errors = []

	/**
	 * Cart
	 */
	try {
		const cartStore = usePOSCartStore()

		cartStore.clearCart()

		/**
		 * Session-owned references must not survive logout.
		 */
		cartStore.posOpeningShift = null
		cartStore.posProfile = null
	} catch (error) {
		errors.push(error)

		log.error?.("POS cart cleanup failed", error)
	}

	/**
	 * UI
	 */
	try {
		const uiStore = usePOSUIStore()

		uiStore.resetAllDialogs()
	} catch (error) {
		errors.push(error)

		log.error?.("POS UI cleanup failed", error)
	}

	return createSectionResult(errors.length === 0, { errors })
}

/* -------------------------------------------------------------------------- */
/* Shift                                                                      */
/* -------------------------------------------------------------------------- */

function resetShift() {
	try {
		shiftState.value = {
			pos_opening_shift: null,
			pos_profile: null,
			company: null,
			isOpen: false,

			_initialElapsedMs: 0,
			_receivedAt: 0,
		}

		return createSectionResult(true)
	} catch (error) {
		log.error?.("Shift state cleanup failed", error)

		return createSectionResult(false, { error })
	}
}

/* -------------------------------------------------------------------------- */
/* Offline receipts                                                            */
/* -------------------------------------------------------------------------- */

function clearOfflineReceipts() {
	try {
		clearAllOfflineReceiptPayloads()

		return createSectionResult(true)
	} catch (error) {
		log.error?.("Offline receipt cleanup failed", error)

		return createSectionResult(false, { error })
	}
}

/* -------------------------------------------------------------------------- */
/* IndexedDB drafts                                                           */
/* -------------------------------------------------------------------------- */

async function clearDrafts() {
	try {
		await clearAllDrafts()

		return createSectionResult(true)
	} catch (error) {
		log.error?.("Draft cleanup failed", error)

		return createSectionResult(false, { error })
	}
}

/* -------------------------------------------------------------------------- */
/* Cleanup execution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Execute cleanup exactly once for concurrent callers.
 *
 * If logout is triggered simultaneously by:
 *
 * - user button
 * - session expiry
 * - lock screen
 *
 * only one cleanup transaction runs.
 */
async function executeCleanup(generation) {
	const startedAt = now()

	const result = createCleanupResult()

	result.generation = generation

	/**
	 * ------------------------------------------------------------------------
	 * Phase 1 — Stop state producers
	 * ------------------------------------------------------------------------
	 *
	 * Must happen before state destruction.
	 */
	result.sessionLock = resetSessionLock()

	/**
	 * ------------------------------------------------------------------------
	 * Phase 2 — Clear in-memory user state
	 * ------------------------------------------------------------------------
	 *
	 * These operations are synchronous and independent.
	 */
	result.pinia = resetPiniaStores()

	result.shift = resetShift()

	/**
	 * ------------------------------------------------------------------------
	 * Phase 3 — Clear browser persistence
	 * ------------------------------------------------------------------------
	 */
	result.localStorage = clearUserLocalStorage()

	result.sessionStorage = clearUserSessionStorage()

	/**
	 * ------------------------------------------------------------------------
	 * Phase 4 — Clear offline-sensitive data
	 * ------------------------------------------------------------------------
	 */
	result.offlineReceipts = clearOfflineReceipts()

	/**
	 * ------------------------------------------------------------------------
	 * Phase 5 — Clear IndexedDB
	 * ------------------------------------------------------------------------
	 *
	 * This is asynchronous and intentionally occurs after the synchronous
	 * user state has already disappeared.
	 */
	result.drafts = await clearDrafts()

	/**
	 * ------------------------------------------------------------------------
	 * Final aggregation
	 * ------------------------------------------------------------------------
	 */
	const sections = [
		result.localStorage,
		result.sessionStorage,
		result.sessionLock,
		result.pinia,
		result.shift,
		result.offlineReceipts,
		result.drafts,
	]

	result.partial = sections.some((section) => section?.success === false)

	result.success = !result.partial

	result.durationMs = Math.max(0, now() - startedAt)

	if (result.partial) {
		log.warn?.("User session cleanup completed partially", {
			generation,
			durationMs: result.durationMs,
			errors: result.errors.length,
		})
	} else {
		log.debug?.("User session cleanup completed", {
			generation,
			durationMs: result.durationMs,
		})
	}

	return result
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Centralized client-side user cleanup.
 *
 * Safe to call multiple times.
 *
 * Concurrent calls share the same Promise.
 */
export async function cleanupUserSession() {
	/**
	 * Deduplicate concurrent logout/expiry events.
	 */
	if (cleanupPromise) {
		return cleanupPromise
	}

	const generation = ++cleanupGeneration

	cleanupPromise = executeCleanup(generation).catch((error) => {
		/**
		 * Absolute last-resort protection.
		 *
		 * Cleanup must never crash the logout flow.
		 */
		log.error?.("Unexpected session cleanup failure", error)

		return {
			...createCleanupResult(),
			success: false,
			partial: true,
			generation,
			errors: [
				{
					section: "cleanup",
					error,
				},
			],
		}
	})

	try {
		return await cleanupPromise
	} finally {
		/**
		 * Release the shared promise only after every caller has received
		 * the same cleanup result.
		 */
		cleanupPromise = null
	}
}

/**
 * Semantic aliases.
 */
export const clearUserSession = cleanupUserSession

export const resetUserSession = cleanupUserSession

export default cleanupUserSession
