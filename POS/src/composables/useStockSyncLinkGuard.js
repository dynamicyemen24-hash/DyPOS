import { isLinkEnabled } from "@/services/link-consent"
import { __ } from "@/utils/translation"

/**
 * Standalone-first guard for automatic stock sync.
 *
 * Without explicit linkage consent the worker refuses silently while the UI
 * would show Active — so the caller stops here and tells the cashier the
 * recovery (enable linkage from the sync center).
 *
 * @param {object} deps
 * @param {import("vue").Ref<boolean>} deps.enabledRef
 * @param {import("vue").Ref<object>} deps.statusRef
 * @param {object} deps.worker - offlineWorker (configure/start/stop).
 * @param {Function} deps.save - persist settings to localStorage.
 * @param {Function} deps.notifyError - toast error (Arabic).
 * @returns {Promise<boolean>} true when sync may proceed.
 */
export async function ensureStockSyncAllowed({
	enabledRef,
	statusRef,
	worker,
	save,
	notifyError,
}) {
	if (enabledRef.value && !isLinkEnabled()) {
		await worker.stopStockSync().catch(() => {})
		statusRef.value = {
			...statusRef.value,
			enabled: false,
			linkRequired: true,
		}
		notifyError(
			__("المزامنة التلقائية تحتاج تفعيل الربط أولًا من مركز المزامنة."),
		)
		save()
		return false
	}
	return true
}

export default ensureStockSyncAllowed
