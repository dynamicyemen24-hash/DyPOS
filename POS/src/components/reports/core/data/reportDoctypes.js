/**
 * Which report doctypes the method router can actually answer.
 *
 * The router maps a doctype to ONE table with a hand-written projection
 * (`server/routes/method.js` → `DOCTYPES`). Anything not mapped answers
 * `get_list` with an empty array and `get_count` with 0 — indistinguishable, at
 * the client, from "the shop had none". That is how the inventory dashboard
 * ended up confidently reporting "Stock Value 0.00" against a perfectly healthy
 * server: `Bin`, `Payment Entry`, `Purchase Invoice` and the movement ledger
 * are unmapped.
 *
 * So the report layer names them explicitly and reports them as
 * `unavailable` rather than rendering zeros. `server/tests/doctype-contract.test.js`
 * asserts this set matches the server's unmapped doctypes exactly, so it can
 * neither rot nor grow stale when a mapping lands.
 */
export const SERVER_UNAVAILABLE_DOCTYPES = new Set([
	"Stock Ledger Entry",
	"Bin",
	"Payment Entry",
	"Purchase Invoice",
	"Sales Taxes and Charges",
	"Sales Invoice Item",
])

/** True when the method router has a real table+projection for this doctype. */
export function isServerBacked(doctype) {
	return !SERVER_UNAVAILABLE_DOCTYPES.has(doctype)
}

/** Arabic reason a doctype cannot be read — shown verbatim in the UI. */
export function unavailableReason(doctype) {
	return `«${doctype}» غير متاح على الخادم — لا تُعرض أرقامه كأنها صفر`
}
