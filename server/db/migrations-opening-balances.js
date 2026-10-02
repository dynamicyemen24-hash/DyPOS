/**
 * v25 migration — opening balances (أرصدة افتتاحية).
 *
 * Extracted from `db/schema.js` for the same reason `db/migrations-tenancy.js`
 * exists: the schema file is capped by `tests/fileSize.test.js`, and a feature
 * that keeps adding migrations there would push the cap up every release until
 * the cap stops meaning anything. This file is appended by the migration runner
 * and is deliberately self-contained — no imports, so `schema.js` owns the only
 * call site.
 *
 * ## What the table is for
 *
 * The position a tenant carries INTO a fiscal year: what customers already owe,
 * cash in the drawer, stock on hand. Without it a migrated or newly-imported
 * business has no history, so every receivable, aging and stock-valuation report
 * reads a confident `0.00` for the period BEFORE the first invoice — a zero that
 * means "unknown", not "nothing".
 *
 * ## Why the shape is what it is
 *
 * - `amount_minor` is INTEGER minor units (halalas), never REAL. Opening balances
 *   are the baseline every later figure is measured against; a float that drifts
 *   here becomes a permanent, unexplainable gap between the ledger and the
 *   invoices. `lib/money.js` exists for exactly this, and this column is one of
 *   its inputs.
 * - `quantity` is REAL but rounded to 4dp by the import layer, matching
 *   `NUMERIC(18,4)` in Postgres so the two engines store identical values.
 * - The UNIQUE index is what makes an import IDEMPOTENT: re-importing the same
 *   file corrects the row in place instead of doubling the customer's debt.
 */
export function migrateOpeningBalances(db, { version = 25, description = 'opening balances per fiscal year' } = {}) {
	db.exec(`CREATE TABLE IF NOT EXISTS opening_balances (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      fiscal_year TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_id TEXT NOT NULL DEFAULT '',
      account_code TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '',
      amount_minor INTEGER NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance
      ON opening_balances(fiscal_year, account_type, account_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_opening_tenant
      ON opening_balances(tenant_id, fiscal_year);
  `);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateOpeningBalances;
