/**
 * POS Header Actions — reusable header action handlers.
 * Extracted from POSSale.vue to keep it under file-size cap.
 */
import { goToWorkScreens } from "@/router"

/**
 * Creates header actions map.
 * @param {Object} deps - Dependencies (refs/functions from parent)
 * @param {Ref<boolean>} deps.showHeldSalesPanel
 * @param {Function} deps.openReturns
 * @param {Ref<boolean>} deps.showCustomerPanel
 * @returns {Object} headerActions map
 */
export function createHeaderActions({
	showHeldSalesPanel,
	openReturns,
	showCustomerPanel,
}) {
	return {
		held: () => {
			showHeldSalesPanel.value = true
		},
		returns: () => openReturns(),
		customer: () => {
			showCustomerPanel.value = true
		},
		menu: () => goToWorkScreens(),
	}
}

/**
 * Handles header action by key.
 *
 * BOTH arguments are required: the map is the contract, and a one-argument
 * call (`handleHeaderAction('menu')`) throws a TypeError on the click instead
 * of navigating — a header button that renders and dies. `POS/tests/posHeaderActions.test.js`
 * pins the arity at the call site for that reason.
 *
 * @param {string} action - Action key
 * @param {Record<string, () => void>} headerActions - Actions map from createHeaderActions
 * @returns {boolean} true when an action ran
 */
export function handleHeaderAction(action, headerActions) {
	const run = headerActions?.[action]

	if (typeof run !== "function") return false

	run()

	return true
}
