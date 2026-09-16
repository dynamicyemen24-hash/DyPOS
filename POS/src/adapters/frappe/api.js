/**
 * DyPOS Frappe Adapter — Wraps existing Frappe call() API
 * Drop-in replacement for REST adapter when using Frappe backend.
 */
const call = (method, args) =>
	import("frappe-ui").then((m) => m.call(method, args))

// ── Auth ──
export async function login(username, password) {
	const r = await call("dypos.api.auth.login", { username, password })
	return r
}

export async function getMe() {
	const r = await call("frappe.client.get_value", {
		doctype: "User",
		filters: { name: frappe.session.user },
		fieldname: ["full_name", "user_image"],
	})
	return {
		id: frappe.session.user,
		fullName: r.full_name,
		role: frappe.user_roles[0],
	}
}

// ── Products ──
export async function getProducts(params = {}) {
	const filters = {}
	if (params.q) filters.item_name = ["like", `%${params.q}%`]
	if (params.category) filters.item_group = params.category
	const r = await call("frappe.client.get_list", {
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
