import type {
	PayablesReportModel,
	PurchaseInvoiceFact,
} from "../financial.types"
import { buildPartyLedgerModel } from "../receivables/receivablesCalc"

/**
 * Payables report calculator — pure functions only.
 *
 * Mirrors the receivables logic over Purchase Invoices
 * (outstanding_amount > 0) with suppliers as the ledger party.
 * The shared ledger/aging engine lives in receivablesCalc so both
 * sides of the ledger always follow the same rules.
 */

export function buildPayablesModel(
	rows,
	now = new Date(),
): PayablesReportModel {
	return buildPartyLedgerModel(rows, "supplier", "supplier_name", now)
}
