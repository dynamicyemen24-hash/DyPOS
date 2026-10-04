/**
 * Sale-customer state for the sale page.
 *
 * ## Why this is extracted
 *
 * The customer block (select/search/clear + the pinned-account policy) lived
 * inline in `POSSale.vue` and pushed the file past its ratchet cap. The
 * ratchet's rule is extract, then lower the number in the same commit.
 *
 * ## What moved (verbatim behaviour)
 *
 * `selectCustomer`, `handleCustomerSearch`, the `useDebouncedSearch` pipeline
 * and its watchers, `clearCustomer`, plus the pinned-account policy
 * (`isCustomerPinned` / `effectiveCustomer` / `applyCustomerPolicy`). Nothing
 * was "improved": a customer that resolves differently after a refactor is
 * a sale booked on the wrong account.
 *
 * ## Why the dependencies are injected
 *
 * The page owns its refs; this module owns the rules. `settings` is a pair
 * of getter functions (not the store) so tests exercise the policy without
 * Pinia, and `notify`/`logError` keep UI and logging at the page edge.
 */
import { computed, watch } from "vue"

import { useDebouncedSearch } from "@/composables/useDebouncedSearch"
import { resolveSaleCustomer } from "@/utils/posSalePure"
import { searchCachedCustomers } from "@/utils/offline/cache.js"

/**
 * @param {object} deps
 * @param {import("vue").Ref<object|null>} deps.customer page customer ref
 * @param {import("vue").Ref<Array>} deps.customerOptions page options ref
 * @param {import("vue").Ref<boolean>} deps.customerSearchLoading page flag
 * @param {import("vue").Ref<boolean>} deps.showCustomerPanel page panel flag
 * @param {() => string} deps.getCustomerMode settings: "variable" | "pinned"
 * @param {() => string} deps.getPinnedCustomer settings: fixed account name
 * @param {(message:string,kind:string)=>void} [deps.notify]
 * @param {(message:string,error:unknown)=>void} [deps.logError]
 */
export function useSaleCustomer({
	customer,
	customerOptions,
	customerSearchLoading,
	showCustomerPanel,
	getCustomerMode,
	getPinnedCustomer,
	notify = null,
	logError = null,
}) {
	const tell = (message, kind) => {
		try {
			notify?.(message, kind)
		} catch {
			// A toast must never break customer selection.
		}
	}

	function selectCustomer(selectedValue) {
		// الحساب المثبت من الإعدادات لا يُبدَّل من الشاشة — التبديل تسرب
		// لفاتورة واحدة على حساب آخر، وهو بالضبط ما وُجد التثبيت لمنعه.
		if (isCustomerPinned.value) {
			tell("الحساب مثبت من الإعدادات — غيّره من هناك", "warning")
			showCustomerPanel.value = false
			return
		}
		if (!selectedValue) {
			customer.value = null
			showCustomerPanel.value = false
			return
		}
		const match = customerOptions.value.find(
			(option) => option.value === selectedValue,
		)

		customer.value = match
			? {
					id: match?.id ?? selectedValue,
					name: match?.name ?? match?.label ?? selectedValue,
					customer_name: match?.customer_name ?? match?.label ?? selectedValue,
				}
			: null

		showCustomerPanel.value = false
	}

	async function handleCustomerSearch(query) {
		// Debounced + stale-guarded via useDebouncedSearch: rapid keystrokes
		// collapse into one IndexedDB lookup and late responses never overwrite
		// newer ones. Empty query (panel open) runs immediately, no debounce lag.
		if (!String(query || "").trim()) {
			await customerSearch.runImmediate(query)
			return
		}
		customerSearch.setQuery(query)
	}

	// Single professional search pipeline for the customer dialog.
	const customerSearch = useDebouncedSearch(
		async (query) => searchCachedCustomers(query, 100),
		{ delay: 250 },
	)

	watch(customerSearch.results, (rows) => {
		customerOptions.value = (rows || []).map((c) => ({
			value: c.name ?? c.customer_name,
			id: c.name,
			label: c.customer_name || c.name,
			name: c.customer_name || c.name,
			customer_name: c.customer_name || c.name,
			subtitle: c.mobile_no || "",
		}))
	})

	watch(customerSearch.isSearching, (searching) => {
		customerSearchLoading.value = searching
	})

	watch(customerSearch.error, (error) => {
		if (!error) return
		try {
			logError?.("DyPOS customer search failed", error)
		} catch {
			// Logging must never break the search box.
		}
		customerOptions.value = []
	})

	watch(showCustomerPanel, (isOpen) => {
		if (isOpen) {
			handleCustomerSearch("")
		}
	})

	function clearCustomer() {
		if (isCustomerPinned.value) {
			applyCustomerPolicy()
			return
		}
		customer.value = null
	}

	/* ========================================================================
	 * Customer account policy — حساب متغير أو مثبت من الإعدادات
	 *
	 * variable (الافتراضي): الكاشير يختار العميل لكل عملية (السلوك الحالي).
	 * pinned: كل عملية تُقيَّد على الحساب المثبت؛ التحديد اليدوي مرفوض
	 * بتنبيه، والفواتير المركونة تُستعاد كما رُكنت (عميلها جزء من الحالة).
	 * ====================================================================== */
	const isCustomerPinned = computed(() => getCustomerMode() === "pinned")

	const effectiveCustomer = computed(() =>
		resolveSaleCustomer({
			mode: getCustomerMode(),
			pinned: getPinnedCustomer(),
			selected: customer.value,
		}),
	)

	function applyCustomerPolicy() {
		if (!isCustomerPinned.value) return
		const pinned = resolveSaleCustomer({
			mode: "pinned",
			pinned: getPinnedCustomer(),
			selected: null,
		})
		customer.value = { id: pinned.id, name: pinned.name }
	}

	watch(isCustomerPinned, (pinned) => {
		if (pinned) applyCustomerPolicy()
	})

	return {
		selectCustomer,
		clearCustomer,
		handleCustomerSearch,
		isCustomerPinned,
		effectiveCustomer,
		applyCustomerPolicy,
	}
}

export default useSaleCustomer
