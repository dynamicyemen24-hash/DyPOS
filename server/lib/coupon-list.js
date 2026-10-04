import { resolveTenantFilter } from './tenant.js';

/**
 * Active coupons, scoped to the caller's tenant.
 *
 * ## The defect
 *
 * The list endpoint read:
 *
 *     FROM coupons WHERE is_active=1 AND (valid_from …) ORDER BY created_at
 *
 * with no tenant clause at all. Every POS on a shared deployment could therefore
 * see every other shop's live promotions — their codes, discount types and
 * remaining uses. `v36` did not create this; it made it exploitable, because
 * before it a coupon code was globally unique and the list could only ever
 * contain one shop's rows by accident.
 *
 * ## Why the list swallows errors
 *
 * The handler answers `{message: []}` on failure. That is deliberate for THIS
 * endpoint — a till must still open when the promotion list cannot be read, and
 * an empty promotion list is not a lie the cashier acts on. It would be a lie in
 * a report, which is why reports never use this path.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string|null} tenantId
 * @param {string} today `YYYY-MM-DD`
 */
export function listActiveCoupons(db, tenantId, today) {
	const rows = tenantId
		? db
				.prepare(
					`SELECT id, code, discount_type, discount, max_discount, min_purchase, max_uses,
						used_count, valid_from, valid_to, is_active
					FROM coupons
					WHERE is_active=1
					  AND (tenant_id=? OR tenant_id IS NULL)
					  AND (valid_from IS NULL OR valid_from<=?)
					  AND (valid_to IS NULL OR valid_to>=?)
					ORDER BY created_at DESC LIMIT 100`,
				)
				.all(tenantId, today, today)
		: db
				.prepare(
					`SELECT id, code, discount_type, discount, max_discount, min_purchase, max_uses,
						used_count, valid_from, valid_to, is_active
					FROM coupons
					WHERE is_active=1
					  AND (valid_from IS NULL OR valid_from<=?)
					  AND (valid_to IS NULL OR valid_to>=?)
					ORDER BY created_at DESC LIMIT 100`,
				)
				.all(today, today);

	// The POS consumes `name` / `coupon_code` / `doctype` as if this were an
	// item list — mapping here keeps that alias in ONE place instead of at every
	// read site.
	return rows.map((c) => ({
		...c,
		name: c.code,
		coupon_name: c.code,
		coupon_code: c.code,
		doctype: 'POS Coupon',
	}));
}

/**
 * Active offers, scoped to the caller's tenant.
 *
 * `offers` already carried a tenant clause at the call site, but the clause was
 * assembled inline — the same conditional the coupon list used to lack. Keeping
 * the query here puts both promotion reads behind the same reviewable rule:
 * your own rows plus global (`tenant_id IS NULL`) ones, never another tenant's.
 *
 * Like `listActiveCoupons`, a read failure answers an empty list: a till must
 * still open, and a promotion list is not a number anyone books against.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string|null} tenantId
 */
export function listActiveOffers(db, tenantId) {
	return tenantId
		? db
				.prepare(
					'SELECT * FROM offers WHERE is_active=1 AND (tenant_id=? OR tenant_id IS NULL) ORDER BY created_at DESC LIMIT 100',
				)
				.all(tenantId)
		: db.prepare('SELECT * FROM offers WHERE is_active=1 ORDER BY created_at DESC LIMIT 100').all();
}

/**
 * Resolve the caller's tenant for a READ, or refuse the request.
 *
 * Three endpoints (offers list, coupon list, coupon validation) need the same
 * thing and each had grown its own inline try/catch. The refusal is not
 * cosmetic: `resolveTenantFilter` carries the cross-tenant SPOOF GUARD, so
 * swallowing its error and reading unscoped would turn a rejected spoof into a
 * full disclosure. Swallowing is only safe if the read it feeds is already
 * scoped — which is why this returns null only when the caller had no scope,
 * never when the scope was REJECTED.
 *
 * @returns {{ok: true, tenantId: string|null} | {ok: false}}
 */
export function readTenantScope(req) {
	try {
		return { ok: true, tenantId: resolveTenantFilter(req).tenantId || null };
	} catch {
		return { ok: false };
	}
}

export default { listActiveCoupons, listActiveOffers, readTenantScope };
