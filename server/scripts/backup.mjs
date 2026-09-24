#!/usr/bin/env node
/**
 * DyPOS Backup — online SQLite snapshot (production-safe).
 * - Uses VACUUM INTO (consistent snapshot, readers not blocked).
 * - Verifies with PRAGMA integrity_check on the COPY (never touches live DB).
 * - Retention: keeps last N (default 7 daily + 4 weekly via filename day).
 * - Optional S3 upload when DYPOS_BACKUP_S3=s3://bucket/prefix (uses AWS CLI).
 * - --json prints machine-readable result (used by POST /api/admin/backup).
 *
 * Run: npm run backup  |  node scripts/backup.mjs [--json]
 * Cron: 0 2 * * * cd /app/server && node scripts/backup.mjs >> /var/log/dypos-backup.log 2>&1
 */
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const asJson = process.argv.includes('--json');
const DB_PATH = process.env.DYPOS_DB_PATH || join(__dirname, '..', 'data', 'dypos.db');
const BACKUP_DIR = process.env.DYPOS_BACKUP_DIR || join(__dirname, '..', 'data', 'backups');
const RETENTION = Math.max(1, Number(process.env.DYPOS_BACKUP_RETENTION) || 7);

function log(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), service: 'dypos-backup', ...obj });
  if (asJson) process.stdout.write(line + '\n');
  else console.log(line);
}

/**
 * Online snapshot + verify + retention. Import-safe: unlike the legacy
 * top-level main(), it never calls process.exit and — with
 * closeAfter:false (default) — never closes the shared live handle, so the
 * production scheduler can call it in-process.
 */
export async function runBackup({ closeAfter = false } = {}) {
  if (DB_PATH === ':memory:') throw new Error('Refusing to back up :memory: database');
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(BACKUP_DIR, `dypos-${stamp}.db`);

  // 1) Snapshot — import schema.js for the live handle and run the full
  //    migration first. schema.js does NOT self-migrate on import (server.js /
  //    entrypoint.js / db/migrate.js call migrate() explicitly), so a fresh
  //    checkout would otherwise VACUUM an empty database and the subsequent
  //    restore drill would fail with "no such table: invoices".
  const { default: db, migrate } = await import('../db/schema.js');
  migrate();
  const requiredTables = ['invoices', 'invoice_items', 'payments', 'products', 'users', 'schema_version'];
  const missingTables = requiredTables.filter(
    (t) => !db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(t),
  );
  if (missingTables.length) {
    throw new Error(`Backup aborted: schema incomplete after migrate() — missing tables: ${missingTables.join(', ')}`);
  }
  const safePath = file.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safePath}'`);
  const size = statSync(file).size;

  // 2) Verify the COPY (open separately so live DB is untouched)
  const { DatabaseSync } = await import('node:sqlite');
  const copy = new DatabaseSync(file, { readOnly: true });
  let integrity = 'unknown';
  try {
    const row = copy.prepare('PRAGMA integrity_check').get();
    integrity = Object.values(row)[0];
  } finally {
    copy.close();
  }
  if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);

  // 3) Retention — keep newest N
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('dypos-') && f.endsWith('.db'))
    .map((f) => ({ f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  let pruned = 0;
  for (const extra of files.slice(RETENTION)) {
    unlinkSync(join(BACKUP_DIR, extra.f));
    pruned++;
  }

  // 4) Optional S3 upload (fire-and-forget, never fail the local backup)
  let s3 = null;
  if (process.env.DYPOS_BACKUP_S3) {
    const dest = `${process.env.DYPOS_BACKUP_S3.replace(/\/$/, '')}/${basename(file)}`;
    try {
      await new Promise((resolve, reject) => {
        execFile('aws', ['s3', 'cp', file, dest], { timeout: 120000 }, (err) => (err ? reject(err) : resolve()));
      });
      s3 = dest;
    } catch (e) {
      s3 = `FAILED: ${String(e.message).slice(0, 200)}`;
    }
  }

  const result = { ok: true, file, size_bytes: size, integrity, retained: Math.min(files.length, RETENTION), pruned, s3 };
  if (closeAfter) {
    try { db.close(); } catch { /* ignore */ }
  }
  return result;
}

// CLI entry — identical behavior to the legacy script (JSON + exit codes).
// Importing the module (scheduler, tests) has zero side effects.
const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch { return false; }
})();
if (invokedDirectly) {
  runBackup({ closeAfter: true }).then(
    (result) => { log(result); process.exit(0); },
    (e) => { log({ ok: false, error: String(e?.message || e).slice(0, 500) }); process.exit(1); },
  );
}
