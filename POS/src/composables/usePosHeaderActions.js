/**
 * POS Header Actions — reusable header action handlers.
 * Extracted from POSSale.vue to keep it under file-size cap.
 */
import {
	goToQueue,
	goToSelfCheckout,
	goToStockManagement,
	goToWorkScreens,
} from "@/router"

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
		// The two kiosk surfaces, reachable from the cashier screen in one
		// click. They were reachable only by typing the URL, which is not
		// a way anyone discovers a feature — the same dead-contract
		// problem the menu button had before it was wired.
		selfCheckout: () => goToSelfCheckout(),
		queue: () => goToQueue(),
		// The `PosHeaderActionGroup` keys, so a group button and a header
		// button share one namespace and one dispatch path.
		settlements: () => goToWorkScreens("settlements"),
		stock: () => goToStockManagement(),
	}
}

/**
 * Handles a header action by key.
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

/**
 * Routes an action emitted by `PosHeaderActionGroup`.
 *
 * The group's keys are the same namespace the header map uses, so the
 * dispatch stays in one place: a group button and a header button are the
 * same kind of contract, not two.
 *
 * @param {string} action - Group key
 * @param {Record<string, () => void>} headerActions - Actions map
 * @param {Object} extra - Actions that live only on the page (print,
 *   stock) because they close over page state, not refs
 * @returns {boolean} true when an action ran
 */
export function handleHeaderGroupAction(action, headerActions, extra = {}) {
	if (handleHeaderAction(action, headerActions)) return true
	const run = extra?.[action]
	if (typeof run !== "function") return false
	run()
	return true
}
