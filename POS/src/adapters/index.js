/**
 * DyPOS Backend Adapter — Selects REST or Frappe based on env config
 * Set VITE_DYPOS_BACKEND=rest|frappe in .env
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
if (backend === "frappe") {
	try {
		adapter = await loadModule("../adapters/frappe/api.js")
	} catch {
		// fail-safe: fallback إلى REST بدل إفشال إقلاع التطبيق كاملاً.
		// REST والمفاهيم الوظيفية لـ Frappe تتشارك نفس العقد التعاقدي.
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
