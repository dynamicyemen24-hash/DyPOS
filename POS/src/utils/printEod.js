import { logger } from "@/utils/logger"

const log = logger.create("PrintEod")

const EOD_PRINT_FORMAT = "DyPOS EOD Report"

/**
 * Print the shift-closing (EOD) report through the spool, waiting for its
 * terminal state. Signature is preserved so callers stay unchanged; before
 * the spool initializes the call falls back to the legacy silent path.
 *
 * @param {string} closingShiftName
 */
export async function printEODReport(closingShiftName) {
	const { submitAndWait } = await import("@/print/index")

	try {
		const job = await submitAndWait(
			{
				docType: "eod",
				docId: closingShiftName,
				title: `EOD ${closingShiftName}`,
				payload: null,
				formId: EOD_PRINT_FORMAT,
				priority: 1,
				requestedBy: requesterName(),
			},
			{ timeoutMs: 45000 },
		)

		if (job?.status === "COMPLETED") {
			log.info("EOD printed", { closingShiftName })
			return true
		}
		throw new Error(job?.lastError || "EOD report did not print")
	} catch (error) {
		if (error?.job) throw error
		log.warn("Spool EOD failed; legacy silent print fallback", error?.message)
		const { silentPrintDoc } = await import("./printInvoice")
		await silentPrintDoc(
			"POS Closing Shift",
			closingShiftName,
			EOD_PRINT_FORMAT,
		)
		return true
	}
}

function requesterName() {
	try {
		return (
			window?.frappe?.session?.user_fullname ||
			window?.frappe?.session?.user ||
			"Cashier"
		)
	} catch {
		return "Cashier"
	}
}
