/**
 * Windowing for product grids (2D) — the cashier's item catalog hot path.
 *
 * A 10k-row catalog would otherwise mount tens of thousands of <button>
 * nodes. This computes only the visible rows/columns, exactly like
 * useWindowedList but for a column grid (e.g. 4 products per row).
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue"

// ---------------------------------------------------------------------------
// Pure math (testable without Vue)
// ---------------------------------------------------------------------------

/**
 * Compute the visible slice of a fixed row-height product grid.
 * @param {Object} opts
 * @param {number} opts.scrollTop
 * @param {number} opts.viewportHeight
 * @param {number} opts.total - Total item count.
 * @param {number} opts.columns - Items per row.
 * @param {number} [opts.rowHeight] - Fixed row height (px).
 * @param {number} [opts.overscan] - Extra rows above/below the fold.
 * @returns {Object} { startRowIndex, endRowIndex, startIndex, endIndex, offsetTop, totalHeight, visibleCount }
 */
export function computeGridWindow({
	scrollTop = 0,
	viewportHeight = 0,
	total = 0,
	columns = 4,
	rowHeight = 96,
	overscan = 2,
}) {
	if (total <= 0 || columns <= 0 || rowHeight <= 0) {
		return {
			startRowIndex: 0,
			endRowIndex: 0,
			startIndex: 0,
			endIndex: 0,
			offsetTop: 0,
			totalHeight: 0,
			visibleCount: 0,
		}
	}

	const safeCols = Math.max(1, Math.floor(columns))
	const totalRows = Math.ceil(total / safeCols)
	const totalHeight = totalRows * rowHeight
	const safeOverscan = Math.max(0, Math.floor(overscan))

	let startRow = Math.floor(scrollTop / rowHeight) - safeOverscan
	let endRow =
		Math.ceil((scrollTop + viewportHeight) / rowHeight) + safeOverscan

	startRow = Math.max(0, startRow)
	endRow = Math.min(totalRows, Math.max(startRow + 1, endRow))
	// Guard against scrollTop beyond the (possibly shrunk) content height.
	startRow = Math.max(0, Math.min(startRow, Math.max(0, endRow - 1)))

	const startIndex = startRow * safeCols
	const endIndex = Math.min(total, endRow * safeCols)

	return {
		startRowIndex: startRow,
		endRowIndex: endRow,
		startIndex,
		endIndex,
		offsetTop: startRow * rowHeight,
		totalHeight,
		visibleCount: endIndex - startIndex,
	}
}

// ---------------------------------------------------------------------------
// Reactive composable
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {import('vue').Ref<number>} opts.total - Reactive item count.
 * @param {import('vue').Ref<HTMLElement|null>} [opts.containerRef] - Scroll container.
 * @param {number|import('vue').Ref<number>} [opts.columns]
 * @param {number} [opts.rowHeight]
 * @param {number} [opts.overscan]
 * @returns {Object} window state + refresh/stop
 */
export function useVirtualGrid({
	total,
	containerRef = null,
	columns = 4,
	rowHeight = 96,
	overscan = 2,
}) {
	const scrollTop = ref(0)
	const viewportHeight = ref(0)

	let scrollListener = null
	let resizeObserver = null

	const columnsValue = computed(() =>
		typeof columns === "object" && columns != null && "value" in columns
			? Math.max(1, Math.floor(columns.value))
			: Math.max(1, Math.floor(columns)),
	)

	const rowHeightValue = computed(() =>
		typeof rowHeight === "object" && rowHeight != null && "value" in rowHeight
			? Math.max(1, Math.floor(rowHeight.value) || 1)
			: Math.max(1, Math.floor(rowHeight) || 1),
	)

	function bindContainer() {
		if (!containerRef?.value) return
		const el = containerRef.value
		const measure = () => {
			viewportHeight.value = el.clientHeight || el.offsetHeight || 0
		}
		measure()
		scrollListener = () => {
			scrollTop.value = el.scrollTop || 0
		}
		el.addEventListener("scroll", scrollListener, { passive: true })
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(measure)
			resizeObserver.observe(el)
		}
	}

	function refresh() {
		bindContainer()
	}

	const window = computed(() =>
		computeGridWindow({
			scrollTop: scrollTop.value,
			viewportHeight: viewportHeight.value,
			total: total?.value ?? 0,
			columns: columnsValue.value,
			rowHeight: rowHeightValue.value,
			overscan,
		}),
	)

	const stopWatcher = watch(
		containerRef,
		(el) => {
			if (el) refresh()
		},
		{ immediate: true },
	)

	function stop() {
		stopWatcher()
		if (scrollListener && containerRef?.value) {
			containerRef.value.removeEventListener("scroll", scrollListener)
		}
		if (resizeObserver) {
			resizeObserver.disconnect()
			resizeObserver = null
		}
	}

	onMounted(refresh)
	onUnmounted(stop)

	return {
		startRowIndex: computed(() => window.value.startRowIndex),
		endRowIndex: computed(() => window.value.endRowIndex),
		startIndex: computed(() => window.value.startIndex),
		endIndex: computed(() => window.value.endIndex),
		offsetTop: computed(() => window.value.offsetTop),
		totalHeight: computed(() => window.value.totalHeight),
		visibleCount: computed(() => window.value.visibleCount),
		onContainerScroll: (event) => {
			scrollTop.value = event?.target?.scrollTop || 0
		},
		refresh,
		stop,
	}
}
