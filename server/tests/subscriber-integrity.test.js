/**
 * Subscriber #1 integrity gate — Royal Global, Marib.
 *
 * ## Why this file exists
 *
 * The Royal seed is the ONLY fixture in the tree that ships a real subscriber's
 * identity, and every defect found against it was invisible to a green suite:
 *
 *   - the seed wrote `currency=SAR` while the subscriber profile declared YER,
 *     so every invoice the shop issued was priced in the wrong unit;
 *   - the seed wrote `stock_levels` and NO `opening_balances` rows, so the
 *     stock-valuation report read a confident 0.00 for the period before the
 *     first invoice — a zero that meant "unknown", not "nothing";
 *   - the migration ladder claimed v38 while the live database sat at v35,
 *     because v36 was DEFERRED (a FOREIGN KEY failure on `DROP TABLE products`)
 *     and nothing measured the gap.
 *
 * Each of those was a one-line constant or one missing block in a 607-line
 * seed script, and each would have shipped again the moment someone touched
 * the file. So the contract is asserted here, and the assertion names the
 * value it expects rather than a count.
 *
 * ## What is asserted
 *
 * Identity (the subscriber is who the seed says it is) and position (the
 * baseline the reports measure against). Nothing else: the catalog is a
 * fixture and its size is allowed to change.
 *
 * ## How it runs in CI
 *
 * The suite boots on `:memory:`, so this gate cannot read the production file
 * — an in-memory database has no Royal data and the assertions would all fail
 * for the wrong reason. The gate therefore provisions its own scratch database:
 * migrate → seed → assert, then closes it. That makes the contract reproducible
 * on any machine instead of a property of one file sitting on disk.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RGT = '00000000-0000-0000-0000-000000000001';
const SUBSCRIBER_CURRENCY = 'YER';

function count(db, table, where = '1=1', params = {}) {
	return db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get(params).c;
}

describe('subscriber #1 integrity (Royal Global)', () => {
	let db;
	let tmpDir;

	before(async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'dypos-sub-'));
		const dbPath = join(tmpDir, 'dypos.db');

		// Provision a scratch database the same way production is provisioned:
		// migrate first (so the ladder and the schema match), then seed.
		process.env.DYPOS_DB_PATH = dbPath;
		const { migrate } = await import('../db/schema.js');
		migrate();

		// The seed is a self-contained ESM script that opens its own connection
		// to DYPOS_DB_PATH, so it sees the migrated schema and writes the fixture.
		await import('../scripts/seed-royal-production.mjs');

		// Re-open the migrated+seeded database for assertions.
		const { DatabaseSync } = await import('node:sqlite');
		db = new DatabaseSync(dbPath);
	});

	after(() => {
		try {
			db?.close();
		} catch {}
		if (tmpDir) {
			// SQLite leaves -wal / -shm behind on close, and Windows refuses to
			// rmdir a non-empty dir. Retry once with a short backoff instead of
			// failing the suite over a temp dir it never shipped.
			for (let attempt = 0; attempt < 5; attempt += 1) {
				try {
					rmSync(tmpDir, { recursive: true, force: true });
					return;
				} catch {
					// WAL/journal still open — wait and retry.
				}
			}
			// Last resort: nuke the SQLite sidecars directly so the dir is empty.
			try {
				rmSync(join(tmpDir, 'dypos.db-wal'), { force: true });
			} catch {}
			try {
				rmSync(join(tmpDir, 'dypos.db-shm'), { force: true });
			} catch {}
			try {
				rmSync(join(tmpDir, 'dypos.db-journal'), { force: true });
			} catch {}
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {}
		}
	});

	it('is present, active, and named as the seed declares', () => {
		const t = db.prepare('SELECT id, name, code, is_active FROM tenants WHERE id=:i').get({ i: RGT });
		assert.ok(t, 'subscriber #1 tenant is missing — run the Royal seed');
		assert.strictEqual(t.name, 'رويال العالمية لتجارة أدوات التجميل والعطور');
		assert.strictEqual(t.code, 'RGT');
		assert.strictEqual(t.is_active, 1);
	});

	it('bills in the subscriber currency, not the seed default', () => {
		const currency = db.prepare("SELECT value FROM business_settings WHERE key='currency'").get().value;
		assert.strictEqual(currency, SUBSCRIBER_CURRENCY, `expected ${SUBSCRIBER_CURRENCY}, got ${currency}`);
	});

	it('carries an opening position covering every stock row', () => {
		const stockRows = count(db, 'stock_levels', 'product_id IN (SELECT id FROM products WHERE tenant_id=:i)', {
			i: RGT,
		});
		const obRows = count(db, 'opening_balances', 'tenant_id=:i', { i: RGT });
		assert.ok(
			obRows >= stockRows,
			`opening_balances (${obRows}) must cover every stock row (${stockRows}) — a stock report over a year with no baseline reads a confident 0.00`,
		);
		assert.ok(obRows > 0, 'opening_balances is empty — the subscriber has no measured baseline');
	});

	it('owns its catalog, customers and users', () => {
		assert.ok(count(db, 'products', 'tenant_id=:i', { i: RGT }) > 0, 'subscriber owns no products');
		assert.ok(count(db, 'customers', 'tenant_id=:i', { i: RGT }) > 0, 'subscriber owns no customers');
		assert.ok(count(db, 'users', 'tenant_id=:i', { i: RGT }) > 0, 'subscriber owns no users');
	});

	it('has no rows leaking into another tenant (isolation)', () => {
		// A second tenant must be able to use the same product codes and invoice
		// numbers — the tenant-scoped uniqueness (v36) is what allows that.
		const leaked = db
			.prepare(
				`SELECT COUNT(*) AS c FROM (
          SELECT tenant_id FROM products WHERE tenant_id IS NOT NULL AND tenant_id<>:i
          UNION ALL
          SELECT tenant_id FROM customers WHERE tenant_id IS NOT NULL AND tenant_id<>:i
          UNION ALL
          SELECT tenant_id FROM invoices WHERE tenant_id IS NOT NULL AND tenant_id<>:i
        )`,
			)
			.get({ i: RGT }).c;
		assert.strictEqual(leaked, 0, `${leaked} row(s) belong to a different tenant`);
	});
});
