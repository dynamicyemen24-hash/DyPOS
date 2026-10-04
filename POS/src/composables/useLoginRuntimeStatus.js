/**
 * Runtime readiness — the status row and its detail table.
 *
 * ## Why this moved out of `Login.vue`
 *
 * The page is under the tightest file-size cap in the tree, and this was ~70
 * lines of presentation logic inside it. The ratchet's answer to "the page must
 * grow" is "extract the behaviour", not "raise the number".
 *
 * ## A real bug this extraction surfaced
 *
 * The old `hasRuntimeStatus` computed did this:
 *
 *     useLoginRuntime.getState?.()[key]
 *
 * but `useLoginRuntime` is a **destructured set of composables**, not an
 * object with a `getState` method — so the optional call was always `undefined`
 * and the computed was always `false`. The status row could therefore never
 * appear, and no test noticed because asserting on it required mounting the
 * whole 1800-line page.
 *
 * The truth is simpler and it was already in scope here: the row should show
 * when any of those signals is KNOWN, and each signal is a plain ref on this
 * screen. `some(isKnown)` is the rule; it is written down and testable here.
 */
import { computed } from "vue"

/** state → { type, icon, label }. `unknown` is a real state, not a catch-all. */
export const RUNTIME_STATUS_BY_STATE = Object.freeze({
	offline: { type: "warning", icon: "wifi-off", label: "وضع العمل دون اتصال" },
	limited: {
		type: "warning",
		icon: "wifi-off",
		label: "سيتم المتابعة بوضع اتصال محدود",
	},
	ready: { type: "success", icon: "check-circle", label: "بيئة التشغيل جاهزة" },
	preparing: { type: "info", icon: "loader", label: "جاري تجهيز بيئة التشغيل" },
	unknown: { type: "neutral", icon: "shield", label: "بيئة التشغيل" },
})

/**
 * The status row for a runtime state.
 *
 * @param {import("vue").Ref<string>} state
 * @returns {import("vue").ComputedRef<{type: string, icon: string, label: string}>}
 */
export function useRuntimeStatus(state) {
	return computed(
		() =>
			RUNTIME_STATUS_BY_STATE[state.value] ?? RUNTIME_STATUS_BY_STATE.unknown,
	)
}

/**
 * The four detail rows: one per signal, rendered by a `v-for`.
 *
 * @param {object} signals plain values, NOT refs — the caller unwraps them
 * @returns {Array<{label: string, value: string}>}
 */
export function buildRuntimeDetails({
	isOnline,
	csrfReady,
	sessionReady,
	offlineReady,
}) {
	return [
		{ label: "الاتصال", value: isOnline ? "متصل" : "غير متصل" },
		{ label: "الحماية", value: csrfReady ? "جاهزة" : "قيد التجهيز" },
		{ label: "الجلسة", value: sessionReady ? "جاهزة" : "غير مهيأة" },
		{ label: "التشغيل دون اتصال", value: offlineReady ? "جاهز" : "غير جاهز" },
	]
}

/**
 * Whether the status row is worth showing.
 *
 * A row is worth showing when at least one signal has actually reported —
 * `null`/`undefined` mean "not measured yet", and a bar claiming readiness
 * from four unknown signals is the confident-empty problem AGENTS.md warns
 * about.
 *
 * @param {Record<string, unknown>} signals
 * @returns {boolean}
 */
export function hasRuntimeStatus(signals) {
	return Object.values(signals).some(
		(value) => value !== undefined && value !== null,
	)
}

export default useRuntimeStatus
