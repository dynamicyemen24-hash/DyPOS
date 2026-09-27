/**
 * Stable, SSR-safe id generator for form controls.
 *
 * Vue 3.5 ships `useId()`, but the POS supports older 3.4 runtimes in some
 * embedded contexts, and the tests pin Vue 3.5 — so we keep a tiny local
 * implementation that never collides inside one document.
 */
let counter = 0

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function useId(prefix = "dypos") {
	counter += 1
	return `${prefix}-${counter}`
}

/** Test helper: reset the counter so ids are reproducible. */
export function resetIdCounter() {
	counter = 0
}
