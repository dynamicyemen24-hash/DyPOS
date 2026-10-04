/**
 * Sale status — the Arabic sentence for the connection state under the till.
 *
 * ## Why this moved out of `POSSale.vue`
 *
 * `POSSale.vue` is under the tightest file-size cap in the tree, and mounting
 * the ops panel plus the button unification pushed it over. The ratchet's
 * answer is "extract the behaviour", not "raise the number".
 *
 * ## The chain was four branches, and one of them was a lie
 *
 * `v-if ready / v-else-if syncing / v-else-if offline / v-else "توجد مشكلة"`
 * meant the connection watcher had to be trusted to produce exactly one of
 * three strings. Any fourth value — and the page already writes `error` — fell
 * into the `else` and told the cashier "there is a connection problem", which
 * is a claim the code had not earned. The mapping is now a TABLE: an unknown
 * state resolves through `unknown` explicitly rather than by falling off the
 * end of a chain.
 */
import { computed } from "vue"

/** Every state the page can put the till into. */
export const SALE_STATES = Object.freeze([
	"ready",
	"syncing",
	"offline",
	"error",
	"unknown",
])

/** state → Arabic text. `unknown` is a real answer, not a catch-all. */
const SALE_STATE_TEXT = Object.freeze({
	ready: "جاهز للبيع",
	syncing: "جاري مزامنة العملية...",
	offline: "وضع العمل دون اتصال",
	error: "توجد مشكلة في الاتصال",
	unknown: "حالة غير معروفة",
})

/**
 * Resolve a state to its Arabic label.
 *
 * @param {string} state
 * @returns {string} never empty — an unknown state says so rather than
 *   falling through to a message the code did not verify.
 */
export function saleStateLabel(state) {
	return SALE_STATE_TEXT[state] || SALE_STATE_TEXT.unknown
}

/**
 * Reactive label for the sale page's status line.
 *
 * @param {import("vue").Ref<string>} state
 * @returns {import("vue").ComputedRef<string>}
 */
export function useSaleStatusLabel(state) {
	return computed(() => saleStateLabel(state.value))
}

export default useSaleStatusLabel
