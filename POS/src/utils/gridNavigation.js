/**
 * Product-grid keyboard navigation — pure index math, RTL-aware.
 *
 * Extracted from `pages/POSSale.vue`: the handler there mixed index arithmetic
 * (the only part worth reasoning about, and the part with a real off-by-one
 * risk at the row edges) with DOM reads. Keeping the arithmetic here makes it
 * unit-testable — `POS/tests/gridNavigation.test.js` covers every edge — and
 * keeps the page file under its ratchet cap.
 *
 * Contract:
 *   gridNextIndex("ArrowDown", 2, 10, { columns: 4, rtl: true }) === 6
 * Horizontal keys follow the VISUAL direction: in RTL, ArrowRight moves to the
 * previous item. Callers get `null` for keys this grid does not own.
 */

const HORIZONTAL = { ArrowLeft: -1, ArrowRight: 1 }

/**
 * @param {string} key - KeyboardEvent.key
 * @param {number} current - current selected index
 * @param {number} total - number of items
 * @param {{ columns?: number, rtl?: boolean }} [options]
 * @returns {number|null} the next index, or null when the key is not ours
 */
export function gridNextIndex(key, current, total, options = {}) {
	if (total <= 0) return null

	const { columns = 4, rtl = false } = options
	const last = total - 1
	const from = Number.isInteger(current)
		? Math.min(Math.max(current, 0), last)
		: 0

	if (key in HORIZONTAL) {
		// In RTL the visual "right" is the previous item.
		const step = rtl ? -HORIZONTAL[key] : HORIZONTAL[key]
		return Math.min(last, Math.max(0, from + step))
	}

	if (key === "ArrowDown") {
		return Math.min(last, from + columns)
	}

	if (key === "ArrowUp") {
		return Math.max(0, from - columns)
	}

	return null
}

/** True when the grid owns the key (navigation, not activation). */
export function isGridNavigationKey(key) {
	return key in HORIZONTAL || key === "ArrowUp" || key === "ArrowDown"
}

/**
 * The document direction, read once per keypress so a mid-session `dir`
 * change (language switch) cannot leave navigation mirrored.
 */
export function readDirectionRTL() {
	if (typeof document === "undefined") return true
	return (document.documentElement?.getAttribute?.("dir") || "rtl") === "rtl"
}
