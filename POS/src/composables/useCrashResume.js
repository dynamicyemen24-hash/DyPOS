/**
 * DyPOS Crash-Resume composable — thin, never-throwing wiring layer.
 *
 * `installCrashResume(adapter)` is the ready-to-wire entry point: call it
 * from any post-boot context (main.js after mount, router afterEach, or a
 * route-level bootstrap) with a store/adapter that reads the LIVE cart.
 *
 * What it does:
 *  - On boot: if the live cart is EMPTY and a valid crash draft exists,
 *    exposes `pendingDraft` + Arabic `messages` so the UI can offer
 *    [استئناف عملية البيع] / [تجاهل].
 *  - Auto-captures on every cart/panel change via the throttled writer and
 *    flushes synchronously on `pagehide` (power-cut / tab-close proof).
 *  - `accept()` restores the draft into the empty cart (never overwrites a
 *    live cart — enforced by mergeDraftIntoCart).
 *  - `dismiss()` discards the draft permanently.
 *  - Never throws; fully offline-safe; touches localStorage ONLY (never the
 *    IndexedDB live-snapshot or the offline sync queue).
 *
 * Adapter contract (accepted shapes, in priority order):
 *   1) { getItems, setItems, getPanel?, setPanel?, getMeta?, setMeta?,
 *        isCartEmpty? } — fully explicit; the canonical wiring shape.
 *   2) a Vue ref named `invoiceItems` (or `cart`) passed directly:
 *      { invoiceItems: Ref<Array>, setPanel?, ... }.
 *   3) a Pinia setup-store INSTANCE exposing an unwrapped `invoiceItems`/`cart`
 *      array (refs are unwrapped on the store proxy; property assignment writes
 *      back into state). Panel/meta are not restorable unless the store also
 *      exposes getPanel/setPanel (in POSSale the payment panel lives in the
 *      component, so wiring should pass the explicit function shape).
 */
import { ref, watch, effectScope, getCurrentScope, onScopeDispose } from "vue"

import { logger } from "@/utils/logger"
import { t } from "@/composables/useLocale"
import {
	captureDraftState,
	clearDraft,
	flushDraft,
	readDraftRaw,
	restoreDraft,
	mergeDraftIntoCart,
	writeDraftThrottled,
	resetDraftThrottle,
} from "@/utils/useCrashResume"

const log = logger.create("CrashResume")

const MESSAGE_KEYS = Object.freeze({
	title: "cashier_resume_title",
	body: "cashier_resume_body",
	accept: "cashier_resume_accept",
	dismiss: "cashier_resume_dismiss",
	subtitle: "cashier_resume_subtitle",
})

/** Arabic-first message builder (matched to DyPOS tone). */
export function buildResumeMessages(draft) {
	const itemsCount = Array.isArray(draft?.cart?.items)
		? draft.cart.items.length
		: 0
	const savedAt = draft?.savedAt || null
	return {
		title: t(MESSAGE_KEYS.title, "استئناف عملية البيع"),
		body: t(
			MESSAGE_KEYS.body,
			"عُثر على عملية بيع مُعلّقة ({0} صنف). هل تريد استئنافها من حيث توقفت؟",
		).replace("{0}", String(itemsCount)),
		subtitle: savedAt
			? t(MESSAGE_KEYS.subtitle, "آخر حفظ: {0}").replace(
					"{0}",
					formatSavedAt(savedAt),
				)
			: "",
		accept: t(MESSAGE_KEYS.accept, "استئناف البيع"),
		dismiss: t(MESSAGE_KEYS.dismiss, "تجاهل"),
	}
}

function formatSavedAt(savedAt) {
	try {
		const date = new Date(savedAt)
		return Number.isNaN(Number(date)) ? savedAt : date.toLocaleString()
	} catch {
		return String(savedAt || "")
	}
}

function isVueRef(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		"value" in value &&
		typeof value.value !== "undefined"
	)
}

const refShapeIsEmpty = (source) => () => {
	const current = source.value
	return !Array.isArray(current) || current.length === 0
}

function normalizeAdapter(adapter) {
	if (!adapter || typeof adapter !== "object") return null
	if (typeof adapter.getItems === "function") {
		return adapter
	}

	const source = adapter.invoiceItems ?? adapter.cart
	if (source && isVueRef(source)) {
		return {
			getItems: () => (Array.isArray(source.value) ? source.value : []),
			setItems: (items) => {
				source.value = items
			},
			getPanel:
				typeof adapter.getPanel === "function" ? adapter.getPanel : () => null,
			setPanel:
				typeof adapter.setPanel === "function" ? adapter.setPanel : null,
			getMeta:
				typeof adapter.getMeta === "function" ? adapter.getMeta : () => null,
			setMeta: typeof adapter.setMeta === "function" ? adapter.setMeta : null,
			isCartEmpty:
				typeof adapter.isCartEmpty === "function"
					? adapter.isCartEmpty
					: refShapeIsEmpty(source),
		}
	}

	// Pinia setup-store shape: refs are UNWRAPPED on the store proxy, so
	// `adapter.invoiceItems` (or `adapter.cart`) is a plain array and a fresh
	// assignment via the store proxy writes back into state. Guarded by the
	// `$state` marker so plain data objects are never mistaken for a store.
	if (adapter.$state && typeof adapter.$state === "object") {
		const unwrapped = adapter.invoiceItems ?? adapter.cart
		if (Array.isArray(unwrapped)) {
			return {
				getItems: () => {
					const current = adapter.invoiceItems ?? adapter.cart
					return Array.isArray(current) ? current : []
				},
				setItems: (items) => {
					if ("invoiceItems" in adapter) {
						adapter.invoiceItems = items
					} else {
						adapter.cart = items
					}
				},
				getPanel:
					typeof adapter.getPanel === "function"
						? adapter.getPanel
						: () => null,
				setPanel:
					typeof adapter.setPanel === "function" ? adapter.setPanel : null,
				getMeta:
					typeof adapter.getMeta === "function" ? adapter.getMeta : () => null,
				setMeta: typeof adapter.setMeta === "function" ? adapter.setMeta : null,
				isCartEmpty:
					typeof adapter.isCartEmpty === "function"
						? adapter.isCartEmpty
						: () => {
								const current = adapter.invoiceItems ?? adapter.cart
								return !Array.isArray(current) || current.length === 0
							},
			}
		}
	}

	return null
}

function summarizeDraft(draft) {
	return {
		itemsCount: Array.isArray(draft?.cart?.items) ? draft.cart.items.length : 0,
		savedAt: draft?.savedAt || null,
		fingerprint: draft?.fingerprint || null,
		raw: draft,
	}
}

const INVALID_REASONS = new Set([
	"not_json",
	"invalid_draft",
	"schema_invalid",
	"no_items",
	"too_many_items",
	"invalid_timestamp",
	"too_old",
	"size_exceeded",
])

/**
 * Install the crash-resume controller. Returns an object that never throws:
 * { installed, pendingDraft, messages, accept, dismiss, captureNow, stop }.
 */
export function installCrashResume(adapter, options = {}) {
	const controller = {
		installed: false,
		pendingDraft: ref(null),
		messages: ref(null),
	}
	const onError =
		typeof options?.onError === "function"
			? options.onError
			: (error) => log.debug?.("CrashResume error", error?.message)

	const normal = normalizeAdapter(adapter)
	if (!normal) {
		onError(new Error("Unsupported store shape; crash-resume disabled"))
		return {
			...controller,
			accept: () => ({ ok: false, reason: "unsupported" }),
			dismiss: () => ({ ok: false, reason: "unsupported" }),
			captureNow: () => false,
			stop: () => false,
		}
	}

	const scope = effectScope()
	let stopped = false
	let cooldownUntil = 0

	function isCooling() {
		return Date.now() < cooldownUntil
	}

	function dismiss() {
		if (stopped) return { ok: false, reason: "stopped" }
		try {
			clearDraft()
		} catch (error) {
			onError(error)
		}
		controller.pendingDraft.value = null
		controller.messages.value = null
		return { ok: true }
	}

	function accept() {
		if (stopped) return { ok: false, reason: "stopped" }
		const pending = controller.pendingDraft.value
		if (!pending) return { ok: false, reason: "no_pending" }

		const result = restoreDraft(pending.raw, options)
		if (!result.ok) {
			// Draft is stale/corrupt — drop it so it stops nagging.
			clearDraft()
			controller.pendingDraft.value = null
			controller.messages.value = null
			return { ok: false, reason: result.reason }
		}

		try {
			if (!normal.isCartEmpty()) {
				return { ok: false, reason: "cart_not_empty" }
			}
			const merged = mergeDraftIntoCart(result.draft, [])
			if (!merged.ok) return { ok: false, reason: merged.reason }

			normal.setItems(merged.items)
			if (
				typeof normal.setPanel === "function" &&
				isPlainish(result.draft.panel)
			) {
				normal.setPanel(result.draft.panel)
			}
			if (
				typeof normal.setMeta === "function" &&
				isPlainish(result.draft.meta)
			) {
				normal.setMeta(result.draft.meta)
			}
		} catch (error) {
			// Applying failed — keep the draft so a retry is possible.
			onError(error)
			return { ok: false, reason: "apply_failed" }
		}

		clearDraft()
		controller.pendingDraft.value = null
		controller.messages.value = null
		// The just-restored cart must not instantly re-capture and re-nag.
		cooldownUntil = Date.now() + 1100
		return { ok: true }
	}

	function captureNow() {
		if (stopped || isCooling()) return false
		try {
			const items = normal.getItems()
			const panel =
				typeof normal.getPanel === "function" ? normal.getPanel() : null
			const meta =
				typeof normal.getMeta === "function" ? normal.getMeta() : null
			const draft = captureDraftState(items, panel, meta)
			if (!draft) {
				// Empty cart = nothing to resume; clear a lingering draft.
				if (readDraftRaw()) clearDraft()
				if (controller.pendingDraft.value) {
					controller.pendingDraft.value = null
					controller.messages.value = null
				}
				return false
			}
			return writeDraftThrottled(draft)
		} catch (error) {
			onError(error)
			return false
		}
	}

	function onPageHide() {
		try {
			if (!isCooling()) flushDraft()
		} catch (error) {
			onError(error)
		}
	}

	// Boot: surface a pending draft ONLY when cart is empty.
	try {
		const boot = restoreDraft(readDraftRaw(), options)
		if (boot.ok && normal.isCartEmpty()) {
			controller.pendingDraft.value = summarizeDraft(boot.draft)
			controller.messages.value = buildResumeMessages(boot.draft)
		} else if (!boot.ok && INVALID_REASONS.has(boot.reason)) {
			clearDraft()
		}
	} catch (error) {
		onError(error)
	}

	// Auto-capture on cart/panel drift (getter-returned fingerprint stays
	// primitive, so Vue only fires the callback on ACTUAL changes).
	scope.run(() => {
		watch(
			() => {
				try {
					const items = normal.getItems()
					const panel =
						typeof normal.getPanel === "function" ? normal.getPanel() : null
					const meta =
						typeof normal.getMeta === "function" ? normal.getMeta() : null
					const draft = captureDraftState(items, panel, meta)
					return draft ? `${draft.fingerprint}|${draft.savedAt}` : "<empty>"
				} catch (error) {
					onError(error)
					return "<error>"
				}
			},
			() => {
				captureNow()
			},
		)
	})

	if (typeof window !== "undefined") {
		window.addEventListener("pagehide", onPageHide)
	}

	function stop() {
		if (stopped) return
		stopped = true
		try {
			scope.stop()
		} catch (error) {
			onError(error)
		}
		if (typeof window !== "undefined") {
			window.removeEventListener("pagehide", onPageHide)
		}
		resetDraftThrottle()
	}

	controller.installed = true
	controller.accept = accept
	controller.dismiss = dismiss
	controller.captureNow = captureNow
	controller.stop = stop
	return controller
}

function isPlainish(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Thin composable wrapper: installs the controller and auto-stops it when the
 * owning component/scope is disposed. Identical surface to installCrashResume.
 */
export function useCrashResume(adapter, options = {}) {
	const controller = installCrashResume(adapter, options)
	if (getCurrentScope()) {
		onScopeDispose(() => controller.stop())
	}
	return controller
}

export default useCrashResume
