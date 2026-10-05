import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assertSafeRoyalDemoSeed, GUARDED_TABLES } from '../scripts/seed-safety.mjs';

const ALL_TABLES = [
	'business_settings',
	'tenants',
	'organizations',
	'branches',
	'warehouses',
	'users',
	'api_keys',
	'currencies',
	'uoms',
	'customers',
	'products',
	'invoices',
	'stock_levels',
	'fiscal_years',
	'invoice_sequences',
	'zatca_settings',
];

function fixtureDb() {
	const db = new DatabaseSync(':memory:');
	db.exec(ALL_TABLES.map((table) => `CREATE TABLE ${table} (id TEXT);`).join('\n'));
	return db;
}

test('sample seed refuses production even when the database is empty', () => {
	const db = fixtureDb();
	assert.throws(() => assertSafeRoyalDemoSeed(db, { nodeEnv: 'production' }), /NODE_ENV=production/);
	db.close();
});

test('sample seed allows an empty non-production database', () => {
	const db = fixtureDb();
	const verdict = assertSafeRoyalDemoSeed(db, { nodeEnv: 'test' });
	assert.equal(verdict.baselineNote.length, 0);
	for (const table of ALL_TABLES) {
		const bucket = verdict.fatal[table] !== undefined ? verdict.fatal : verdict.baseline;
		assert.equal(bucket[table], 0, table);
	}
	db.close();
});

test('sample seed allows migration baselines (currencies, warehouses, settings)', () => {
	// الترحيلات تبذر هذه الصفوف بالتصميم — رفضها كان يعطل التدفق الموثق
	// (migrate ثم seed) على كل قاعدة جديدة.
	const db = fixtureDb();
	db.prepare('INSERT INTO currencies (id) VALUES (?)').run('SAR');
	db.prepare('INSERT INTO business_settings (id) VALUES (?)').run('currency');
	db.prepare('INSERT INTO warehouses (id) VALUES (?)').run('W-01');
	const verdict = assertSafeRoyalDemoSeed(db, { nodeEnv: 'development' });
	assert.deepEqual(verdict.baselineNote.sort(), ['business_settings=1', 'currencies=1', 'warehouses=1']);
	db.close();
});

test('sample seed refuses a database with subscriber data', () => {
	for (const table of ['users', 'tenants', 'products', 'invoices', 'branches', 'invoice_sequences']) {
		const db = fixtureDb();
		db.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run('existing-row');
		assert.throws(() => assertSafeRoyalDemoSeed(db, { nodeEnv: 'development' }), new RegExp(`${table}=1`), table);
		db.close();
	}
});

test('every guarded table is classified exactly once', () => {
	assert.deepEqual([...GUARDED_TABLES].sort(), [...ALL_TABLES].sort());
});
