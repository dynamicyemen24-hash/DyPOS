/**
 * Stale-draft expiry — retire, never delete.
 *
 * Unit-proves lib/invoice-expiry.js against an in-memory ledger: a stale DRAFT
 * flips to EXPIRED with its lines kept, a fresh DRAFT keeps working, a posted
 * invoice is untouched, and every expiry leaves one EXPIRE trail row. The HTTP
 * verb (`cleanup_old_drafts`) only asserts the count shape; the behaviour —
 * nothing is ever destroyed — is pinned here.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import db from '../db/schema.js';
import { expireStaleDrafts } from '../lib/invoice-expiry.js';

const req = { user: { id: 'u1', username: 'tester' }, ip: '127.0.0.1' };

before(() => {
	// The app's wrapped handle (better-sqlite3-compatible driver), not raw
	// node:sqlite: the policy uses db.transaction(), which only the wrapper
	// provides — the test must exercise the same surface production does.
	db.exec(`
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      user_id TEXT,
      username TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
	db.prepare(
		`INSERT INTO invoices (id, status, created_at) VALUES ('stale-1', 'DRAFT', datetime('now', '-2 hours'))`,
	).run();
	db.prepare(`INSERT INTO invoices (id, status, created_at) VALUES ('fresh-1', 'DRAFT', datetime('now'))`).run();
	db.prepare(
		`INSERT INTO invoices (id, status, created_at) VALUES ('posted-1', 'UNPAID', datetime('now', '-5 hours'))`,
	).run();
});

describe('expireStaleDrafts', () => {
	it('expires only the stale draft and reports the count', () => {
		const out = expireStaleDrafts(db, req, 1);
		assert.strictEqual(out.expired, 1);
		assert.strictEqual(out.maxAgeHours, 1);
		assert.strictEqual(db.prepare(`SELECT status FROM invoices WHERE id='stale-1'`).get().status, 'EXPIRED');
		assert.strictEqual(db.prepare(`SELECT status FROM invoices WHERE id='fresh-1'`).get().status, 'DRAFT');
		assert.strictEqual(db.prepare(`SELECT status FROM invoices WHERE id='posted-1'`).get().status, 'UNPAID');
	});

	it('keeps the expired header row (nothing is destroyed)', () => {
		assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 3);
	});

	it('leaves one EXPIRE trail row per retired draft', () => {
		const rows = db.prepare('SELECT entity_type, entity_id, action, username FROM audit_trail').all();
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].entity_type, 'INVOICE');
		assert.strictEqual(rows[0].entity_id, 'stale-1');
		assert.strictEqual(rows[0].action, 'EXPIRE');
		assert.strictEqual(rows[0].username, 'tester');
	});

	it('a second sweep finds nothing (idempotent)', () => {
		const out = expireStaleDrafts(db, req, 1);
		assert.strictEqual(out.expired, 0);
		assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM audit_trail').get().c, 1);
	});
});
