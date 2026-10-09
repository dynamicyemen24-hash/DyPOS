#!/usr/bin/env node
/**
 * DyPOS Postgres Parity Checker — fails CI on SQLite↔Postgres schema drift.
 *
 * Compares server/db/schema.js (migrate) against server/db/schema-postgres.sql
 * on three axes: tables, columns per table, indexes. Type differences are
 * EXPECTED (TEXT→UUID, REAL→NUMERIC, INTEGER→BOOLEAN) and normalized away —
 * only missing tables/columns/indexes fail the gate.
 *
 * The DDL reader is scripts/lib/parity-sql.mjs — shared with the generator
 * (scripts/gen-pg-parity.mjs), so `npm run parity:sync` can only ever produce
 * something this gate reads the same way.
 *
 * Run: npm run parity
 * Exit: 0 parity · 1 drift detected · 2 infra failure
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePgObjects } from './lib/parity-sql.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const norm = (s) =>
	String(s)
		.toLowerCase()
		.replace(/["'`[\]]/g, '');

function sqliteObjects() {
	process.env.DYPOS_DB_PATH = ':memory:';
	return import('../db/schema.js').then(({ db, migrate }) => {
		migrate();
		const tables = db
			.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
			.all();
		const indexes = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name",
			)
			.all()
			.map((r) => norm(r.name));
		const out = { tables: {}, indexes: new Set(indexes) };
		for (const t of tables) {
			const cols = new Set();
			for (const c of db.prepare(`PRAGMA table_info(${t.name})`).all()) cols.add(norm(c.name));
			out.tables[norm(t.name)] = cols;
		}
		try {
			db.close();
		} catch {
			/* ignore */
		}
		return out;
	});
}

function pgObjects() {
	const sql = readFileSync(join(__dirname, '..', 'db', 'schema-postgres.sql'), 'utf8');
	return parsePgObjects(sql);
}

const IGNORED_TABLES = new Set(['schema_version']); // version bookkeeping differs by design
// FTS index tables: SQLite uses an FTS5 virtual table (+ shadow tables),
// Postgres uses tsvector+GIN (see the documented snippet in schema-postgres.sql).
const isFtsTable = (t) => t === 'products_fts' || t.startsWith('products_fts_');

try {
	const lite = await sqliteObjects();
	const pg = pgObjects();
	const missingTables = [];
	const missingColumns = [];
	for (const [t, cols] of Object.entries(lite.tables)) {
		if (IGNORED_TABLES.has(t) || isFtsTable(t)) continue;
		if (!pg.tables.has(t)) {
			missingTables.push(t);
			continue;
		}
		const pgCols = pg.tables.get(t);
		for (const c of cols) {
			// No SQLite-only skip-list: every SQLite column must also exist in
			// Postgres. (The previous `&& false` guard was dead code.)
			if (!pgCols.has(c)) missingColumns.push(`${t}.${c}`);
		}
	}
	const extraTables = [...pg.tables.keys()].filter((t) => !lite.tables[t] && !IGNORED_TABLES.has(t));
	const missingIndexes = [...lite.indexes].filter((i) => !pg.indexes.has(i) && !i.startsWith('sqlite_'));
	const report = {
		ok: missingTables.length === 0 && missingColumns.length === 0 && missingIndexes.length === 0,
		sqlite_tables: Object.keys(lite.tables).length,
		pg_tables: pg.tables.size,
		missingTables,
		missingColumns,
		missingIndexes,
		extraTables,
	};
	console.log(JSON.stringify(report, null, 2));
	process.exit(report.ok ? 0 : 1);
} catch (e) {
	console.error(JSON.stringify({ ok: false, error: String(e?.message || e).slice(0, 300) }));
	process.exit(2);
}
