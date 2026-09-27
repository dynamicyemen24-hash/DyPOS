/**
 * DyPOS Backend Adapter — Selects REST or the method-router bridge.
 * Set VITE_DYPOS_BACKEND=rest|method in .env
 * (`frappe` is still accepted as a legacy alias for `method`).
 */
const backend = import.meta.env.VITE_DYPOS_BACKEND || "rest"

/**
 * Both loaders are written as static `import()` calls on purpose.
 *
 * The previous shape passed the path as a *variable* (`loadModule("../adapters/
 * method/api.js")`), which Rollup cannot resolve: it emits neither chunk, so
 * `dist/pos/assets` shipped no adapter at all and the lazy import from
 * `composables/useRecentInvoices.js` 404'd in production while dev worked
 * fine. A literal specifier is bundled, code-split and precacheable — the same
 * reason the cache-busting retry keeps a literal (`?v=` on a literal is still
 * a literal to the bundler).
 */
const loadRest = () => import("../adapters/rest/api.js")
const loadMethod = () => import("../adapters/method/api.js")

/** One retry: a chunk can fail once (flaky network, memory pressure). */
async function loadModule(loader) {
	try {
		return await loader()
	} catch (firstError) {
		try {
			return await loader()
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
		adapter = await loadModule(loadMethod)
	} catch {
		// fail-safe: fallback إلى REST بدل إفشال إقلاع التطبيق كاملاً.
		// REST والوسيلة يتشاركان نفس العقد التعاقدي.
		adapter = await loadModule(loadRest)
	}
} else {
	adapter = await loadModule(loadRest)
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
