/**
 * TEMPORARY inventory tool — diffs the SQLite migration schema against the
 * supplementary SQL packs in server/db/ to find structural gaps.
 * Run: node server/db/_inventory_tmp.mjs ; delete afterwards.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.DYPOS_DB_PATH = ':memory:';

const { db, migrate } = await import('./schema.js');
migrate();

const lite = {};
for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
	lite[t.name] = db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
}
try { db.close(); } catch {}

const sqlFiles = readdirSync(__dirname).filter((f) => f.endsWith('.sql') && f.startsWith('dypos_'));
const packTables = {};
for (const f of sqlFiles) {
	const sql = readFileSync(join(__dirname, f), 'utf8');
	const names = new Set();
	for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s*\(/gi)) names.add(m[1].toLowerCase());
	// FK targets referenced across schemas
	const refs = new Set();
	for (const m of sql.matchAll(/REFERENCES\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)/gi)) refs.add(m[1].toLowerCase());
	packTables[f] = { names: [...names].sort(), refs: [...refs].sort() };
}

const pgSql = readFileSync(join(__dirname, 'schema-postgres.sql'), 'utf8');
const pgTables = new Set();
for (const m of pgSql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) pgTables.add(m[1].toLowerCase());

console.log('=== SQLite tables (schema.js migrate) ===');
console.log(Object.keys(lite).sort().join(', '));
console.log('\n=== schema-postgres.sql tables ===');
console.log([...pgTables].sort().join(', '));
for (const [f, { names, refs }] of Object.entries(packTables)) {
	console.log(`\n=== ${f} (${names.length}) ===`);
	console.log(names.join(', '));
	console.log(`-- FK targets: ${refs.join(', ')}`);
	const bare = names.map((n) => n.split('.').pop());
	const missingInPg = bare.filter((n) => !pgTables.has(n));
	console.log(`-- not in schema-postgres.sql (${missingInPg.length}): ${missingInPg.join(', ')}`);
	const missingInLite = bare.filter((n) => !(n in lite));
	console.log(`-- not in sqlite (${missingInLite.length}): ${missingInLite.join(', ')}`);
	const dupExisting = bare.filter((n) => pgTables.has(n));
	console.log(`-- ALREADY EXISTS in baseline (${dupExisting.length}): ${dupExisting.join(', ')}`);
}
const liteNotInPg = Object.keys(lite).filter((t) => !pgTables.has(t) && t !== 'schema_version' && !t.startsWith('products_fts'));
console.log(`\n=== SQLite tables missing from schema-postgres.sql (${liteNotInPg.length}) ===`);
console.log(liteNotInPg.sort().join(', '));

// Columns of the tables the packs ALTER/REFERENCE, to validate assumptions.
for (const t of ['products', 'invoices', 'invoice_items', 'customers', 'tenants', 'branches', 'users', 'shifts', 'warehouses', 'payments', 'sync_log', 'webhook_outbox', 'offers', 'coupons']) {
	if (lite[t]) console.log(`\n${t}: ${lite[t].join(', ')}`);
	else console.log(`\n${t}: (missing in sqlite)`);
}
