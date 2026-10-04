/**
 * Coupon validation — the rule, separate from the handler.
 *
 * Extracted from `routes/method.js` because that file is at its size cap, and
 * because the rules below are business rules worth asserting directly rather
 * than only through HTTP.
 *
 * ## Why the lookup is scoped
 *
 * A coupon is a PRICE. An unscoped lookup lets any tenant probe another
 * tenant's coupon codes and learn their validity window, discount type and
 * remaining uses from the answer — an information leak on its own, and a
 * discount leak once the cart applies it. `findCoupon` returns only the
 * caller's own coupons plus global (`tenant_id IS NULL`) ones.
 *
 * ## Why 404 and not 403 for a foreign coupon
 *
 * A 403 confirms the code exists somewhere. This POS is multi-tenant, so
 * "exists but is not yours" and "does not exist" must look identical from
 * outside (invariant 1).
 *
 * @param {object|undefined} c the coupon row from `findCoupon`
 * @param {string} today `YYYY-MM-DD` — injected so the rule is testable
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function validateCouponRow(c, today) {
	if (!c) return { ok: false, notFound: true };
	// The cart does not know its total here, so this checks STRUCTURE only;
	// the amount is computed at cart/submit.
	if (c.valid_from && String(c.valid_from).slice(0, 10) > today) {
		return { ok: false, message: 'الكوبون لم يبدأ بعد' };
	}
	if (c.valid_to && String(c.valid_to).slice(0, 10) < today) {
		return { ok: false, message: 'الكوبون منتهي' };
	}
	if (Number(c.max_uses) > 0 && Number(c.used_count) >= Number(c.max_uses)) {
		return { ok: false, message: 'تجاوز حد الاستخدام' };
	}
	if (Number(c.is_active) !== 1) return { ok: false, message: 'الكوبون غير نشط' };
	return { ok: true };
}

export default { validateCouponRow };
