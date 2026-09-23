/** DyPOS Recent Invoices v1.32.0
 *
 * Powers the desktop "latest invoices" widget. The visible count comes
 * from general settings (`desktop_recent_invoices_count`, 0 = hidden,
 * clamped 0..50), so every merchant tunes their own desktop.
 *
 * Online: `GET /api/invoices?limit=N` (newest first, server-side order).
 * Offline or on error: resolves to an empty list with `offline: true`
 * instead of throwing — the widget degrades, the desktop never breaks.
 */
import { ref } from "vue"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { isOffline } from "@/utils/offline"
import { logger } from "@/utils/logger"

const log = logger.create("RecentInvoices")

const invoices = ref([])
const loading = ref(false)
const offline = ref(false)
const lastLoadedAt = ref(null)

function normalizeRows(payload) {
	if (Array.isArray(payload)) return payload
	if (Array.isArray(payload?.invoices)) return payload.invoices
	if (Array.isArray(payload?.message)) return payload.message
	if (Array.isArray(payload?.data)) return payload.data
	return []
}

async function loadRecentInvoices() {
	const settings = usePOSSettingsStore()
	// Clamp 0..50 per module contract: 0 = hidden, >50 never leaves the client.
	const rawLimit = Number(settings.desktopRecentInvoicesCount ?? 10)
	const limit = Math.max(
		0,
		Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 10),
	)
	if (!limit || limit <= 0) {
		invoices.value = []
		return invoices.value
	}
	loading.value = true
	offline.value = false
	try {
		const { getInvoices } = await import("@/adapters/index.js")
		const rows = normalizeRows(await getInvoices({ limit, count: "false" }))
		invoices.value = rows.slice(0, limit)
		lastLoadedAt.value = new Date().toISOString()
	} catch (error) {
		log.debug("Recent invoices load failed", error?.message)
		invoices.value = []
		try {
			offline.value = isOffline()
		} catch {
			offline.value = true
		}
	} finally {
		loading.value = false
	}
	return invoices.value
}

export function useRecentInvoices() {
	return {
		invoices,
		loading,
		offline,
		lastLoadedAt,
		loadRecentInvoices,
	}
}

export default useRecentInvoices
