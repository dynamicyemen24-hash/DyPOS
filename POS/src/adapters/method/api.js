/**
 * Method-router bridge — wraps the shared `call()` client on the first-party
 * DyPOS UI kit, so every verb is expressed in DyPOS' own /api/method contract.
 * Drop-in replacement for the REST adapter when VITE_DYPOS_BACKEND=method.
 */
import { sessionRole, sessionUser } from "@/data/session"

const call = (method, args) =>
	import("dypos-ui").then((m) => m.call(method, args))

// ── Auth ──
export async function login(username, password) {
	const r = await call("dypos.api.auth.login", { username, password })
	return r
}

export async function getMe() {
	// Offline-first: the local session is the only source of identity here.
	// There is no desk global to read a user or a role from.
	const user = sessionUser()
	if (!user) return { id: null, fullName: null, role: null, userImage: null }

	const r = await call("dypos.client.get_value", {
		doctype: "User",
		filters: { name: user },
		fieldname: ["full_name", "user_image"],
	})
	return {
		id: user,
		fullName: r?.full_name,
		userImage: r?.user_image,
		role: sessionRole(),
	}
}

// ── Products ──
export async function getProducts(params = {}) {
	const filters = {}
	if (params.q) filters.item_name = ["like", `%${params.q}%`]
	if (params.category) filters.item_group = params.category
	const r = await call("dypos.client.get_list", {
		doctype: "Item",
		filters,
		fields: [
			"item_code",
			"item_name",
			"barcode",
			"standard_rate",
			"item_group",
			"image",
			"stock_uom",
		],
		limit_page_length: params.limit || 100,
	})
	return {
		products: r.map((i) => ({
			id: i.item_code,
			code: i.item_code,
			name: i.item_name,
			barcode: i.barcode,
			unitPrice: i.standard_rate,
			category: i.item_group,
			image: i.image,
			uom: i.stock_uom,
		})),
	}
}

// ── Invoices ──
export async function createInvoice(data) {
	const r = await call("dypos.api.invoices.submit_invoice", {
		items: data.items.map((i) => ({
			item_code: i.productId,
			qty: i.qty,
			rate: i.unitPrice,
		})),
		customer: data.customerId,
		mode_of_payment: data.payments?.[0]?.method || "Cash",
		amount: data.total,
	})
	return {
		invoiceId: r.name,
		number: r.name,
		total: r.grand_total,
		status: r.status === "Paid" ? "PAID" : "DRAFT",
	}
}

// ── Shifts ──
export async function openShift(terminalId, openingCash) {
	return call("dypos.api.shifts.create_opening_shift", {
		pos_profile: terminalId,
		cash_amount: openingCash,
	})
}

export async function closeShift(id, closingCash) {
	return call("dypos.api.shifts.submit_closing_shift", {
		shift: id,
		cash_amount: closingCash,
	})
}

// ── Stock ──
export async function getStock(warehouse, items) {
	const r = await call("dypos.api.items.get_stock_quantities", {
		warehouse,
		items,
	})
	return {
		stock: Object.entries(r).map(([k, v]) => ({ productId: k, qty: v })),
	}
}

// ── Sync ──
export async function syncPull(checkpoint, limit) {
	return call("dypos.api.sync.pull", { checkpoint, limit })
}

export async function syncPush(changes) {
	return call("dypos.api.sync.push", { changes })
}

// ── Unimplemented surface: explicit failure, never silent `undefined` ──
// `src/adapters/index.js` re-exports ONE stable surface for both backends, so
// every name it lists must exist here too. This bridge only implements the
// verbs the method router answers today; the rest are exported as honest,
// loud failures.
// Why: before this block the façade silently produced `undefined` for ~30
// names, so pointing VITE_DYPOS_BACKEND at this bridge turned any call into
// "undefined is not a function" in the middle of a sale. A precise, actionable
// error is the correct behaviour until a real endpoint exists.
function notSupported(name) {
	return async () => {
		throw new Error(
			`المحوّل لا يدعم ${name} — استخدم VITE_DYPOS_BACKEND=rest (الخادم الإنتاجي) أو أضف المسار المقابل في موجّه DyPOS`,
		)
	}
}

// Auth / catalog / customers
export const register = notSupported("register")
export const getProduct = notSupported("getProduct")
export const createProduct = notSupported("createProduct")
export const updateProduct = notSupported("updateProduct")
export const deleteProduct = notSupported("deleteProduct")
export const getCustomers = notSupported("getCustomers")
export const getCustomer = notSupported("getCustomer")
export const createCustomer = notSupported("createCustomer")
export const updateCustomer = notSupported("updateCustomer")
export const getCustomerBalance = notSupported("getCustomerBalance")

// Invoices / shifts
export const getInvoices = notSupported("getInvoices")
export const getInvoice = notSupported("getInvoice")
export const payInvoice = notSupported("payInvoice")
export const getDailyReport = notSupported("getDailyReport")
export const getOpenShift = notSupported("getOpenShift")
export const getShiftReport = notSupported("getShiftReport")

// Stock / sync
export const getStockLevel = notSupported("getStockLevel")
export const adjustStock = notSupported("adjustStock")
export const getSyncCheckpoint = notSupported("getSyncCheckpoint")

// Subscriptions (v1.27.0 engine lives in the REST backend only)
export const getSubscriptionPlans = notSupported("getSubscriptionPlans")
export const createSubscriptionPlan = notSupported("createSubscriptionPlan")
export const updateSubscriptionPlan = notSupported("updateSubscriptionPlan")
export const getSubscriptions = notSupported("getSubscriptions")
export const subscribeCustomer = notSupported("subscribeCustomer")
export const pauseSubscription = notSupported("pauseSubscription")
export const resumeSubscription = notSupported("resumeSubscription")
export const cancelSubscription = notSupported("cancelSubscription")
export const runBilling = notSupported("runBilling")
export const getSubscriptionReport = notSupported("getSubscriptionReport")
export const getCustomerBillings = notSupported("getCustomerBillings")
