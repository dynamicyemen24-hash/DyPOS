#!/usr/bin/env node
/**
 * DyPOS Server Entrypoint
 * 1. Applies a staged restore first (if data/restore.pending exists):
 *    verifies the backup copy, swaps it in BEFORE any handle opens the live
 *    DB (safe on Windows file locks), then removes the marker.
 * 2. Runs database migrations.
 * 3. Starts the server.
 */
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DYPOS_DB_PATH && process.env.DYPOS_DB_PATH !== ':memory:'
  ? dirname(process.env.DYPOS_DB_PATH)
  : join(__dirname, 'data');
const DB_PATH = process.env.DYPOS_DB_PATH || join(__dirname, 'data', 'dypos.db');
const PENDING = join(DATA_DIR, 'restore.pending');

// ── Staged restore (written by POST /api/admin/restore) ──
if (DB_PATH !== ':memory:' && existsSync(PENDING)) {
  console.log('[DyPOS] Staged restore found. Verifying before swap...');
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(PENDING, 'utf8').replace(/^﻿/, '');
    const { file } = JSON.parse(raw);
    const backupDir = process.env.DYPOS_BACKUP_DIR || join(__dirname, 'data', 'backups');
    const staged = join(backupDir, basename(String(file || '')));
    if (!staged.startsWith(backupDir) || !existsSync(staged)) {
      throw new Error('staged backup missing or outside backup dir');
    }
    // Verify the COPY with a throwaway handle (live DB untouched)
    const probe = new DatabaseSync(staged, { readOnly: true });
    try {
      const integ = Object.values(probe.prepare('PRAGMA integrity_check').get())[0];
      if (integ !== 'ok') throw new Error(`integrity_check=${integ}`);
      probe.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
    } finally {
      probe.close();
    }
    // Atomic-ish swap: keep a pre-restore copy for rollback
    const rollback = join(DATA_DIR, `pre-restore-${Date.now()}.db`);
    if (existsSync(DB_PATH)) renameSync(DB_PATH, rollback);
    try {
      renameSync(staged, DB_PATH);
    } catch (e) {
      if (existsSync(rollback)) renameSync(rollback, DB_PATH);
      throw e;
    }
    unlinkSync(PENDING);
    console.log(`[DyPOS] Restore applied. Pre-restore copy kept at ${basename(rollback)} (prune manually).`);
  } catch (e) {
    console.error('[DyPOS FATAL] Staged restore failed safely (live DB untouched):', e.message);
    process.exit(1);
  }
}

const { migrate } = await import('./db/schema.js');

console.log('[DyPOS] Running database migrations...');
try {
  migrate();
  console.log('[DyPOS] Migrations complete. Starting server...');
} catch (e) {
  console.error('[DyPOS FATAL] Migration failed:', e.message);
  process.exit(1);
}

// Import and start server (explicit start: the isMainModule heuristic inside
// server.js is false when imported, so entrypoint must call start() itself)
import('./server.js').then((m) => m.start()).catch((err) => {
  console.error('[DyPOS FATAL] Failed to start server:', err.message);
  process.exit(1);
});
