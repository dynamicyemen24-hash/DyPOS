import type { KPI, ReportFilter } from "../types/report.types"

/**
 * Financial Reports domain types.
 *
 * Raw facts are flat rows coming from the DyPOS data layer
 * (core/data/financialData.js). Report models are computed by
 * pure calculators (never inside the Vue components).
 */

export interface FinancialReportFilter extends ReportFilter {
	company?: string
	posProfile?: string
}

/* ------------------------------------------------------------------ */
/* Raw facts                                                           */
/* ------------------------------------------------------------------ */

export interface SalesInvoiceFact {
	name: string
	posting_date: string
	due_date?: string
	customer: string
	customer_name?: string
	company?: string
	pos_profile?: string
	status?: string
	is_return?: 0 | 1
	base_grand_total: number
	base_net_total: number
	base_total_taxes_and_charges: number
	base_discount_amount: number
	base_paid_amount: number
	outstanding_amount: number
}

export interface SalesInvoiceItemFact {
	parent: string
	item_code: string
	item_name?: string
	qty: number
	base_net_amount: number
	/** Present only when the backend exposes it; otherwise COGS degrades gracefully. */
	valuation_rate?: number | null
}

export interface TaxLineFact {
	parent: string
	account_head: string
	description?: string
	rate?: number | null
	base_tax_amount: number
}

export interface PaymentEntryFact {
	name: string
	posting_date: string
	payment_type: "Receive" | "Pay" | "Internal Transfer" | string
	party_type?: string
	party?: string
	mode_of_payment?: string
	paid_amount: number
	received_amount: number
}

export interface PurchaseInvoiceFact {
	name: string
	posting_date: string
	due_date?: string
	supplier: string
	supplier_name?: string
	company?: string
	status?: string
	bill_no?: string
	base_grand_total: number
	outstanding_amount: number
}

/* ------------------------------------------------------------------ */
/* Shared report shapes                                                */
/* ------------------------------------------------------------------ */

export interface DailyFinancialRow {
	date: string
	value: number
	[key: string]: number | string
}

export interface AgingBucket {
	label: string
	minDays: number
	maxDays: number | null
	count: number
	amount: number
}

export interface ReceivableRow {
	party: string
	partyName: string
	invoiceCount: number
	outstanding: number
	oldestDueDate: string | null
	overdueDays: number
	status: "current" | "overdue"
}

/* ------------------------------------------------------------------ */
/* Report models                                                       */
/* ------------------------------------------------------------------ */

export interface RevenueDailyRow extends DailyFinancialRow {
	grossSales: number
	netSales: number
	taxes: number
	discount: number
	transactions: number
	returns: number
}

export interface RevenueCustomerRow {
	customer: string
	customerName: string
	invoices: number
	netSales: number
	sharePercent: number
}

export interface RevenueReportModel {
	kpis: KPI[]
	daily: RevenueDailyRow[]
	topCustomers: RevenueCustomerRow[]
}

export interface TaxAccountRow {
	accountHead: string
	description: string
	rate: number | null
	amount: number
	sharePercent: number
}

export interface TaxDailyRow extends DailyFinancialRow {
	taxableAmount: number
	taxAmount: number
	transactions: number
}

export interface TaxReportModel {
	kpis: KPI[]
	byAccount: TaxAccountRow[]
	daily: TaxDailyRow[]
	breakdownAvailable: boolean
}

export interface ProfitabilityItemRow {
	itemCode: string
	itemName: string
	qty: number
	revenue: number
	cost: number
	profit: number
	marginPercent: number | null
}

export interface ProfitabilityReportModel {
	kpis: KPI[]
	items: ProfitabilityItemRow[]
	costDataAvailable: boolean
}

export interface CashflowDailyRow extends DailyFinancialRow {
	inflow: number
	outflow: number
	net: number
	balance: number
}

export interface CashflowModeRow {
	mode: string
	inflow: number
	outflow: number
	net: number
	sharePercent: number
}

export interface CashflowReportModel {
	kpis: KPI[]
	daily: CashflowDailyRow[]
	byMode: CashflowModeRow[]
}

export interface ReceivablesReportModel {
	kpis: KPI[]
	parties: ReceivableRow[]
	aging: AgingBucket[]
}

export interface PayablesReportModel {
	kpis: KPI[]
	parties: ReceivableRow[]
	aging: AgingBucket[]
}
