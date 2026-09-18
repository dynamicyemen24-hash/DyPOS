#!/usr/bin/env node
/**
 * DyPOS Postgres Parity Checker — fails CI on SQLite↔Postgres schema drift.
 *
 * Compares server/db/schema.js (migrate) against server/db/schema-postgres.sql
 * on three axes: tables, columns per table, indexes. Type differences are
 * EXPECTED (TEXT→UUID, REAL→NUMERIC, INTEGER→BOOLEAN) and normalized away —
 * only missing tables/columns/indexes fail the gate.
 *
 * Run: npm run parity
 * Exit: 0 parity · 1 drift detected · 2 infra failure
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const norm = (s) => String(s).toLowerCase().replace(/["'`[\]]/g, '');

function sqliteObjects() {
  process.env.DYPOS_DB_PATH = ':memory:';
  return import('../db/schema.js').then(({ db, migrate }) => {
    migrate();
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name").all().map((r) => norm(r.name));
    const out = { tables: {}, indexes: new Set(indexes) };
    for (const t of tables) {
      const cols = new Set();
      for (const c of db.prepare(`PRAGMA table_info(${t.name})`).all()) cols.add(norm(c.name));
      out.tables[norm(t.name)] = cols;
    }
    try { db.close(); } catch { /* ignore */ }
    return out;
  });
}

function pgObjects() {
  const sql = readFileSync(join(__dirname, '..', 'db', 'schema-postgres.sql'), 'utf8');
  const tables = {};
  const indexes = new Set();
  // CREATE TABLE [IF NOT EXISTS] name ( ... ); — capture balanced parens naively
  const tableRe = /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = tableRe.exec(sql)) !== null) {
    const name = norm(m[1]);
    // Find matching close paren from m.index
    let depth = 0, start = sql.indexOf('(', m.index), end = start;
    for (let i = start; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = sql.slice(start + 1, end);
    const cols = new Set();
    // Top-level comma split (ignore nested parens like NUMERIC(12,2))
    let cur = '', d = 0;
    const parts = [];
    for (const ch of body) {
      if (ch === '(') d++;
      if (ch === ')') d--;
      if (ch === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    for (const p of parts) {
      const t = p.trim();
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(t)) continue;
      const col = norm(t.split(/\s+/)[0]);
      if (col) cols.add(col);
    }
    if (!tables[name]) tables[name] = new Set();
    for (const c of cols) tables[name].add(c);
  }
  // ALTER TABLE x ADD COLUMN [IF NOT EXISTS] col
  const alterRe = /ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi;
  while ((m = alterRe.exec(sql)) !== null) {
    const t = norm(m[1]);
    if (!tables[t]) tables[t] = new Set();
    tables[t].add(norm(m[2]));
  }
  const idxRe = /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi;
  while ((m = idxRe.exec(sql)) !== null) indexes.add(norm(m[1]));
  return { tables, indexes };
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
    if (!pg.tables[t]) { missingTables.push(t); continue; }
    for (const c of cols) {
      // SQLite-only bookkeeping / legacy columns
      if (t === 'users' && c === 'must_change_password' && false) continue;
      if (!pg.tables[t].has(c)) missingColumns.push(`${t}.${c}`);
    }
  }
  const extraTables = Object.keys(pg.tables).filter((t) => !lite.tables[t] && !IGNORED_TABLES.has(t));
  const missingIndexes = [...lite.indexes].filter((i) => !pg.indexes.has(i) && !i.startsWith('sqlite_'));
  const report = {
    ok: missingTables.length === 0 && missingColumns.length === 0 && missingIndexes.length === 0,
    sqlite_tables: Object.keys(lite.tables).length,
    pg_tables: Object.keys(pg.tables).length,
    missingTables, missingColumns, missingIndexes, extraTables,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e).slice(0, 300) }));
  process.exit(2);
}
