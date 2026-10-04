/**
 * Barcode-scanner state for the sale page.
 *
 * ## Why this is extracted
 *
 * The open/close logic lived inline in `POSSale.vue` and pushed the file 62
 * lines past its ratchet cap. The ratchet's rule is extract, then lower the
 * number in the same commit — so the reasoning travels with the code.
 *
 * ## What this replaces — three dead contracts, none of them visible to a test
 *
 *   1. `scanBarcode()` read `this.$root.$emit("start-scan")` inside a
 *      `<script setup>` script, where `this` is `undefined`. Tapping the
 *      control threw `TypeError: Cannot read properties of undefined (reading
 *      '$root')` and the camera never opened. Nothing mounted the branch, so
 *      all 2133 POS tests stayed green.
 *   2. Nothing anywhere LISTENED to `start-scan` — not the scanner, not the
 *      root. A button that renders and does nothing.
 *   3. The search bar rendered only the scanner's STOP control, so even a
 *      working `scanBarcode` had no caller and the whole barcode feature was
 *      unreachable.
 *
 * The scanner starts itself on mount and exposes `startScan()` through the
 * template ref, so this drives a real object instead of a phantom event, and
 * `scanning` is released either when a code arrives or when the scanner reports
 * that it cannot open — never left hanging on an event nobody receives.
 */
import { nextTick, ref } from "vue"

import { getPopularityBoost } from "@/utils/posSalePure"
import { resolveScanIntent } from "@/utils/smartSearch"

/** Terminal states: the scanner will never produce a code from these. */
const DEAD_ENDS = new Set(["unsupported", "denied"])

export function useBarcodeScanner({ notify } = {}) {
	const scanning = ref(false)
	const showScanner = ref(false)
	/** Template ref for `<BarcodeScanner ref="barcodeScanner">`. */
	const barcodeScanner = ref(null)

	async function open() {
		if (scanning.value) return
		scanning.value = true
		showScanner.value = true

		// The component renders on `showScanner`, so let Vue bind the ref.
		await nextTick()

		const scanner = barcodeScanner.value
		if (!scanner) {
			// Missing ref (conditional render): release the flag rather than
			// leaving the cashier with a spinner that never resolves.
			scanning.value = false
			return
		}

		const outcome = await scanner.startScan()
		if (DEAD_ENDS.has(outcome)) {
			showScanner.value = false
			scanning.value = false
			notify?.(
				"تعذّر تشغيل ماسح الباركود — اكتب الباركود في خانة البحث",
				"warning",
			)
		}
	}

	function close() {
		showScanner.value = false
		scanning.value = false
		barcodeScanner.value?.stopScan?.()
	}

	/** A code arrived: the scan is over, whatever happens to the lookup next. */
	function onRead() {
		scanning.value = false
	}

	/**
	 * المسح/الكتابة السريعة: Enter في حقل البحث = «أضف الآن».
	 *
	 * Moved verbatim from `pages/POSSale.vue` (file-size ratchet): the page
	 * owned scan-submit beside scan open/close, and the three belong to one
	 * owner. Dependencies ride IN so the composable stays UI-free and the
	 * page keeps its refs.
	 *
	 * @param {object} deps
	 * @param {object} deps.index product search index
	 * @param {string} deps.query current search text
	 * @param {Map} deps.boosts popularity boosts
	 * @param {(product:object)=>void} deps.addProduct cart adder
	 * @param {()=>void} deps.clearQuery empties the search field
	 * @param {()=>void} deps.resetActiveIndex clears grid highlight
	 * @param {()=>void} deps.focusSearch returns focus to search
	 * @param {(message:string,kind:string)=>void} deps.tell sale toast
	 * @returns {boolean} true when a product was added
	 */
	function submitScan({
		index,
		query,
		boosts,
		addProduct,
		clearQuery,
		resetActiveIndex,
		focusSearch,
		tell,
	}) {
		const intent = resolveScanIntent(index, query, {
			minLength: 3,
			popularity: (product) => getPopularityBoost(boosts, product),
		})

		if (intent.action === "add" && intent.product) {
			addProduct(intent.product)
			clearQuery()
			resetActiveIndex()

			const reasonLabel =
				intent.reason === "barcode"
					? "مسح باركود"
					: intent.reason === "code"
						? "رمز صنف"
						: "إضافة سريعة"

			tell?.(`${reasonLabel}: أُضيف «${intent.product.name}»`, "success")

			nextTick(() => {
				focusSearch?.()
			})

			return true
		}

		if (intent.action === "empty" && String(query || "").trim()) {
			tell?.("لا يوجد منتج مطابق — تحقق من الرمز", "warning")
		}
		return false
	}

	return {
		scanning,
		showScanner,
		barcodeScanner,
		open,
		close,
		onRead,
		submitScan,
	}
}

export default useBarcodeScanner
