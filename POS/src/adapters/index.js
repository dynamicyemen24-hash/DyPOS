/**
 * DyPOS Backend Adapter — Selects REST or the method-router bridge.
 * Set VITE_DYPOS_BACKEND=rest|method in .env
 * (`frappe` is still accepted as a legacy alias for `method`).
 */
const backend = import.meta.env.VITE_DYPOS_BACKEND || "rest"

async function loadModule(modulePath) {
	try {
		const mod = await import(modulePath)
		return mod
	} catch (firstError) {
		// chunk قد يفشل تحميله مرة (شبكة/ذاكرة) — إعادة المحاولة قبل الاستسلام
		try {
			return await import(`${modulePath}?v=${Date.now()}`)
		} catch {
			throw firstError
		}
	}
}

let adapter
// "frappe" stays accepted so an older .env keeps working; the bridge itself
// now talks to DyPOS' own /api/method contract (same verbs, same envelope).
if (backend === "method" || backend === "frappe") {
	try {
		adapter = await loadModule("../adapters/method/api.js")
	} catch {
		// fail-safe: fallback إلى REST بدل إفشال إقلاع التطبيق كاملاً.
		// REST والوسيلة يتشاركان نفس العقد التعاقدي.
		adapter = await loadModule("../adapters/rest/api.js")
	}
} else {
	adapter = await loadModule("../adapters/rest/api.js")
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
