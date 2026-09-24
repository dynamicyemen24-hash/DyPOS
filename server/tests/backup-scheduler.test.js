/**
 * Backup refactor regression: runBackup() is import-safe (no process.exit,
 * no closing of the shared live handle) so the production scheduler can
 * call it in-process; the CLI path keeps byte-identical behavior.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workdir = mkdtempSync(join(tmpdir(), 'dypos-backup-'));
process.env.DYPOS_DB_PATH = join(workdir, 'live.db');
process.env.DYPOS_BACKUP_DIR = join(workdir, 'backups');
process.env.DYPOS_BACKUP_RETENTION = '5';

const { runBackup } = await import('../scripts/backup.mjs');
const { default: db, migrate } = await import('../db/schema.js');

before(() => {
  migrate();
  db.prepare(`INSERT INTO users (id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)`)
    .run('sched-u1', 'sched_admin', 'x', 'Sched Admin', 'ADMIN');
});

after(() => {
  try { db.close(); } catch { /* ignore */ }
  rmSync(workdir, { recursive: true, force: true });
});

describe('runBackup() import-safe snapshot', () => {
  it('snapshots, verifies, and leaves the shared handle usable', async () => {
    const r = await runBackup();
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.integrity, 'ok');
    const files = readdirSync(process.env.DYPOS_BACKUP_DIR).filter((f) => f.endsWith('.db'));
    assert.strictEqual(files.length, 1);

    // The live handle must still serve traffic after an in-process backup.
    const row = db.prepare('SELECT username FROM users WHERE id=?').get('sched-u1');
    assert.strictEqual(row?.username, 'sched_admin');

    // Importing the module never auto-runs a backup (no side effects).
    const before = readdirSync(process.env.DYPOS_BACKUP_DIR).length;
    const again = await import('../scripts/backup.mjs');
    assert.strictEqual(typeof again.runBackup, 'function');
    assert.strictEqual(readdirSync(process.env.DYPOS_BACKUP_DIR).length, before);
  });
});
