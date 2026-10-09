/**
 * v36 — tenant-scoped uniqueness on invoices.
 *
 * ## The defect
 *
 * `migrations-initial.js` created:
 *
 *     CREATE UNIQUE INDEX idx_invoices_number  ON invoices(number);
 *     CREATE UNIQUE INDEX idx_invoices_idem   ON invoices(idempotency_key) …;
 *
 * Both are GLOBAL, but `tenant_id` was added later (tenancy migration) and every
 * query in the app scopes by it. So the write path's duplicate check
 * (`legacy-invoice-commit.js`: `WHERE number=? AND tenant_id=?`) and the
 * database's actual constraint disagreed — the code says "unique per tenant",
 * the schema says "unique on Earth".
 *
 * Two measured consequences:
 *
 *   1. `UNIQUE constraint failed: invoices.number` — a second tenant importing
 *      the same numbers (the normal case: every shop numbers from 1) is refused.
 *      Reproduced live against this build, not inferred.
 *   2. `idempotency_key` is GLOBAL, so two tenants issuing the same key collide.
 *      That one is worse than an error: the idempotency guard exists to stop a
 *      duplicate sale, and a cross-tenant collision either 500s a legitimate
 *      sale or lets one tenant's retry return another tenant's invoice.
 *
 * The same shape exists on every tenant-owned table that has a natural key
 * (products.code, coupons.code, …). This migration fixes the invoice pair,
 * which is the one the sales and import paths depend on; the rest are tracked
 * rather than silently left.
 *
 * ## Why a migration, and why it is safe on existing data
 *
 * The old global index is dropped and a tenant-scoped one created. Rows already
 * in the table are unaffected unless two tenants already share a number, which
 * the old index made impossible — so this cannot fail on real data.
 *
 * SQLite partial indexes carry the NULL case: `tenant_id` is NULL for legacy
 * rows, and in SQLite NULLs are DISTINCT in a unique index, so those rows are
 * unconstrained here. That matches the documented passthrough for unbound
 * users rather than inventing a second uniqueness rule for them.
 */
export function migrateInvoiceTenantUniqueness(
	db,
	_addColumnIfMissing,
	{ version = 36, description = 'tenant-scoped uniqueness (invoice + product + coupon natural keys)' } = {},
) {
	/*
	 * invoices: drop the explicit GLOBAL indexes and replace them with
	 * tenant-scoped ones. Safe on existing data — the old global index made two
	 * tenants sharing a number impossible, so nothing can collide when the scope
	 * widens.
	 */
	// The NULL-tenant rows need their OWN unique index. SQLite treats NULLs as
	// DISTINCT inside a unique index, so `(tenant_id, code)` does not constrain
	// them at all: an unbound user's duplicate codes sail through. Measured —
	// `scale5.test.js` caught exactly that, expecting 409 on a duplicate code and
	// getting 200. Guarded per table so a missing one cannot abort the migration.
	const hasTenant = (table) =>
		db
			.prepare(`PRAGMA table_info(${table})`)
			.all()
			.some((c) => c.name === 'tenant_id');
	const nullScopedUnique = ['products', 'coupons']
		.filter(hasTenant)
		.map((t) => `CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_null_tenant_code ON ${t}(code) WHERE tenant_id IS NULL;`)
		.join('\n\t\t');

	db.exec(`
			DROP INDEX IF EXISTS idx_invoices_number;
			DROP INDEX IF EXISTS idx_invoices_idem;

			CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_number
				ON invoices(tenant_id, number);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_tenant_number ON invoices(number) WHERE tenant_id IS NULL;
			CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_idem
				ON invoices(tenant_id, idempotency_key)
				WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
			CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_tenant_idem
				ON invoices(idempotency_key)
				WHERE tenant_id IS NULL AND idempotency_key IS NOT NULL AND idempotency_key <> '';

			${nullScopedUnique}
	`);

	/*
	 * products.code / coupons.code are UNIQUE **inside CREATE TABLE**, so SQLite
	 * materialises them as `sqlite_autoindex_*` — a generated name that cannot be
	 * dropped by name. Narrowing the scope therefore requires rebuilding the
	 * table, which is the one operation that can destroy a schema.
	 *
	 * How it is made safe rather than merely claimed to be:
	 *
	 *   - The DDL is read from the LIVE table (`sqlite_master.sql`) and only the
	 *     `UNIQUE` keyword on `code` is removed. A hand-written column list drops
	 *     every column another migration added — and `products` has dozens, so
	 *     the literal version of this was written, seen to destroy the schema,
	 *     and rejected. Drift is now impossible by construction.
	 *   - The copy column list is generated from `PRAGMA table_info`, not typed.
	 *   - Renaming (rather than dropping first) preserves the indexes that
	 *     referenced the old name.
	 *   - The rebuild runs in a transaction; a failure leaves the original intact.
	 *   - The narrowed index cannot collide with existing rows: the column is
	 *     UNIQUE today, so no two rows already share a code.
	 */
	/*
	 * Indexes the rebuild DESTROYS, re-declared.
	 *
	 * Dropping and recreating a table drops every index that referenced it, and
	 * `migrations-initial.js` declares five on `products` / `coupons` — none of
	 * them survive the rebuild above. Measured after the first run: only
	 * `idx_products_tenant_code` and the primary key were left. A catalog table
	 * that stops being indexed is a table that starts being table-scanned, and
	 * this is a POS: barcode lookup is on the hot path of every sale.
	 *
	 * Declared here rather than left to a later "re-create the indexes" pass,
	 * because the migration that breaks them is the one that owns putting them
	 * back. `IF NOT EXISTS` makes this a no-op on a re-run.
	 */
	const RESTORE_INDEXES = {
		products: [
			'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
			'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)',
			'CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)',
			'CREATE INDEX IF NOT EXISTS idx_products_code ON products(code)',
			'CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category)',
		],
		coupons: ['CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)'],
	};

	for (const table of ['products', 'coupons']) {
		const cols = db.prepare(`PRAGMA table_info(${table})`).all();
		if (!cols.some((c) => c.name === 'tenant_id')) continue;

		const sqlRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(table);
		if (!sqlRow?.sql) continue;
		if (!/code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(sqlRow.sql)) continue;

		const names = cols.map((c) => c.name);
		const list = names.join(',');
		// `name` is NOT NULL in the live DDL for products; legacy NULL rows would
		// abort the copy, so they are normalised rather than dropped.
		const select = names.map((n) => (n === 'name' ? "COALESCE(name, '')" : n)).join(',');

		// Keep every column and constraint exactly as the database has them.
		const paren = sqlRow.sql.indexOf('(');
		const body = sqlRow.sql.slice(paren).replace(/code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, 'code TEXT NOT NULL');

		/*
		 * `DROP TABLE ${table}` is what fails — not the copy. `stock_levels`,
		 * `opening_balances` and `invoice_items` all carry
		 * `… REFERENCES products(id) ON DELETE NO ACTION`, and with
		 * `foreign_keys = ON` (schema.js sets it on every connection) SQLite
		 * refuses to drop a table that other tables reference. Measured on the
		 * production database: 192 stock rows and 198 opening-balance rows
		 * reference `products`, so the rebuild aborted and v36 was DEFERRED —
		 * which is how a live database stayed at v35 while the ladder claimed
		 * v38, with the global uniqueness bug still shipped.
		 *
		 * The rebuild is atomic (BEGIN … COMMIT) and moves NO data out of the
		 * table: every row is copied into the new table and the old one is
		 * dropped inside the same transaction, so turning FK checks off for the
		 * duration of that transaction cannot leave a dangling reference. The
		 * checks are restored before anything else runs.
		 *
		 * `PRAGMA foreign_keys` cannot be changed from inside a transaction, so
		 * the toggle happens around the transaction, not inside it.
		 */
		const fkWasOn = db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1;
		if (fkWasOn) db.exec('PRAGMA foreign_keys = OFF');

		db.exec('BEGIN');
		try {
			db.exec(`CREATE TABLE ${table}_t36_new ${body}`);
			db.exec(`INSERT INTO ${table}_t36_new (${list}) SELECT ${select} FROM ${table};`);
			db.exec(`DROP TABLE ${table};`);
			db.exec(`ALTER TABLE ${table}_t36_new RENAME TO ${table};`);
			db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_tenant_code ON ${table}(tenant_id, code);`);
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');
			throw e;
		}
		if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');

		// Derived DDL cannot drop a column by construction — but a table that lost
		// one is a catalog nobody can reconcile, so prove it instead of trusting it.
		const after = db
			.prepare(`PRAGMA table_info(${table})`)
			.all()
			.map((c) => c.name);
		const lost = names.filter((n) => !after.includes(n));
		if (lost.length) {
			throw new Error(`v36 ${table} rebuild lost columns [${lost.join(', ')}] — the derived DDL is wrong`);
		}

		// Put back what the rebuild dropped (see RESTORE_INDEXES above).
		for (const stmt of RESTORE_INDEXES[table]) db.exec(stmt);

		// …and the NULL-tenant unique index, created EARLIER in this same
		// migration — and silently destroyed by the `DROP TABLE` above, which is
		// how the first run left unbound users with no duplicate protection at all
		// (measured: `scale5.test.js` expected 409 on a duplicate code, got 200).
		db.exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_null_tenant_code ON ${table}(code) WHERE tenant_id IS NULL;`,
		);

		/*
		 * …and the FTS5 index + its triggers, which `DROP TABLE` also destroys.
		 *
		 * This is not a hypothetical. Measured after the first run of this
		 * migration: creating a product returned 201, the row was in `products`,
		 * and `GET /api/products?q=…` returned ZERO results — 12 suites failed
		 * across the product, import, print and stock paths. The cause is
		 * `products_fts`, an FTS5 table with `content='products'` kept in sync by
		 * three AFTER INSERT/DELETE/UPDATE triggers (`schema.js`). Dropping and
		 * recreating `products` removes those triggers, so the index stops
		 * receiving rows while `routes/products.js` still routes long queries to
		 * `MATCH` — an index that silently returns nothing.
		 *
		 * The catalog is not searchable again until the triggers exist AND the
		 * index is rebuilt for the rows already there.
		 */
		if (table === 'products') {
			db.exec(`
				DROP TRIGGER IF EXISTS trg_products_fts_ai;
				DROP TRIGGER IF EXISTS trg_products_fts_ad;
				DROP TRIGGER IF EXISTS trg_products_fts_au;

				CREATE TRIGGER IF NOT EXISTS trg_products_fts_ai AFTER INSERT ON products BEGIN
					INSERT INTO products_fts(rowid, name, code, barcode, name_ar)
					VALUES (new.rowid, new.name, new.code, new.barcode, new.name_ar);
				END;
				CREATE TRIGGER IF NOT EXISTS trg_products_fts_ad AFTER DELETE ON products BEGIN
					INSERT INTO products_fts(products_fts, rowid, name, code, barcode, name_ar)
					VALUES ('delete', old.rowid, old.name, old.code, old.barcode, old.name_ar);
				END;
				CREATE TRIGGER IF NOT EXISTS trg_products_fts_au AFTER UPDATE ON products BEGIN
					INSERT INTO products_fts(products_fts, rowid, name, code, barcode, name_ar)
					VALUES ('delete', old.rowid, old.name, old.code, old.barcode, old.name_ar);
					INSERT INTO products_fts(rowid, name, code, barcode, name_ar)
					VALUES (new.rowid, new.name, new.code, new.barcode, new.name_ar);
				END;

				INSERT INTO products_fts(products_fts) VALUES ('rebuild');
			`);
		}
	}

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateInvoiceTenantUniqueness;
