/** DyPOS Live Cart Recovery v1.32.0
 *
 * Keeps the OPEN working invoice alive across restarts, power cuts,
 * logout, or any unexpected exit — then tells the cashier on reboot.
 *
 * - Watches the live cart (debounced ~1.5s) and autosaves every change
 *   when `auto_save_open_invoice` is enabled in general settings.
 * - Flushes synchronously on `pagehide` (power-loss / tab-close proof).
 * - On boot, surfaces `pendingRecovery` (items count, saved time) so the
 *   UI can offer [استعادة الفاتورة] or [تجاهل].
 * - The snapshot clears itself on successful submit or explicit cart
 *   clear (wired in posCart), so a fresh boot shows nothing to recover.
 *
 * Singleton state: safe to call from App root and the banner.
 */
import { ref, watch } from "vue"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { logger } from "@/utils/logger"
import {
	buildLiveSnapshot,
	saveLiveSnapshot,
	readLiveSnapshot,
	clearLiveSnapshot,
} from "@/utils/liveCartAutosave"
import { clearDraft as clearCrashDraft } from "@/utils/useCrashResume"

const log = logger.create("LiveCartRecovery")

const pendingRecovery = ref(null)
const bootChecked = ref(false)
const recovering = ref(false)

let watcherStarted = false
let debounceTimer = null
let pagehideHandler = null

function snapshotNow(cart) {
	try {
		return buildLiveSnapshot({
			items: cart.invoiceItems?.value,
			customer: cart.customer?.value,
			additionalDiscount: cart.additionalDiscount?.value,
		})
	} catch (error) {
		log.debug("Live snapshot build failed", error?.message)
		return null
	}
}

function scheduleAutosave(cart, settings) {
	if (debounceTimer) {
		window.clearTimeout(debounceTimer)
		debounceTimer = null
	}
	const intervalMs =
		Math.max(1, Math.min(Number(settings.autosaveIntervalSeconds) || 2, 60)) *
		1000
	debounceTimer = window.setTimeout(() => {
		debounceTimer = null
		try {
			if (!settings.autoSaveOpenInvoice) return
			void saveLiveSnapshot(snapshotNow(cart))
		} catch (error) {
			log.debug("Autosave scheduling failed", error?.message)
		}
	}, intervalMs)
}

function startWatcher() {
	if (watcherStarted || typeof window === "undefined") return
	watcherStarted = true
	try {
		const cart = usePOSCartStore()
		const settings = usePOSSettingsStore()

		watch(
			() => [
				cart.invoiceItems?.value,
				cart.customer?.value,
				cart.additionalDiscount?.value,
			],
			() => scheduleAutosave(cart, settings),
			{ deep: true },
		)

		pagehideHandler = () => {
			try {
				if (!settings.autoSaveOpenInvoice) return
				// Synchronous mirror write inside pagehide survives power cuts;
				// the IndexedDB write fires best-effort alongside it.
				void saveLiveSnapshot(snapshotNow(cart))
			} catch {
				// Never break unload.
			}
		}
		window.addEventListener("pagehide", pagehideHandler)
	} catch (error) {
		log.debug("Live cart watcher failed to start", error?.message)
	}
}

/** Boot check: is there an unsent open invoice from a previous session? */
async function checkBootRecovery() {
	if (bootChecked.value) return pendingRecovery.value
	bootChecked.value = true
	try {
		const snapshot = await readLiveSnapshot()
		if (snapshot?.items?.length > 0) {
			pendingRecovery.value = {
				itemsCount: snapshot.items.length,
				savedAt: snapshot.savedAt,
				customerName:
					snapshot.customer?.customer_name || snapshot.customer?.name || null,
				snapshot,
			}
			log.info("Unrestored open invoice found", {
				items: snapshot.items.length,
				savedAt: snapshot.savedAt,
			})
		}
	} catch (error) {
		log.debug("Boot recovery check failed", error?.message)
	}
	return pendingRecovery.value
}

/** Best-effort cross-clear: the crash draft is a separate layer from the
 *  live snapshot; once the cashier restores/discards the open invoice we must
 *  drop any crash prompt too, so the two never double-prompt on the same
 *  basket. Never throws — must not break the live-cart recovery flow. */
function clearCrashDraftSafe() {
	try {
		clearCrashDraft()
	} catch {
		// Ignore: crash draft cleanup is best-effort.
	}
}

/** Restore the surviving invoice back into the live cart. */
async function restoreLiveCart() {
	const pending = pendingRecovery.value
	if (!pending) return false
	recovering.value = true
	try {
		const cart = usePOSCartStore()
		cart.invoiceItems.value = pending.snapshot.items || []
		cart.customer.value = pending.snapshot.customer || null
		cart.additionalDiscount.value =
			Number(pending.snapshot.additionalDiscount) || 0
		pendingRecovery.value = null
		// Keep the snapshot until the invoice is submitted or cleared,
		// so a second crash during review still recovers.
		clearCrashDraftSafe()
		return true
	} catch (error) {
		log.warn("Live cart restore failed", error?.message)
		return false
	} finally {
		recovering.value = false
	}
}

/** Discard the surviving invoice permanently. */
async function discardLiveCart() {
	try {
		await clearLiveSnapshot()
		clearCrashDraftSafe()
	} finally {
		pendingRecovery.value = null
	}
}

export function useLiveCartRecovery() {
	startWatcher()
	return {
		pendingRecovery,
		recovering,
		checkBootRecovery,
		restoreLiveCart,
		discardLiveCart,
		clearLiveSnapshot,
	}
}

export default useLiveCartRecovery
