import { ensureStockSyncAllowed } from "@/composables/useStockSyncLinkGuard"

/**
 * Stock-sync apply step for POS settings.
 *
 * Extracted so `POSSettings.vue` stays under its file-size ratchet: the page
 * owns the refs, this module owns the configure/start/stop sequence including
 * the standalone-first link guard.
 */
export function createStockSyncApplier({
	enabledRef,
	intervalSecondsRef,
	statusRef,
	worker,
	save,
	refreshStatus,
	emitConfigured,
	notifyError,
	log,
}) {
	return async function applyStockSyncConfig() {
		try {
			const allowed = await ensureStockSyncAllowed({
				enabledRef,
				statusRef,
				worker,
				save,
				notifyError,
			})
			if (!allowed) return
			const intervalMs = intervalSecondsRef.value * 1000
			if (enabledRef.value) {
				await worker.configureStockSync({ intervalMs })
				await worker.startStockSync()
			} else {
				await worker.stopStockSync()
			}
			await refreshStatus()
			save()
			emitConfigured({ enabled: enabledRef.value, intervalMs })
		} catch (error) {
			log?.error?.("Failed to apply stock sync config:", error)
		}
	}
}

export default createStockSyncApplier
