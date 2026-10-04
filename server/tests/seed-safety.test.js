import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assertSafeRoyalDemoSeed } from '../scripts/seed-safety.mjs';

function fixtureDb() {
	const db = new DatabaseSync(':memory:');
	db.exec(
		[
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
		]
			.map((table) => `CREATE TABLE ${table} (id TEXT);`)
			.join('\n'),
	);
	return db;
}

test('sample seed refuses production even when the database is empty', () => {
	const db = fixtureDb();
	assert.throws(() => assertSafeRoyalDemoSeed(db, { nodeEnv: 'production' }), /NODE_ENV=production/);
	db.close();
});

test('sample seed allows an empty non-production database', () => {
	const db = fixtureDb();
	assert.deepEqual(assertSafeRoyalDemoSeed(db, { nodeEnv: 'test' }), {
		business_settings: 0,
		tenants: 0,
		organizations: 0,
		branches: 0,
		warehouses: 0,
		users: 0,
		api_keys: 0,
		currencies: 0,
		uoms: 0,
		customers: 0,
		products: 0,
		invoices: 0,
		stock_levels: 0,
		fiscal_years: 0,
		invoice_sequences: 0,
		zatca_settings: 0,
	});
	db.close();
});

test('sample seed refuses to alter an existing customer database', () => {
	const db = fixtureDb();
	db.prepare('INSERT INTO users (id) VALUES (?)').run('existing-user');
	assert.throws(() => assertSafeRoyalDemoSeed(db, { nodeEnv: 'development' }), /users=1/);
	db.close();
});
