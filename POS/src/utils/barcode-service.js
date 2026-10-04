/**
 * Barcode lookup — local first, never a surprise network call.
 *
 * ## What this replaces
 *
 * The first version of this file imported `@/services/products`, which does not
 * exist, and carried mojibake in its comments. Nothing caught it because
 * nothing imported it — `tests/deadCode.test.js` counts reachability from
 * `main.js`, and the one import of it lived in a file the build never got far
 * enough to compile.
 *
 * So the lookup is expressed against the store that ACTUALLY owns product
 * search, and the page imports it directly — the only arrangement a
 * reachability walk can verify.
 *
 * ## Invariant 8 — offline first, and honest about "not found"
 *
 * The scan never fires a request on its own. A barcode that is not in the
 * local cache returns `found: false` rather than inventing a product or
 * calling the API the cashier did not ask for. A silent request here is how a
 * till quietly starts depending on the shop's wifi.
 */
import { useItemSearchStore } from "@/stores/itemSearch"

/**
 * @param {string} code barcode or SKU as read by the scanner
 * @returns {Promise<{found: boolean, product: object|null}>}
 */
export async function handleScan(code) {
	const trimmed = String(code ?? "").trim()
	if (!trimmed) return { found: false, product: null }

	const store = useItemSearchStore()

	// The store already keeps the cached list search reads from; duplicating
	// the match loop here is how two implementations of "find by code" drift.
	const match =
		(await store.searchByBarcode(trimmed)) ||
		store.items?.find?.(
			(item) =>
				item.barcode === trimmed ||
				item.sku === trimmed ||
				item.item_code === trimmed,
		) ||
		null

	return { found: Boolean(match), product: match || null }
}

export default handleScan
