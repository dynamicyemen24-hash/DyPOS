/**
 * useOpenInvoices — multi-invoice tabs over the single-cart sale page.
 *
 * The page keeps exactly ONE live cart (its refs); this controller parks the
 * whole working state aside and restores it on demand, so a cashier can serve
 * several customers without finishing or abandoning any basket.
 *
 * Adapter contract (page-owned refs stay in the page):
 *   readActive()  → snapshot object (with stable `id`) or null when empty
 *   writeActive(snapshot) → load a parked snapshot into the page refs
 *   clearActive() → empty the page for a fresh sale (mints a new sequence)
 *   isActiveEmpty() → boolean
 *   notify(message, kind) → Arabic toast (optional)
 *
 * Safety rules:
 *  - Switching never discards: a non-empty active cart is parked first.
 *  - Parking the same id twice updates in place (retry/double-tap safe).
 *  - At most MAX_OPEN_INVOICES parked; the refusal names the recovery
 *    (complete or close one) instead of silently dropping a sale.
 *  - Every mutation persists (debounced) to IndexedDB + a synchronous
 *    localStorage mirror; `pagehide` flushes, so power cuts keep every tab.
 *  - Never throws into the sale flow.
 */
import { onScopeDispose, ref } from "vue"

import { logger } from "@/utils/logger"
import {
	closeInvoice,
	findInvoice,
	nextInvoiceLabel,
	parkInvoice,
	MAX_OPEN_INVOICES,
} from "@/utils/openInvoicesPure"
import {
	flushOpenInvoices,
	persistOpenInvoices,
	readOpenInvoices,
} from "@/utils/openInvoicesStore"

const log = logger.create("OpenInvoices")

export function useOpenInvoices(adapter = {}) {
	const parked = ref([])
	const activeInvoiceId = ref(null)
	const booted = ref(false)
	let pagehideHandler = null

	const notify =
		typeof adapter.notify === "function" ? adapter.notify : () => {}

	function schedulePersist() {
		try {
			persistOpenInvoices(parked.value)
		} catch (error) {
			log.debug("Open invoices persist failed", error?.message)
		}
	}

	function readSnapshot() {
		try {
			return typeof adapter.readActive === "function"
				? adapter.readActive()
				: null
		} catch (error) {
			log.debug("Open invoices read failed", error?.message)
			return null
		}
	}

	function isEmpty() {
		try {
			if (typeof adapter.isActiveEmpty === "function") {
				return adapter.isActiveEmpty()
			}
		} catch {
			return true
		}
		return !readSnapshot()
	}

	/** Park the live cart aside (F4 / تعليق). Keeps the sale, empties the page. */
	function parkActive() {
		const snapshot = readSnapshot()
		if (!snapshot) {
			notify("السلة فارغة — لا يوجد ما يُعلَّق", "warning")
			return { ok: false, reason: "empty" }
		}
		if (!snapshot.label) {
			snapshot.label = nextInvoiceLabel(parked.value)
		}
		const result = parkInvoice(parked.value, snapshot)
		if (!result.ok) {
			notify(
				`تعذّر التعليق: الحد الأقصى ${MAX_OPEN_INVOICES} فواتير — أتمم أو أغلق واحدة أولًا`,
				"error",
			)
			return result
		}
		parked.value = result.list
		schedulePersist()
		try {
			adapter.clearActive?.()
		} catch (error) {
			log.debug("Open invoices clear failed", error?.message)
		}
		activeInvoiceId.value = null
		notify(`عُلّقت ${snapshot.label} — يمكن استئنافها من التبويبات`, "success")
		return { ok: true, id: snapshot.id }
	}

	/** Open a parked invoice: the live cart is parked first, nothing is lost. */
	function resumeInvoice(id) {
		const target = findInvoice(parked.value, id)
		if (!target) {
			notify("الفاتورة المعلقة غير موجودة", "error")
			return { ok: false, reason: "not_found" }
		}
		const current = readSnapshot()
		if (current) {
			const keep = parkInvoice(parked.value, {
				...current,
				label: current.label || nextInvoiceLabel(parked.value),
			})
			if (!keep.ok) {
				notify(
					`تعذّر التبديل: الحد الأقصى ${MAX_OPEN_INVOICES} فواتير — أتمم أو أغلق واحدة أولًا`,
					"error",
				)
				return keep
			}
			parked.value = keep.list
		}
		const closed = closeInvoice(parked.value, id)
		parked.value = closed.list
		schedulePersist()
		try {
			adapter.writeActive?.({ ...target })
		} catch (error) {
			log.debug("Open invoices restore failed", error?.message)
			return { ok: false, reason: "apply_failed" }
		}
		activeInvoiceId.value = String(target.id)
		notify(`استُئنفت ${target.label || "الفاتورة"}`, "success")
		return { ok: true, id: target.id }
	}

	/** Drop a parked invoice permanently (explicit close only). */
	function closeParked(id, opts = {}) {
		const target = findInvoice(parked.value, id)
		const result = closeInvoice(parked.value, id)
		if (!result.ok) return result
		parked.value = result.list
		schedulePersist()
		// Silent completions (a resumed invoice just got paid) must not toast
		// over the success receipt.
		if (!opts.silent) {
			notify(`أُغلقت ${target?.label || "الفاتورة"}`, "info")
		}
		return result
	}

	/** Fresh sale: park the live cart first when it holds anything. */
	function newInvoice() {
		if (!isEmpty()) {
			const kept = parkActive()
			if (!kept.ok) return kept
		}
		try {
			adapter.clearActive?.()
		} catch (error) {
			log.debug("Open invoices clear failed", error?.message)
		}
		activeInvoiceId.value = null
		return { ok: true }
	}

	/** Boot: restore parked tabs from the previous session. */
	async function boot() {
		if (booted.value) return parked.value
		booted.value = true
		try {
			parked.value = await readOpenInvoices()
		} catch (error) {
			log.debug("Open invoices boot restore failed", error?.message)
			parked.value = []
		}
		return parked.value
	}

	/** Immediate persist for submit/unload paths (no 800ms window). */
	async function flush() {
		try {
			await flushOpenInvoices(parked.value)
		} catch (error) {
			log.debug("Open invoices flush failed", error?.message)
		}
	}

	if (typeof window !== "undefined") {
		pagehideHandler = () => {
			try {
				void flushOpenInvoices(parked.value)
			} catch {
				// Never break unload.
			}
		}
		window.addEventListener("pagehide", pagehideHandler)
		onScopeDispose(() => {
			try {
				if (pagehideHandler) {
					window.removeEventListener("pagehide", pagehideHandler)
				}
			} catch {
				// Ignore teardown errors.
			}
		})
	}

	return {
		parked,
		activeInvoiceId,
		booted,
		parkActive,
		resumeInvoice,
		closeParked,
		newInvoice,
		boot,
		flush,
	}
}

export default useOpenInvoices
