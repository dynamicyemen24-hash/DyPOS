/**
 * Stale-draft expiry — retire, never delete.
 *
 * Extracted from `routes/method.js` (`DyPOS.api.invoices.cleanup_old_drafts`)
 * so the router keeps shrinking toward its file-size ratchet: the policy and
 * its rationale live here, the verb stays a thin guard + call.
 *
 * A stale DRAFT is a working paper that was never posted — expiring it flips
 * the header to `EXPIRED` and keeps every line, payment and timestamp as
 * evidence. Physical deletion would also erase the trail of WHO drafted WHAT,
 * which is exactly what the supervisory register (`status='EXPIRED'`,
 * `audit_trail` action `EXPIRE`) must keep answering. Reports exclude
 * `EXPIRED` the same way on both planes (daily + summary stay equivalent).
 */
import { recordTrail } from './trail.js';

/**
 * Expire DRAFT invoices older than the given age.
 * @param {any} db SQLite handle
 * @param {any} req request (tenant/user/ip for the trail row)
 * @param {unknown} maxAgeHours upper-bounded age window
 * @returns {{ expired: number, maxAgeHours: number }}
 */
export function expireStaleDrafts(db, req, maxAgeHours) {
	const hours = Math.min(Math.max(Number(maxAgeHours) || 1, 0.01), 720);
	const expired = db.transaction(() => {
		const stale = db
			.prepare(`SELECT id FROM invoices WHERE status='DRAFT' AND created_at < datetime('now', ?)`)
			.all(`-${hours} hours`);
		for (const row of stale) {
			db.prepare("UPDATE invoices SET status='EXPIRED',updated_at=datetime('now') WHERE id=?").run(row.id);
			recordTrail(req, { entity: 'INVOICE', entityId: row.id, action: 'EXPIRE' });
		}
		return stale.length;
	})();
	return { expired: expired || 0, maxAgeHours: hours };
}

export default { expireStaleDrafts };
