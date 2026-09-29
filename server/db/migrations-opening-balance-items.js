/**
 * v26 migration — the ITEM an opening balance belongs to (`product_id`).
 *
 * Extracted from `db/schema.js` for the same reason `migrations-opening-balances.js`
 * and `migrations-promotion-tenancy.js` exist: that file is capped by
 * `tests/fileSize.test.js`, and a feature that keeps appending migrations there
 * would move the cap up every release until it stopped meaning anything.
 *
 * ## The gap this closes
 *
 * v25 shipped `opening_balances` keyed by a free-text `account_id`/`account_code`
 * with no reference to `products`. A stock row therefore said "180 × 6.60 = 1,188"
 * about a string that no item table could confirm: the movement existed, the item
 * it moved did not, and no report could join the two. A movement nobody can tie
 * to an item cannot be approved or reconciled — the balance is a number with a
 * caption, not a posted transaction.
 *
 * ## Why a column and not a rewrite of `account_id`
 *
 * `account_id` is half of the UNIQUE key that makes an import IDEMPOTENT
 * (`uq_opening_balance`). Rewriting it from the item CODE to the item UUID would
 * silently change every existing row's identity, so a file re-imported by code
 * would insert a SECOND row for the same item instead of correcting the first —
 * exactly the doubling the unique index exists to prevent. The natural key stays;
 * the relation is an explicit FK that can be filled, checked and joined.
 *
 * ## Why it is nullable
 *
 * `customer` / `cash` / `supplier` positions have no item at all, and every row
 * written before v26 has none either. NULL means "no item linked" and is the only
 * correct value there. A `''` default would be WRONG here, not merely untidy:
 * `foreign_keys = ON` (see `db/schema.js`) makes `''` a non-NULL value with no
 * matching `products.id`, so the insert itself would fail.
 *
 * One item, many movements is the shape: an item carries its opening balance and
 * every later stock movement, so `product_id` is indexed for the join direction
 * that matters (all rows for one item).
 */
export function migrateOpeningBalanceItems(db, addColumnIfMissing, { version = 26, description = 'opening balances item link (product_id)' } = {}) {
	// `REFERENCES products(id)` is legal on ALTER TABLE ... ADD COLUMN here because
	// the column defaults to NULL (SQLite only refuses that clause for a NOT NULL
	// addition without a non-NULL default).
	addColumnIfMissing('opening_balances', 'product_id', 'TEXT REFERENCES products(id)');
	db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opening_product ON opening_balances(product_id);
  `);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)')
		.run(version, description);
}

export default migrateOpeningBalanceItems;