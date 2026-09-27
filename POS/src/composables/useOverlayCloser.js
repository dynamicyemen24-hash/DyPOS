/**
 * Escape-key overlay closer — a priority stack of overlays.
 *
 * Extracted from `pages/POSSale.vue`, where the Escape branch had grown into an
 * inline cascade of six hard-coded `if (panel) { close(); return }` blocks: the
 * order lived only in that file, nothing could test it, and the page file kept
 * growing against its ratchet cap. The stack keeps the semantics identical:
 * Escape closes the FIRST entry (in declaration order) that is open, and the
 * caller still owns whether Escape is handled at all.
 *
 * Usage — a list of `[isOpen, close]` pairs, highest priority first:
 *
 *   const overlays = createOverlayCloser([
 *     [showShortcutsPanel, () => (showShortcutsPanel.value = false)],
 *     [() => Boolean(editor.value), closeEditor],
 *   ])
 *   overlays.closeFirstOpen() // true when Escape was handled
 *
 * `isOpen` accepts a ref (truthy while open) or a getter, so the module needs
 * no Vue import and stays trivially testable. Pure — no DOM, no lifecycle.
 */
function isOpenNow(entry) {
	const isOpen = entry[0]

	if (typeof isOpen === "function") return Boolean(isOpen())

	// A ref is "open" only while its value is truthy — a `null` ref is CLOSED.
	// (A `??` fallback here would read the ref object itself and report every
	// null ref as open.)
	if (isOpen && typeof isOpen === "object" && "value" in isOpen) {
		return Boolean(isOpen.value)
	}

	return Boolean(isOpen)
}

export function createOverlayCloser(entries = []) {
	const stack = [...entries]

	/**
	 * Register an overlay entry at runtime.
	 * @param {[unknown, () => void]} entry
	 * @returns {() => void} disposer
	 */
	function register(entry) {
		stack.push(entry)

		return () => {
			const index = stack.indexOf(entry)
			if (index !== -1) stack.splice(index, 1)
		}
	}

	/**
	 * Close the highest-priority open overlay.
	 * @returns {boolean} true when something was closed (Escape was handled)
	 */
	function closeFirstOpen() {
		for (const entry of stack) {
			if (isOpenNow(entry)) {
				entry[1]()
				return true
			}
		}
		return false
	}

	/** Current stack size (for assertions/diagnostics). */
	function size() {
		return stack.length
	}

	return { register, closeFirstOpen, size }
}
