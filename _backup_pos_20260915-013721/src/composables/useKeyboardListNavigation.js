/**
 * =============================================================================
 * DyPOS — Enterprise Keyboard List Navigation
 * =============================================================================
 *
 * طبقة تنقل موحدة عالية الاعتمادية لقوائم POS:
 *
 * - نتائج البحث
 * - شبكة المنتجات
 * - اختيار العملاء
 * - النوافذ والقوائم المنبثقة
 * - قوائم الفواتير
 * - القسائم والعروض
 * - أي قائمة خطية أو Grid
 *
 * المعايير:
 * - RTL-first / Arabic-first
 * - Keyboard-first
 * - POS-safe
 * - Accessibility-ready
 * - Dynamic collections
 * - Disabled items
 * - Grid-aware navigation
 * - Page navigation
 * - Scroll synchronization
 * - Mouse / keyboard synchronization
 * - Composition/input protection
 * - Reduced assumptions
 *
 * ملاحظة:
 * هذا الـ composable لا يفرض DOM structure معينًا.
 * المكوّن المستهلك هو المسؤول عن aria-activedescendant / refs / rendering.
 * =============================================================================
 */

import { computed, isRef, ref, watch } from "vue"

/**
 * @typedef {Object} KeyboardNavigationOptions
 * @property {number|Function|import("vue").Ref<number>} [count=0]
 * @property {number|Function|import("vue").Ref<number>} [columns=1]
 * @property {boolean|import("vue").Ref<boolean>} [enabled=true]
 * @property {"rtl"|"ltr"|import("vue").Ref<string>} [dir="rtl"]
 * @property {boolean} [wrap=true]
 * @property {boolean} [wrapHorizontal=true]
 * @property {boolean} [wrapVertical=true]
 * @property {boolean} [skipDisabled=true]
 * @property {Function} [isDisabled]
 * @property {Function} [onSelect]
 * @property {Function} [onEscape]
 * @property {Function} [onNavigate]
 * @property {Function} [onActiveChange]
 * @property {Function} [scrollIntoView]
 * @property {number|Function|import("vue").Ref<number>} [pageSize]
 * @property {boolean} [preventDefault=true]
 * @property {boolean} [stopPropagation=false]
 * @property {boolean} [ignoreInputs=true]
 * @property {boolean} [ignoreContentEditable=true]
 * @property {boolean} [homeToFirst=true]
 * @property {boolean} [endToLast=true]
 */

/**
 * @param {KeyboardNavigationOptions} options
 */
export function useKeyboardListNavigation({
	count = 0,
	columns = 1,
	enabled = true,
	dir = "rtl",

	wrap = true,
	wrapHorizontal = true,
	wrapVertical = true,

	skipDisabled = true,
	isDisabled,

	onSelect,
	onEscape,
	onNavigate,
	onActiveChange,
	scrollIntoView,

	pageSize = 10,

	preventDefault = true,
	stopPropagation = false,

	ignoreInputs = true,
	ignoreContentEditable = true,

	homeToFirst = true,
	endToLast = true,
} = {}) {
	const activeIndex = ref(-1)

	/**
	 * -------------------------------------------------------------------------
	 * Reactive normalization
	 * -------------------------------------------------------------------------
	 */

	const resolveValue = (source, fallback) => {
		if (typeof source === "function") {
			return source()
		}

		if (isRef(source)) {
			return source.value
		}

		return source ?? fallback
	}

	const countValue = computed(() => {
		const value = Number(resolveValue(count, 0))

		if (!Number.isFinite(value)) {
			return 0
		}

		return Math.max(0, Math.floor(value))
	})

	const columnsValue = computed(() => {
		const value = Number(resolveValue(columns, 1))

		if (!Number.isFinite(value)) {
			return 1
		}

		return Math.max(1, Math.floor(value))
	})

	const pageSizeValue = computed(() => {
		const value = Number(resolveValue(pageSize, 10))

		if (!Number.isFinite(value)) {
			return Math.max(columnsValue.value, 10)
		}

		return Math.max(columnsValue.value, Math.floor(value))
	})

	const isEnabled = computed(() => Boolean(resolveValue(enabled, true)))

	const isRTL = computed(() => {
		const value = resolveValue(dir, "rtl")

		return value === true || value === "rtl"
	})

	/**
	 * -------------------------------------------------------------------------
	 * Disabled item handling
	 * -------------------------------------------------------------------------
	 */

	function itemIsDisabled(index) {
		if (!skipDisabled) {
			return false
		}

		if (typeof isDisabled !== "function") {
			return false
		}

		return Boolean(isDisabled(index))
	}

	function hasSelectableItems() {
		for (let index = 0; index < countValue.value; index += 1) {
			if (!itemIsDisabled(index)) {
				return true
			}
		}

		return false
	}

	/**
	 * -------------------------------------------------------------------------
	 * Index helpers
	 * -------------------------------------------------------------------------
	 */

	function normalizeIndex(index) {
		if (countValue.value <= 0) {
			return -1
		}

		const numeric = Number(index)

		if (!Number.isFinite(numeric)) {
			return -1
		}

		return Math.min(countValue.value - 1, Math.max(0, Math.floor(numeric)))
	}

	function wrapIndex(index) {
		const total = countValue.value

		if (total <= 0) {
			return -1
		}

		if (index < 0) {
			return ((index % total) + total) % total
		}

		return index % total
	}

	function clampIndex(index) {
		return normalizeIndex(index)
	}

	function findSelectableForward(startIndex, direction = 1) {
		const total = countValue.value

		if (total <= 0) {
			return -1
		}

		let index = startIndex

		for (let step = 0; step < total; step += 1) {
			if (index >= 0 && index < total && !itemIsDisabled(index)) {
				return index
			}

			index += direction

			if (wrap) {
				index = wrapIndex(index)
			} else if (index < 0 || index >= total) {
				return -1
			}
		}

		return -1
	}

	function firstSelectable() {
		return findSelectableForward(0, 1)
	}

	function lastSelectable() {
		return findSelectableForward(countValue.value - 1, -1)
	}

	/**
	 * -------------------------------------------------------------------------
	 * Active state
	 * -------------------------------------------------------------------------
	 */

	function setActiveIndex(
		index,
		{ source = "programmatic", scroll = true, emit = true } = {},
	) {
		const previous = activeIndex.value

		if (countValue.value <= 0) {
			activeIndex.value = -1
			return -1
		}

		let next = normalizeIndex(index)

		if (skipDisabled && itemIsDisabled(next)) {
			const direction = next >= previous ? 1 : -1

			next = findSelectableForward(next, direction)

			if (next === -1) {
				return activeIndex.value
			}
		}

		activeIndex.value = next

		if (emit && previous !== next) {
			onActiveChange?.(next, previous, {
				source,
				event: null,
			})
		}

		if (scroll && next >= 0) {
			scrollIntoView?.(next, {
				behavior: "auto",
				block: "nearest",
				inline: "nearest",
				source,
			})
		}

		return next
	}

	/**
	 * -------------------------------------------------------------------------
	 * Movement
	 * -------------------------------------------------------------------------
	 */

	function moveLinear(delta, { source = "keyboard", event = null } = {}) {
		const total = countValue.value

		if (total <= 0) {
			activeIndex.value = -1
			return -1
		}

		let current = activeIndex.value

		if (current < 0) {
			current = delta < 0 ? lastSelectable() : firstSelectable()

			if (current >= 0) {
				setActiveIndex(current, {
					source,
					scroll: true,
				})
			}

			return current
		}

		let target = current + delta

		if (wrap) {
			target = wrapIndex(target)
		} else {
			target = clampIndex(target)
		}

		const direction = delta >= 0 ? 1 : -1

		if (skipDisabled && itemIsDisabled(target)) {
			const selectable = findSelectableForward(target, direction)

			if (selectable === -1) {
				return current
			}

			target = selectable
		}

		return setActiveIndex(target, {
			source,
			scroll: true,
		})
	}

	/**
	 * Grid movement.
	 *
	 * RTL changes only horizontal semantic direction.
	 * Vertical movement remains physically vertical.
	 */
	function moveGrid(deltaRow, deltaColumn, { source = "keyboard" } = {}) {
		const total = countValue.value
		const cols = columnsValue.value

		if (total <= 0) {
			activeIndex.value = -1
			return -1
		}

		if (activeIndex.value < 0) {
			return setActiveIndex(
				deltaRow < 0 ? lastSelectable() : firstSelectable(),
				{
					source,
					scroll: true,
				},
			)
		}

		const current = activeIndex.value

		const row = Math.floor(current / cols)
		const column = current % cols

		let nextRow = row + deltaRow
		let nextColumn = column + deltaColumn

		/**
		 * Horizontal wrapping is intentionally independent
		 * from vertical wrapping.
		 */
		if (deltaColumn !== 0 && deltaRow === 0) {
			if (nextColumn < 0 || nextColumn >= cols) {
				if (wrapHorizontal) {
					nextColumn = wrapIndex(nextColumn)
				} else {
					return current
				}
			}
		}

		/**
		 * Vertical movement.
		 */
		if (deltaRow !== 0) {
			const totalRows = Math.ceil(total / cols)

			if (nextRow < 0 || nextRow >= totalRows) {
				if (wrapVertical) {
					nextRow = wrapIndex(nextRow)
				} else {
					return current
				}
			}

			const candidate = nextRow * cols + nextColumn

			/**
			 * Last row may not be complete.
			 * If target column does not exist, clamp to the last
			 * available item in that row.
			 */
			if (candidate >= total) {
				const lastRowStart = nextRow * cols
				const lastRowEnd = Math.min(lastRowStart + cols - 1, total - 1)

				nextColumn = Math.max(0, lastRowEnd - lastRowStart)
			}
		}

		let target = nextRow * cols + nextColumn

		if (target < 0 || target >= total) {
			return current
		}

		/**
		 * Skip disabled cells without allowing navigation
		 * to silently jump across unrelated rows indefinitely.
		 */
		if (skipDisabled && itemIsDisabled(target)) {
			const direction =
				deltaColumn !== 0 ? Math.sign(deltaColumn) : Math.sign(deltaRow) * cols

			const selectable = findSelectableGrid(target, direction || 1)

			if (selectable === -1) {
				return current
			}

			target = selectable
		}

		return setActiveIndex(target, {
			source,
			scroll: true,
		})
	}

	function findSelectableGrid(start, direction) {
		const total = countValue.value

		if (total <= 0) {
			return -1
		}

		let index = start

		for (let step = 0; step < total; step += 1) {
			if (index >= 0 && index < total && !itemIsDisabled(index)) {
				return index
			}

			index += direction

			if (wrap) {
				index = wrapIndex(index)
			} else if (index < 0 || index >= total) {
				return -1
			}
		}

		return -1
	}

	function move(delta, options = {}) {
		if (columnsValue.value <= 1) {
			return moveLinear(delta, options)
		}

		return moveGrid(delta, 0, options)
	}

	/**
	 * -------------------------------------------------------------------------
	 * Page navigation
	 * -------------------------------------------------------------------------
	 */

	function movePage(direction, { source = "keyboard" } = {}) {
		const total = countValue.value

		if (total <= 0) {
			return -1
		}

		const current =
			activeIndex.value >= 0 ? activeIndex.value : direction > 0 ? 0 : total - 1

		const step =
			columnsValue.value > 1
				? Math.max(
						columnsValue.value,
						Math.floor(pageSizeValue.value / columnsValue.value) *
							columnsValue.value,
					)
				: pageSizeValue.value

		let target = current + direction * step

		if (wrap) {
			target = wrapIndex(target)
		} else {
			target = clampIndex(target)
		}

		if (skipDisabled && itemIsDisabled(target)) {
			const selectable = findSelectableForward(target, direction)

			if (selectable === -1) {
				return activeIndex.value
			}

			target = selectable
		}

		return setActiveIndex(target, {
			source,
			scroll: true,
		})
	}

	/**
	 * -------------------------------------------------------------------------
	 * First / last
	 * -------------------------------------------------------------------------
	 */

	function moveFirst({ source = "keyboard" } = {}) {
		const target = firstSelectable()

		return setActiveIndex(target, {
			source,
			scroll: true,
		})
	}

	function moveLast({ source = "keyboard" } = {}) {
		const target = lastSelectable()

		return setActiveIndex(target, {
			source,
			scroll: true,
		})
	}

	/**
	 * -------------------------------------------------------------------------
	 * Keyboard target protection
	 * -------------------------------------------------------------------------
	 */

	function shouldIgnoreKeyboardEvent(event) {
		if (!event) {
			return false
		}

		if (event.isComposing) {
			return true
		}

		const target = event.target

		if (!target) {
			return false
		}

		if (ignoreContentEditable && target.isContentEditable) {
			return true
		}

		if (!ignoreInputs) {
			return false
		}

		const tagName = target.tagName?.toLowerCase()

		if (tagName === "input" || tagName === "textarea" || tagName === "select") {
			return true
		}

		return false
	}

	/**
	 * -------------------------------------------------------------------------
	 * Keyboard handler
	 * -------------------------------------------------------------------------
	 */

	function handleKeydown(event) {
		if (!isEnabled.value) {
			return false
		}

		if (shouldIgnoreKeyboardEvent(event)) {
			return false
		}

		if (!hasSelectableItems()) {
			return false
		}

		let handled = false
		let next = activeIndex.value

		switch (event.key) {
			case "ArrowDown": {
				next =
					columnsValue.value > 1
						? moveGrid(1, 0, {
								source: "keyboard-arrow-down",
							})
						: moveLinear(1, {
								source: "keyboard-arrow-down",
								event,
							})

				handled = true
				break
			}

			case "ArrowUp": {
				next =
					columnsValue.value > 1
						? moveGrid(-1, 0, {
								source: "keyboard-arrow-up",
							})
						: moveLinear(-1, {
								source: "keyboard-arrow-up",
								event,
							})

				handled = true
				break
			}

			case "ArrowRight": {
				const delta = isRTL.value ? -1 : 1

				next =
					columnsValue.value > 1
						? moveGrid(0, delta, {
								source: "keyboard-arrow-right",
							})
						: moveLinear(delta, {
								source: "keyboard-arrow-right",
								event,
							})

				handled = true
				break
			}

			case "ArrowLeft": {
				const delta = isRTL.value ? 1 : -1

				next =
					columnsValue.value > 1
						? moveGrid(0, delta, {
								source: "keyboard-arrow-left",
							})
						: moveLinear(delta, {
								source: "keyboard-arrow-left",
								event,
							})

				handled = true
				break
			}

			case "Home": {
				if (!homeToFirst) {
					return false
				}

				next = moveFirst({
					source: "keyboard-home",
				})

				handled = true
				break
			}

			case "End": {
				if (!endToLast) {
					return false
				}

				next = moveLast({
					source: "keyboard-end",
				})

				handled = true
				break
			}

			case "PageDown": {
				next = movePage(1, {
					source: "keyboard-page-down",
				})

				handled = true
				break
			}

			case "PageUp": {
				next = movePage(-1, {
					source: "keyboard-page-up",
				})

				handled = true
				break
			}

			case "Enter": {
				if (
					activeIndex.value >= 0 &&
					activeIndex.value < countValue.value &&
					!itemIsDisabled(activeIndex.value)
				) {
					event.preventDefault()

					onSelect?.(activeIndex.value, event)

					onNavigate?.({
						type: "select",
						index: activeIndex.value,
						event,
					})

					return true
				}

				return false
			}

			case "Escape": {
				if (activeIndex.value !== -1) {
					reset({
						source: "keyboard-escape",
					})

					handled = true
				}

				onEscape?.(event)

				onNavigate?.({
					type: "escape",
					index: -1,
					event,
				})

				break
			}

			default:
				return false
		}

		if (handled) {
			if (preventDefault) {
				event.preventDefault()
			}

			if (stopPropagation) {
				event.stopPropagation()
			}

			onNavigate?.({
				type: "move",
				index: next,
				previousIndex: activeIndex.value,
				key: event.key,
				event,
			})

			return true
		}

		return false
	}

	/**
	 * -------------------------------------------------------------------------
	 * Pointer interaction
	 * -------------------------------------------------------------------------
	 */

	function handlePointerEnter(index) {
		if (!isEnabled.value) {
			return
		}

		const normalized = normalizeIndex(index)

		if (normalized < 0 || (skipDisabled && itemIsDisabled(normalized))) {
			return
		}

		setActiveIndex(normalized, {
			source: "pointer-enter",
			scroll: false,
		})
	}

	function handleClick(index, event = null) {
		if (!isEnabled.value) {
			return false
		}

		const normalized = normalizeIndex(index)

		if (normalized < 0 || (skipDisabled && itemIsDisabled(normalized))) {
			return false
		}

		setActiveIndex(normalized, {
			source: "pointer-click",
			scroll: false,
		})

		onSelect?.(normalized, event)

		onNavigate?.({
			type: "select",
			index: normalized,
			event,
			source: "pointer",
		})

		return true
	}

	/**
	 * -------------------------------------------------------------------------
	 * Public state controls
	 * -------------------------------------------------------------------------
	 */

	function moveTo(index, options = {}) {
		return setActiveIndex(index, {
			source: "programmatic",
			...options,
		})
	}

	function reset({ source = "reset", emit = true } = {}) {
		const previous = activeIndex.value

		activeIndex.value = -1

		if (emit && previous !== -1) {
			onActiveChange?.(-1, previous, {
				source,
				event: null,
			})
		}
	}

	function selectActive(event = null) {
		const index = activeIndex.value

		if (index < 0 || index >= countValue.value || itemIsDisabled(index)) {
			return false
		}

		onSelect?.(index, event)

		onNavigate?.({
			type: "select",
			index,
			event,
			source: "programmatic",
		})

		return true
	}

	function isActive(index) {
		return activeIndex.value === index
	}

	function isSelectable(index) {
		const normalized = normalizeIndex(index)

		return (
			normalized >= 0 &&
			normalized < countValue.value &&
			!itemIsDisabled(normalized)
		)
	}

	/**
	 * -------------------------------------------------------------------------
	 * Dynamic collection safety
	 * -------------------------------------------------------------------------
	 *
	 * POS searches can change while:
	 * - API requests are pending
	 * - products are filtered
	 * - stock changes
	 * - barcode scans occur
	 * - cart state updates
	 *
	 * Never leave activeIndex pointing to a removed row.
	 */
	watch(
		countValue,
		(nextCount) => {
			if (nextCount <= 0) {
				reset({
					source: "collection-empty",
				})

				return
			}

			if (activeIndex.value >= nextCount) {
				const fallback = skipDisabled ? lastSelectable() : nextCount - 1

				setActiveIndex(fallback, {
					source: "collection-resized",
					scroll: false,
				})
			} else if (
				activeIndex.value >= 0 &&
				skipDisabled &&
				itemIsDisabled(activeIndex.value)
			) {
				const fallback = findSelectableForward(activeIndex.value, 1)

				if (fallback !== -1) {
					setActiveIndex(fallback, {
						source: "active-item-disabled",
						scroll: false,
					})
				} else {
					reset({
						source: "no-selectable-items",
					})
				}
			}
		},
		{
			immediate: true,
		},
	)

	/**
	 * -------------------------------------------------------------------------
	 * Accessibility helpers
	 * -------------------------------------------------------------------------
	 */

	const hasActiveItem = computed(
		() => activeIndex.value >= 0 && activeIndex.value < countValue.value,
	)

	const activeDescendantIndex = computed(() =>
		hasActiveItem.value ? activeIndex.value : null,
	)

	const navigationState = computed(() => ({
		index: activeIndex.value,
		count: countValue.value,
		columns: columnsValue.value,
		hasActiveItem: hasActiveItem.value,
		rtl: isRTL.value,
		enabled: isEnabled.value,
	}))

	/**
	 * -------------------------------------------------------------------------
	 * Public API
	 * -------------------------------------------------------------------------
	 */

	return {
		// State
		activeIndex,
		activeDescendantIndex,
		countValue,
		columnsValue,
		pageSizeValue,
		isEnabled,
		isRTL,
		hasActiveItem,
		navigationState,

		// Queries
		isActive,
		isSelectable,
		itemIsDisabled,
		hasSelectableItems,

		// Keyboard
		handleKeydown,

		// Pointer
		handlePointerEnter,
		handleClick,

		// Movement
		move,
		moveLinear,
		moveGrid,
		movePage,
		moveFirst,
		moveLast,
		moveTo,

		// Selection
		selectActive,

		// State
		reset,
	}
}
