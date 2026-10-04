/**
 * Coupon lookup, scoped to the caller's tenant.
 *
 * ## Why this exists
 *
 * A coupon is a PRICE. Four call sites resolved one with a bare
 * `SELECT * FROM coupons WHERE code=?`, which meant any tenant could apply (or
 * probe) another tenant's promotion as soon as two shops shared a code — the
 * normal case once `v36` made `coupons.code` unique PER TENANT instead of
 * globally. Before that migration a global unique index accidentally hid the
 * bug; the schema was corrected and the leak became real.
 *
 * The correct shape was already present in `routes/invoices.js`; the rest of the
 * code predated the fix and drifted. Rather than paste that conditional into a
 * fourth place, the rule lives here once.
 *
 * ## The NULL passthrough is deliberate
 *
 * A row with `tenant_id IS NULL` is a GLOBAL coupon (a chain-wide promotion),
 * and such rows are visible to everyone — the same convention
 * `assertTenantScope` uses for unbound users. Only a row owned by ANOTHER
 * tenant is invisible, which is what makes a 404 the correct answer rather than
 * a 403: the caller must not be able to learn that the code exists.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} code
 * @param {string|null} tenantId the caller's scope, or null for an unbound caller
 * @returns {object|undefined} the coupon row, or undefined
 */
export function findCoupon(db, code, tenantId) {
	if (tenantId) {
		return db.prepare('SELECT * FROM coupons WHERE code=? AND (tenant_id=? OR tenant_id IS NULL)').get(code, tenantId);
	}
	return db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
}

export default { findCoupon };
