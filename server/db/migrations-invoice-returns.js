/**
 * v24 migration — invoice return tracking (`returned_at` / `returned_by`).
 *
 * Extracted from `db/schema.js` alongside `migrations-tenancy.js` (v8) and
 * `migrations-opening-balances.js` (v25) for one reason: `schema.js` is capped
 * by `tests/fileSize.test.js`, and a migration added inline every release would
 * ratchet the cap upward until it measured nothing at all. The cap only moves
 * down when a migration leaves the file, so this is how a new one earns its
 * place without weakening the gate.
 *
 * ## Why the columns exist
 *
 * `voided_at`/`voided_by` and `returned_at`/`returned_by` are deliberately
 * SEPARATE rather than one shared `cancelled_at`. They mean different things to
 * an accountant: a void cancels an invoice that should never have existed, so
 * stock and money move back; a return is a real sale given back, so it must
 * appear in the period's sales figures as a negative. Both can be true on the
 * same invoice (returned, then voided by an admin), which is why one never
 * overwrites the other.
 *
 * ## Why `addColumnIfMissing` is INJECTED
 *
 * The guarded `ALTER TABLE ... ADD COLUMN` helper lives in `schema.js` and is
 * the ONLY place a literal ALTER is issued. Passing it in rather than
 * re-implementing it keeps that rule single-sourced — this file performs no DDL
 * of its own.
 */
export function migrateInvoiceReturnTracking(db, addColumnIfMissing, { version = 24, description = 'invoice return tracking fields' } = {}) {
	addColumnIfMissing('invoices', 'returned_at', 'TEXT');
	addColumnIfMissing('invoices', 'returned_by', 'TEXT');
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)')
		.run(version, description);
}

export default migrateInvoiceReturnTracking;
