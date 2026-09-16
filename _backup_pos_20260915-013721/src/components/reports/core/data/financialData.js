/**
 * Financial reports data layer.
 *
 * Single source of raw financial facts for all financial reports.
 * Uses `window.frappe.call` (JS utility pattern per project rules —
 * NOT createResource, which is reserved for Vue components).
 *
 * Only standard Frappe doctypes are queried so this works on any
 * ERPNext backend without custom server code:
 *   - Sales Invoice          (revenue / profitability / receivables)
 *   - Sales Invoice Item     (per-product profitability, optional COGS)
 *   - Sales Taxes and Charges (tax breakdown, degrades gracefully)
 *   - Payment Entry          (cash flow)
 *   - Purchase Invoice       (payables)
 */

const INVOICE_CHUNK = 100

function frappeClient() {
	if (
		typeof window === "undefined" ||
		!window.frappe ||
		typeof window.frappe.call !== "function"
	) {
		const error = new Error("Frappe API not available")
		error.code = "NO_FRAPPE"
		throw error
	}
	return window.frappe
}

async function getList(
	doctype,
	{ fields, filters = [], orderBy = null, limit = 0 } = {},
) {
	const frappe = frappeClient()
	const response = await frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype,
			fields,
			filters,
			order_by: orderBy,
			limit_page_length: limit,
			limit_start: 0,
		},
	})
	return response?.message || response || []
}

function toISODate(date) {
	if (!date) return null
	const d = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(d.getTime())) return null
	return d.toISOString().slice(0, 10)
}

function buildPeriodFilters(filter, dateField) {
	const filters = []
	if (filter?.from) filters.push([dateField, ">=", toISODate(filter.from)])
	if (filter?.to) filters.push([dateField, "<=", toISODate(filter.to)])
	if (filter?.company) filters.push(["company", "=", filter.company])
	if (filter?.posProfile) filters.push(["pos_profile", "=", filter.posProfile])
	return filters
}

async function chunkedChildQuery(doctype, fields, parentField, parentNames) {
	const rows = []
	for (let i = 0; i < parentNames.length; i += INVOICE_CHUNK) {
		const chunk = parentNames.slice(i, i + INVOICE_CHUNK)
		const part = await getList(doctype, {
			fields,
			filters: [[parentField, "in", chunk]],
			limit: 0,
		})
		rows.push(...part)
	}
	return rows
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

const SALES_INVOICE_FIELDS = [
	"name",
	"posting_date",
	"due_date",
	"customer",
	"customer_name",
	"company",
	"pos_profile",
	"status",
	"is_return",
	"base_grand_total",
	"base_net_total",
	"base_total_taxes_and_charges",
	"base_discount_amount",
	"base_paid_amount",
	"outstanding_amount",
]

export async function fetchSalesInvoices(filter) {
	return getList("Sales Invoice", {
		fields: SALES_INVOICE_FIELDS,
		filters: buildPeriodFilters(filter, "posting_date"),
		orderBy: "posting_date asc",
		limit: 0,
	})
}

/**
 * Item rows for profitability. `valuation_rate` is probed first;
 * backends without the field fall back to revenue-only data and the
 * calculators mark cost data as unavailable.
 */
export async function fetchSalesInvoiceItems(invoiceNames) {
	if (!invoiceNames.length) return []
	try {
		return await chunkedChildQuery(
			"Sales Invoice Item",
			[
				"parent",
				"item_code",
				"item_name",
				"qty",
				"base_net_amount",
				"valuation_rate",
			],
			"parent",
			invoiceNames,
		)
	} catch (error) {
		if (error?.code === "NO_FRAPPE") throw error
		const rows = await chunkedChildQuery(
			"Sales Invoice Item",
			["parent", "item_code", "item_name", "qty", "base_net_amount"],
			"parent",
			invoiceNames,
		)
		return rows.map((row) => ({ ...row, valuation_rate: null }))
	}
}

/**
 * Per-account tax breakdown. Child-table queries are not permitted on
 * every backend; callers must treat an empty result as "breakdown
 * unavailable" and rely on invoice-level tax totals instead.
 */
export async function fetchSalesTaxLines(invoiceNames) {
	if (!invoiceNames.length) return []
	try {
		return await chunkedChildQuery(
			"Sales Taxes and Charges",
			["parent", "account_head", "description", "rate", "base_tax_amount"],
			"parent",
			invoiceNames,
		)
	} catch (error) {
		if (error?.code === "NO_FRAPPE") throw error
		return []
	}
}

export async function fetchPaymentEntries(filter) {
	return getList("Payment Entry", {
		fields: [
			"name",
			"posting_date",
			"payment_type",
			"party_type",
			"party",
			"mode_of_payment",
			"paid_amount",
			"received_amount",
			"company",
		],
		filters: buildPeriodFilters(filter, "posting_date"),
		orderBy: "posting_date asc",
		limit: 0,
	})
}

export async function fetchReceivables(filter) {
	const filters = buildPeriodFilters(filter, "posting_date")
	filters.push(["outstanding_amount", ">", 0])
	return getList("Sales Invoice", {
		fields: [
			"name",
			"posting_date",
			"due_date",
			"customer",
			"customer_name",
			"company",
			"status",
			"base_grand_total",
			"outstanding_amount",
		],
		filters,
		orderBy: "due_date asc",
		limit: 0,
	})
}

export async function fetchPayables(filter) {
	const filters = buildPeriodFilters(filter, "posting_date")
	filters.push(["outstanding_amount", ">", 0])
	return getList("Purchase Invoice", {
		fields: [
			"name",
			"posting_date",
			"due_date",
			"supplier",
			"supplier_name",
			"company",
			"status",
			"bill_no",
			"base_grand_total",
			"outstanding_amount",
		],
		filters,
		orderBy: "due_date asc",
		limit: 0,
	})
}

/**
 * Load every fact set needed by the financial reports in parallel.
 * Returns `{ facts, warnings }`; child-table degradation is reported
 * through `warnings` instead of failing the whole load.
 */
export async function loadFinancialData(filter) {
	const [invoices, payments, receivables, payables] = await Promise.all([
		fetchSalesInvoices(filter),
		fetchPaymentEntries(filter),
		fetchReceivables(filter),
		fetchPayables(filter),
	])

	const invoiceNames = invoices.map((row) => row.name)
	const [items, taxLines] = await Promise.all([
		fetchSalesInvoiceItems(invoiceNames),
		fetchSalesTaxLines(invoiceNames),
	])

	const warnings = []
	if (invoiceNames.length > 0 && items.length === 0) {
		warnings.push("items_unavailable")
	}
	if (invoiceNames.length > 0 && taxLines.length === 0) {
		warnings.push("tax_breakdown_unavailable")
	}

	return {
		facts: {
			invoices,
			items,
			taxLines,
			payments,
			receivables,
			payables,
		},
		warnings,
	}
}
