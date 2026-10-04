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
 * @param {Ref<boolean>} [deps.showSyncCenter] - opens the sync/queue centre
 * @param {Ref<boolean>} [deps.showOperatorMenu] - opens the operator menu
 * @returns {Object} headerActions map
 */
export function createHeaderActions({
	showHeldSalesPanel,
	openReturns,
	showCustomerPanel,
	showSyncCenter,
	showOperatorMenu,
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

		// ── Header affordances that used to be dead ──────────────────────────
		// These three buttons rendered with a cursor and a chevron-down, so the
		// cashier had every reason to expect a menu, and nothing happened. A
		// dead button is worse than a missing one: it teaches the user that
		// the screen lies. Each one now opens something that actually exists.
		//
		// connection: the online/offline badge. In an offline-first POS this is
		// the question the cashier actually asks — "is my work safe?" — so it
		// answers it: pending queue, last sync, sync now.
		connection: () => {
			showSyncCenter.value = true
		},
		// cashier: the operator chip. Standard POS behaviour (Oracle, SAP,
		// Lightspeed): the name opens the operator menu — who you are, and the
		// actions your role allows. The gear and the logout button stay where
		// they are; this is the single place that says "you are X, role Y".
		cashier: () => {
			showOperatorMenu.value = true
		},
		// shift: shift settlement lives on the work screens, so the shift
		// affordance lands there rather than inventing a second shift surface.
		shift: () => goToWorkScreens("settlements"),
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
