import { silentPrintDoc } from "./printInvoice"

const EOD_PRINT_FORMAT = "DyPOS EOD Report"

export async function printEODReport(closingShiftName) {
	await silentPrintDoc("POS Closing Shift", closingShiftName, EOD_PRINT_FORMAT)
}
