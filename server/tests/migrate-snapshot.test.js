/**
 * Pre-migration snapshot regression: snapshotForMigration() returns null
 * when there is nothing to protect (current version), and an
 * integrity-verified snapshot path when the database is behind the code —
 * the entrypoint's rollback insurance. migrate() afterwards heals the gap.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const workdir = mkdtempSync(join(tmpdir(), 'dypos-snap-'));
process.env.DYPOS_DB_PATH = join(workdir, 'live.db');
const backupDir = join(workdir, 'backups');

const schema = await import('../db/schema.js');
const { migrate, snapshotForMigration, MIGRATION_VERSION, default: db } = schema;

before(() => {
  migrate();
});

after(() => {
  try { db.close(); } catch { /* ignore */ }
  rmSync(workdir, { recursive: true, force: true });
});

describe('snapshotForMigration()', () => {
  it('returns null when the database is current', () => {
    assert.strictEqual(snapshotForMigration(backupDir), null);
  });

  it('snapshots a behind database, verifies the copy, then migrate() heals', () => {
    const maxRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
    const top = Number(maxRow?.v);
    assert.ok(top > 0, 'migrated test db has versions');
    db.prepare('DELETE FROM schema_version WHERE version=?').run(top);

    const snap = snapshotForMigration(backupDir);
    assert.ok(snap, 'snapshot path returned for a behind database');
    assert.ok(existsSync(snap), 'snapshot file exists');
    assert.ok(snap.includes(`pre-migrate-v${top - 1}-to-v${MIGRATION_VERSION}`), `name carries versions: ${snap}`);

    const probe = new DatabaseSync(snap, { readOnly: true });
    try {
      assert.strictEqual(Object.values(probe.prepare('PRAGMA integrity_check').get())[0], 'ok');
      const snapVer = Number(probe.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v);
      assert.strictEqual(snapVer, top - 1, 'snapshot predates the healed version');
    } finally {
      probe.close();
    }

    migrate();
    const healed = Number(db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v);
    assert.strictEqual(healed, MIGRATION_VERSION, 'migrate() re-applies the removed version');

    assert.strictEqual(snapshotForMigration(backupDir), null, 'current again → null');
    const files = readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    assert.strictEqual(files.length, 1, 'exactly one snapshot was taken');
  });
});
