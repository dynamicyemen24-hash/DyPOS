/**
 * Tenant-scoped uniqueness — the schema must agree with every tenant-scoped query.
 *
 * ## The defect this gate exists for
 *
 * Tenancy added a `tenant_id` column and made every read and write scope by it.
 * The uniqueness constraints were never migrated with it, so the database kept
 * enforcing GLOBAL uniqueness while the code checked PER-TENANT uniqueness:
 *
 *     legacy-invoice-commit.js:  SELECT id FROM invoices WHERE number=? AND tenant_id=?
 *     migrations-initial.js:     CREATE UNIQUE INDEX idx_invoices_number ON invoices(number)
 *
 * Those two disagree, and the schema wins. Measured on a live server: a second
 * tenant importing its own numbers got `UNIQUE constraint failed: invoices.number`
 * — the normal case, since every shop numbers from 1. `products.code` and
 * `coupons.code` had the same shape as a column-level `UNIQUE`, and
 * `invoices.idempotency_key` was worse than an error: a cross-tenant collision on
 * the idempotency guard can return one tenant's invoice to another's retry.
 *
 * ## What is asserted
 *
 * That a tenant-owned table with a natural key has NO unique index that omits
 * `tenant_id`, and that it kept the indexes the rebuild had to drop. The second
 * half exists because the v36 rebuild recreates `products` — and a rebuilt table
 * silently loses every index declared in `migrations-initial.js`, which measured
 * as a catalog falling back to table scans on the barcode hot path.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { db, migrate } from '../db/schema.js';

/** Natural keys that are scoped by tenant throughout the query layer. */
const TENANT_NATURAL_KEYS = {
	invoices: ['number', 'idempotency_key'],
	products: ['code'],
	coupons: ['code'],
};

/** Indexes `migrations-initial.js` declares; a table rebuild must not lose them. */
const REQUIRED_INDEXES = {
	products: [
		'idx_products_barcode',
		'idx_products_category',
		'idx_products_name',
		'idx_products_code',
		'idx_products_active_cat',
	],
	coupons: ['idx_coupons_code'],
};

before(() => migrate());
after(() => {
	try {
		db.close();
	} catch {
		/* the shared suite closes it too */
	}
});

/** Column list of every unique index on a table, autoindexes included. */
function uniqueIndexes(table) {
	return db
		.prepare(`PRAGMA index_list(${table})`)
		.all()
		.filter((i) => i.unique)
		.map((i) => ({
			name: i.name,
			cols: db
				.prepare(`PRAGMA index_info('${i.name}')`)
				.all()
				.map((c) => c.name),
		}));
}

function columns(table) {
	return db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.map((c) => c.name);
}

describe('tenant-scoped uniqueness', () => {
	for (const [table, keys] of Object.entries(TENANT_NATURAL_KEYS)) {
		it(`${table} has no unique index that ignores tenant_id`, () => {
			const cols = columns(table);
			assert.ok(cols.includes('tenant_id'), `${table} has no tenant_id to scope by`);

			// A PARTIAL index scoped to `tenant_id IS NULL` is exactly the fix for the
			// unbound half, so it must NOT be counted as a "global" index — SQLite
			// treats NULLs as DISTINCT inside a unique index, so `(tenant_id, code)`
			// alone leaves legacy rows unprotected (measured: scale5 expected 409 on
			// a duplicate code and got 200).
			const sqlFor = (name) =>
				db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`).get(name)?.sql || '';
			const isNullScoped = (name) => /where\s+tenant_id\s+is\s+null/i.test(sqlFor(name));

			for (const key of keys) {
				const bad = uniqueIndexes(table).filter(
					(i) => i.cols.includes(key) && !i.cols.includes('tenant_id') && !isNullScoped(i.name),
				);
				assert.deepEqual(
					bad.map((i) => i.name),
					[],
					`${table}.${key} is unique globally: a second tenant cannot use the same value — ${bad
						.map((i) => `${i.name}(${i.cols.join(',')})`)
						.join(' ')}`,
				);

				// …and the unbound half must be covered by a PARTIAL index, which is
				// the only thing that constrains NULL-tenant rows.
				const nullGuarded = uniqueIndexes(table).some(
					(i) => i.cols.length === 1 && i.cols[0] === key && isNullScoped(i.name),
				);
				assert.ok(
					nullGuarded,
					`${table} does not constrain ${key} for unbound (tenant_id IS NULL) rows — SQLite treats those NULLs as distinct, so duplicates pass silently`,
				);
			}
		});

		it(`${table} actually carries a tenant-scoped unique index`, () => {
			// The negative check above passes vacuously if every index was simply
			// removed, so the positive half proves the constraint still EXISTS.
			const scoped = uniqueIndexes(table).filter((i) => i.cols.includes('tenant_id'));
			assert.ok(scoped.length > 0, `${table} lost all tenant-scoped uniqueness — duplicates are now possible`);
		});
	}

	for (const [table, required] of Object.entries(REQUIRED_INDEXES)) {
		it(`${table} kept the indexes its rebuild would drop`, () => {
			const present = db
				.prepare(`PRAGMA index_list(${table})`)
				.all()
				.map((i) => i.name);
			const missing = required.filter((n) => !present.includes(n));
			assert.deepEqual(missing, [], `${table} lost indexes after the v36 rebuild`);
		});
	}

	it('two tenants may hold the same invoice number and product code', () => {
		// The behaviour, not the DDL text: this is the exact operation the defect
		// made impossible.
		db.prepare('INSERT INTO tenants (id, name, is_active) VALUES (?,?,1)').run('t-a', 'A');
		db.prepare('INSERT INTO tenants (id, name, is_active) VALUES (?,?,1)').run('t-b', 'B');
		const inv = (tenant, n) =>
			db
				.prepare('INSERT INTO invoices (id, number, customer_name, tenant_id) VALUES (?,?,?,?)')
				.run(`i-${tenant}-${n}`, n, 'عميل نقدي', tenant);
		const prod = (tenant, c) =>
			db
				.prepare('INSERT INTO products (id, code, name, tenant_id) VALUES (?,?,?,?)')
				.run(`p-${tenant}-${c}`, c, 'صنف', tenant);

		inv('t-a', 'INV-1');
		inv('t-b', 'INV-1');
		prod('t-a', 'CODE-1');
		prod('t-b', 'CODE-1');

		assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE number=?').get('INV-1').c, 2);
		assert.equal(db.prepare('SELECT COUNT(*) c FROM products WHERE code=?').get('CODE-1').c, 2);

		// The SAME tenant still cannot duplicate — narrowing must not become absent.
		assert.throws(() => inv('t-a', 'INV-1'), /UNIQUE/i);
		assert.throws(() => prod('t-a', 'CODE-1'), /UNIQUE/i);
	});
});
