/**
 * Financial reports data layer.
 *
 * Single source of raw financial facts for all financial reports.
 * Uses the shared method-router client (`@/utils/methodClient`) — NOT
 * createResource, which is reserved for Vue components — so the layer works
 * standalone/offline exactly like the rest of the POS.
 *
 * Only standard doc types are queried so this works on any DyPOS backend
 * without custom server code:
 *   - Sales Invoice          (revenue / profitability / receivables)
 *   - Sales Invoice Item     (per-product profitability, optional COGS)
 *   - Sales Taxes and Charges (tax breakdown, degrades gracefully)
 *   - Payment Entry          (cash flow)
 *   - Purchase Invoice       (payables)
 */
import {
	methodGetListWithSource,
	DATA_SOURCE,
	NO_DYPOS_API,
} from "@/utils/methodClient"
import { weakestSource } from "@/utils/offline/localMirror"

const INVOICE_CHUNK = 100

const SOURCE_WARNING = {
	[DATA_SOURCE.LOCAL]: "البيانات معروضة من ذاكرة الجهاز وقد لا تكون محدَّثة",
	[DATA_SOURCE.UNAVAILABLE]:
		"تعذّر جلب البيانات المالية (لا خادم ولا ذاكرة محلية)",
}

/** Provenance-aware fetch — the loaders must know where rows came from. */
async function collect(doctype, options = {}) {
	return methodGetListWithSource(doctype, options)
}

/** Array-only fetch for the public per-doctype fetchers. */
async function getList(doctype, options = {}) {
	const { rows } = await collect(doctype, options)
	return rows
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

/**
 * One definition per query, shared by the array fetchers and the
 * provenance-aware loader. Two spellings of the same filter used to drift.
 */
const salesInvoiceQuery = (filter) => ({
	fields: SALES_INVOICE_FIELDS,
	filters: buildPeriodFilters(filter, "posting_date"),
	orderBy: "posting_date asc",
	limit: 0,
})

export async function fetchSalesInvoices(filter) {
	return getList("Sales Invoice", salesInvoiceQuery(filter))
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
		if (error?.code === NO_DYPOS_API) throw error
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
		if (error?.code === NO_DYPOS_API) throw error
		return []
	}
}

const paymentEntryQuery = (filter) => ({
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

export async function fetchPaymentEntries(filter) {
	return getList("Payment Entry", paymentEntryQuery(filter))
}

const receivableQuery = (filter) => {
	const filters = buildPeriodFilters(filter, "posting_date")
	filters.push(["outstanding_amount", ">", 0])
	return {
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
	}
}

export async function fetchReceivables(filter) {
	return getList("Sales Invoice", receivableQuery(filter))
}

const payableQuery = (filter) => {
	const filters = buildPeriodFilters(filter, "posting_date")
	filters.push(["outstanding_amount", ">", 0])
	return {
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
	}
}

export async function fetchPayables(filter) {
	return getList("Purchase Invoice", payableQuery(filter))
}

/**
 * Load every fact set needed by the financial reports in parallel.
 * Returns `{ facts, warnings, source }`; child-table degradation is reported
 * through `warnings` instead of failing the whole load.
 *
 * `source` is the weakest provenance across the four fact sets: `server`,
 * `local` (offline mirror) or `unavailable` (nothing to read). Dashboards must
 * not present an `unavailable` load as "no sales" — the whole point of tracking
 * it is to say so out loud.
 */
export async function loadFinancialData(filter) {
	const [invoicesRes, paymentsRes, receivablesRes, payablesRes] =
		await Promise.all([
			collect("Sales Invoice", salesInvoiceQuery(filter)),
			collect("Payment Entry", paymentEntryQuery(filter)),
			collect("Sales Invoice", receivableQuery(filter)),
			collect("Purchase Invoice", payableQuery(filter)),
		])

	const invoices = invoicesRes.rows
	const invoiceNames = invoices.map((row) => row.name)
	const [items, taxLines] = await Promise.all([
		fetchSalesInvoiceItems(invoiceNames),
		fetchSalesTaxLines(invoiceNames),
	])

	const source = weakestSource([
		invoicesRes.source,
		paymentsRes.source,
		receivablesRes.source,
		payablesRes.source,
	])

	const warnings = []
	if (source !== DATA_SOURCE.SERVER) warnings.push(SOURCE_WARNING[source])
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
			payments: paymentsRes.rows,
			receivables: receivablesRes.rows,
			payables: payablesRes.rows,
		},
		warnings,
		source,
	}
}
