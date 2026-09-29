import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../db/schema.js';
import { ensureOpenFiscalPeriod } from '../routes/fiscal.js';

const code = '9901';

db.exec(`CREATE TABLE IF NOT EXISTS fiscal_years (code TEXT PRIMARY KEY, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', closed_by TEXT, closed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

after(() => {
  try { db.prepare('DELETE FROM fiscal_years WHERE code=?').run(code); } catch {}
});

describe('Fiscal period resolution', () => {
  it('resolves a custom date-ranged fiscal period instead of calendar year', () => {
    db.prepare('DELETE FROM fiscal_years WHERE code=?').run(code);
    db.prepare("INSERT INTO fiscal_years (code,starts_on,ends_on,status) VALUES (?,?,?,'OPEN')")
      .run(code, '2026-07-01', '2027-06-30');

    const period = ensureOpenFiscalPeriod(new Date('2027-02-15T12:00:00Z'));
    assert.equal(period.code, code);
    assert.equal(period.starts_on, '2026-07-01');
    assert.equal(period.ends_on, '2027-06-30');
  });

  it('rejects posting into a closed custom fiscal period', () => {
    db.prepare('UPDATE fiscal_years SET status=? WHERE code=?').run('CLOSED', code);
    assert.throws(
      () => ensureOpenFiscalPeriod(new Date('2027-02-15T12:00:00Z')),
      (error) => error?.statusCode === 409,
    );
  });
});
