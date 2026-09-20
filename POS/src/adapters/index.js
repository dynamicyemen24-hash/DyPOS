/**
 * DyPOS Backend Adapter — Selects REST or Frappe based on env config
 * Set VITE_DYPOS_BACKEND=rest|frappe in .env
 */
const backend = import.meta.env.VITE_DYPOS_BACKEND || "rest"

let adapter
if (backend === "frappe") {
	adapter = await import("../adapters/frappe/api.js")
} else {
	adapter = await import("../adapters/rest/api.js")
}

export const {
	login,
	register,
	getMe,
	getProducts,
	getProduct,
	createProduct,
	updateProduct,
	deleteProduct,
	getCustomers,
	getCustomer,
	createCustomer,
	updateCustomer,
	getCustomerBalance,
	createInvoice,
	getInvoices,
	getInvoice,
	payInvoice,
	getDailyReport,
	openShift,
	getOpenShift,
	closeShift,
	getShiftReport,
	getStock,
	getStockLevel,
	adjustStock,
	syncPull,
	syncPush,
	getSyncCheckpoint,
	getSubscriptionPlans,
	createSubscriptionPlan,
	updateSubscriptionPlan,
	getSubscriptions,
	subscribeCustomer,
	pauseSubscription,
	resumeSubscription,
	cancelSubscription,
	runBilling,
	getSubscriptionReport,
	getCustomerBillings,
} = adapter
export default adapter
