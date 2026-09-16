#!/usr/bin/env node
/**
 * DyPOS Restore Drill — automated backup verification (SRE best practice).
 * Opens the NEWEST backup read-only (live DB untouched) and asserts:
 *  - PRAGMA integrity_check = ok
 *  - core tables readable + schema_version matches expected floor
 *
 * Run: npm run backup:verify [-- --expect-invoices 500 --min-version 3]
 * CI:  runs after `npm run backup` (see .github/workflows/ci.yml).
 * Exit: 0 verified · 1 failed.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);
const BACKUP_DIR = process.env.DYPOS_BACKUP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'backups');
const MIN_VERSION = Number(args['min-version'] || 3);
const EXPECT_INVOICES = args['expect-invoices'] != null ? Number(args['expect-invoices']) : null;

function fail(reason) {
  console.log(JSON.stringify({ ok: false, error: reason }));
  process.exit(1);
}

let files;
try {
  files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('dypos-') && f.endsWith('.db'))
    .map((f) => ({ f, m: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
} catch {
  fail(`backup dir unreadable: ${BACKUP_DIR}`);
}
if (!files.length) fail(`no backups in ${BACKUP_DIR} — run npm run backup first`);

const file = join(BACKUP_DIR, files[0].f);
const db = new DatabaseSync(file, { readOnly: true });
try {
  const integrity = Object.values(db.prepare('PRAGMA integrity_check').get())[0];
  if (integrity !== 'ok') fail(`integrity_check=${integrity}`);
  const tables = ['invoices', 'invoice_items', 'payments', 'products', 'users'];
  const counts = {};
  for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()?.version || 0;
  if (version < MIN_VERSION) fail(`schema_version=${version} < ${MIN_VERSION}`);
  if (EXPECT_INVOICES != null && counts.invoices < EXPECT_INVOICES) {
    fail(`invoices=${counts.invoices} < expected ${EXPECT_INVOICES}`);
  }
  console.log(JSON.stringify({ ok: true, file: files[0].f, integrity, version, counts }));
  process.exit(0);
} catch (e) {
  fail(String(e?.message || e).slice(0, 300));
} finally {
  try { db.close(); } catch { /* ignore */ }
}
