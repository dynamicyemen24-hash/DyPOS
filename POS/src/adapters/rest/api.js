/**
 * DyPOS REST API Adapter — Implements IProductRepository, ICustomerRepository, etc.
 * Swappable with Frappe adapter. Just change ADAPTER_TYPE env var.
 */
const API_BASE = import.meta.env.VITE_DYPOS_API || "/api"

class ApiClient {
	constructor() {
		this.token = localStorage.getItem("dypos_token") || ""
	}
	setToken(t) {
		this.token = t
		localStorage.setItem("dypos_token", t)
	}
	clearToken() {
		this.token = ""
		localStorage.removeItem("dypos_token")
	}
	async request(path, options = {}) {
		const headers = {
			"Content-Type": "application/json",
			...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
			...options.headers,
		}
		const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
		if (res.status === 401) {
			this.clearToken()
			if (typeof window !== "undefined") {
				window.dispatchEvent(new CustomEvent("dypos:unauthorized", { detail: { path } }))
				if (!window.location.pathname.includes("/account/")) {
					window.location.href = "/account/login"
				}
			}
			throw new Error("غير مصرح")
		}
		const data = await res.json()
		if (!res.ok) throw new Error(data.error || "خطأ في الخادم")
		return data
	}
	get(path) {
		return this.request(path)
	}
	post(path, body) {
		return this.request(path, { method: "POST", body: JSON.stringify(body) })
	}
	put(path, body) {
		return this.request(path, { method: "PUT", body: JSON.stringify(body) })
	}
	patch(path, body) {
		return this.request(path, { method: "PATCH", body: JSON.stringify(body) })
	}
	del(path) {
		return this.request(path, { method: "DELETE" })
	}
}

const api = new ApiClient()

// ── Auth ──
export async function login(username, password) {
	const data = await api.post("/auth/login", { username, password })
	api.setToken(data.token)
	return data.user
}

export async function register(username, password, fullName, role) {
	return api.post("/auth/register", { username, password, fullName, role })
}

export async function getMe() {
	return api.get("/auth/me")
}

// ── Products ──
export async function getProducts(params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/products?${qs}`)
}

export async function getProduct(id, warehouse = "W-01") {
	return api.get(`/products/${id}?warehouse=${warehouse}`)
}

export async function createProduct(data) {
	return api.post("/products", data)
}
export async function updateProduct(id, data) {
	return api.put(`/products/${id}`, data)
}
export async function deleteProduct(id) {
	return api.del(`/products/${id}`)
}

// ── Customers ──
export async function getCustomers(params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/customers?${qs}`)
}

export async function getCustomer(id) {
	return api.get(`/customers/${id}`)
}
export async function createCustomer(data) {
	return api.post("/customers", data)
}
export async function updateCustomer(id, data) {
	return api.put(`/customers/${id}`, data)
}
export async function getCustomerBalance(id) {
	return api.get(`/customers/${id}/balance`)
}

// ── Invoices ──
export async function createInvoice(data) {
	return api.post("/invoices", data)
}
export async function getInvoices(params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/invoices?${qs}`)
}
export async function getInvoice(id) {
	return api.get(`/invoices/${id}`)
}
export async function payInvoice(id, data) {
	return api.post(`/invoices/${id}/pay`, data)
}
export async function getDailyReport(date, terminal) {
	const qs = new URLSearchParams({ date, terminal }).toString()
	return api.get(`/invoices/reports/daily?${qs}`)
}

// ── Shifts ──
export async function openShift(terminalId, openingCash) {
	return api.post("/shifts/open", { terminalId, openingCash })
}
export async function getOpenShift(terminalId) {
	return api.get(`/shifts/open/${terminalId}`)
}
export async function closeShift(id, closingCash, varianceApproval) {
	return api.post(`/shifts/${id}/close`, { closingCash, varianceApproval })
}
export async function getShiftReport(id) {
	return api.get(`/shifts/${id}/report`)
}

// ── Stock ──
export async function getStock(warehouse = "W-01", items = []) {
	const qs = new URLSearchParams({
		warehouse,
		items: items.join(","),
	}).toString()
	return api.get(`/stock?${qs}`)
}

export async function getStockLevel(productId, warehouse = "W-01") {
	return api.get(`/stock/${productId}?warehouse=${warehouse}`)
}

export async function adjustStock(productId, warehouseId, qty, reason) {
	return api.post("/stock/adjust", { productId, warehouseId, qty, reason })
}

// ── Sync ──
export async function syncPull(checkpoint = 0, limit = 500) {
	return api.get(`/sync/pull?checkpoint=${checkpoint}&limit=${limit}`)
}

export async function syncPush(changes) {
	return api.post("/sync/push", { changes })
}
export async function getSyncCheckpoint() {
	return api.get("/sync/checkpoint")
}

// ── Subscriptions ──
export async function getSubscriptionPlans(params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/subscriptions/plans?${qs}`)
}
export async function createSubscriptionPlan(data) {
	return api.post("/subscriptions/plans", data)
}
export async function updateSubscriptionPlan(id, data) {
	return api.patch(`/subscriptions/plans/${id}`, data)
}
export async function getSubscriptions(params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/subscriptions?${qs}`)
}
export async function subscribeCustomer(data) {
	return api.post("/subscriptions/subscribe", data)
}
export async function pauseSubscription(id) {
	return api.post(`/subscriptions/${id}/pause`)
}
export async function resumeSubscription(id) {
	return api.post(`/subscriptions/${id}/resume`)
}
export async function cancelSubscription(id) {
	return api.post(`/subscriptions/${id}/cancel`)
}
export async function runBilling(date) {
	return api.post("/subscriptions/run-billing", { date })
}
export async function getSubscriptionReport() {
	return api.get("/subscriptions/report")
}
export async function getCustomerBillings(customerId, params = {}) {
	const qs = new URLSearchParams(params).toString()
	return api.get(`/subscriptions/billings/${customerId}?${qs}`)
}

// ── Export ──
export { api as default }
export const dyposApi = {
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
}
