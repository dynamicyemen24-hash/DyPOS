/**
 * Windowing / virtualization primitives for large POS catalogs.
 *
 * Renders only the slice of a list that fits the viewport (plus overscan),
 * instead of mounting thousands of DOM nodes — the difference between a
 * laggy 20k-item grid and a fluid one on low-end terminal hardware.
 *
 * Pure part (testable, framework-free):
 *   computeWindow({ scrollTop, viewportHeight, total, itemHeight, overscan })
 *
 * Reactive part (for components):
 *   const list = useWindowedList({ total, itemHeight, containerRef, overscan });
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue"

// ---------------------------------------------------------------------------
// Pure window math
// ---------------------------------------------------------------------------

/**
 * Compute the visible slice of a fixed-height scrolling list.
 * @param {Object} opts
 * @param {number} opts.scrollTop
 * @param {number} opts.viewportHeight
 * @param {number} opts.total - Total row count.
 * @param {number} opts.itemHeight - Fixed row height (px).
 * @param {number} [opts.overscan] - Extra rows rendered above/below the fold.
 * @returns {{ startIndex: number, endIndex: number, offsetTop: number, totalHeight: number }}
 */
export function computeWindow({
	scrollTop = 0,
	viewportHeight = 0,
	total = 0,
	itemHeight = 48,
	overscan = 5,
}) {
	if (total <= 0 || itemHeight <= 0) {
		return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 }
	}

	const safeOverscan = Math.max(0, Math.floor(overscan))
	const totalHeight = total * itemHeight

	let startIndex = Math.floor(scrollTop / itemHeight) - safeOverscan
	let endIndex =
		Math.ceil((scrollTop + viewportHeight) / itemHeight) + safeOverscan

	startIndex = Math.max(0, startIndex)
	endIndex = Math.min(total, Math.max(startIndex + 1, endIndex))
	// Guard against scrollTop beyond the (possibly shrunk) content height:
	// never render an empty window when the item count drops while scrolled.
	startIndex = Math.max(0, Math.min(startIndex, Math.max(0, endIndex - 1)))

	return {
		startIndex,
		endIndex,
		offsetTop: startIndex * itemHeight,
		totalHeight,
		visibleCount: endIndex - startIndex,
	}
}

// ---------------------------------------------------------------------------
// Reactive composable
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {import('vue').Ref<number>} opts.total - Reactive total row count.
 * @param {number} [opts.itemHeight]
 * @param {import('vue').Ref<HTMLElement|null>} [opts.containerRef] - Scroll container.
 * @param {number} [opts.overscan]
 * @returns {{
 *   startIndex: import('vue').Ref<number>,
 *   endIndex: import('vue').Ref<number>,
 *   offsetTop: import('vue').Ref<number>,
 *   totalHeight: import('vue').Ref<number>,
 *   visibleCount: import('vue').Ref<number>,
 *   onContainerScroll: Function,
 *   refresh: Function,
 *   stop: Function,
 * }}
 */
export function useWindowedList({
	total,
	itemHeight = 48,
	containerRef = null,
	overscan = 5,
}) {
	const scrollTop = ref(0)
	const viewportHeight = ref(0)

	let scrollListener = null
	let resizeObserver = null

	// Keep the viewport height in sync with the container (responsive layout,
	// keyboard on terminal tablets, window resizes...).
	function bindContainer() {
		if (!containerRef?.value) return

		const el = containerRef.value
		const measure = () => {
			viewportHeight.value = el.clientHeight || el.offsetHeight || 0
		}
		measure()

		// Scroll position is read from the element directly for correctness
		// (scrollable elements do not track window scroll events).
		scrollListener = () => {
			scrollTop.value = el.scrollTop || 0
		}
		el.addEventListener("scroll", scrollListener, { passive: true })

		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(measure)
			resizeObserver.observe(el)
		} else {
			scrollListener()
		}
	}

	function refresh() {
		bindContainer()
	}

	const totalValue = typeof total === "function" ? computed(total) : total

	const window = computed(() =>
		computeWindow({
			scrollTop: scrollTop.value,
			viewportHeight: viewportHeight.value,
			total: totalValue?.value ?? totalValue ?? 0,
			itemHeight,
			overscan,
		}),
	)

	const startIndex = computed(() => window.value.startIndex)
	const endIndex = computed(() => window.value.endIndex)
	const offsetTop = computed(() => window.value.offsetTop)
	const totalHeight = computed(() => window.value.totalHeight)
	const visibleCount = computed(() => window.value.visibleCount)

	// Attach when the container mounts (may be null on first render).
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
		startIndex,
		endIndex,
		offsetTop,
		totalHeight,
		visibleCount,
		onContainerScroll: (event) => {
			scrollTop.value = event?.target?.scrollTop || 0
		},
		refresh,
		stop,
	}
}
