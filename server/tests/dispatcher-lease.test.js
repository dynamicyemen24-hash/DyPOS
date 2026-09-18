/**
 * Dispatcher leader-lease regression test (C4).
 * Exercises the exact acquire/renew/steal semantics used by
 * lib/webhooks.js tryAcquireLeadership() against dispatcher_lock (v12):
 *  - free lease → acquire succeeds
 *  - held lease → second owner is refused
 *  - holder renews its own lease
 *  - expired lease → stolen by the next contender
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';

import '../server.js'; // boots app → migrate() creates dispatcher_lock (v12)
import db from '../db/schema.js';

function acquire(owner) {
  const r = db.prepare(
    `UPDATE dispatcher_lock SET owner=?, lease_until=datetime('now', ?), updated_at=datetime('now')
     WHERE id=1 AND (lease_until IS NULL OR lease_until <= datetime('now') OR owner=?)`
  ).run(owner, '+20 seconds', owner);
  return r.changes === 1;
}

before(() => {
  db.prepare("UPDATE dispatcher_lock SET owner=NULL, lease_until=NULL WHERE id=1").run();
});

describe('Dispatcher leader lease (C4)', () => {
  it('free lease is acquired', () => {
    assert.strictEqual(acquire('owner-A'), true);
  });

  it('held lease refuses a second owner', () => {
    assert.strictEqual(acquire('owner-B'), false);
  });

  it('holder renews its own lease', () => {
    assert.strictEqual(acquire('owner-A'), true);
    assert.strictEqual(acquire('owner-B'), false);
  });

  it('expired lease is stolen by the next contender', () => {
    db.prepare("UPDATE dispatcher_lock SET lease_until=datetime('now', '-1 minute') WHERE id=1").run();
    assert.strictEqual(acquire('owner-B'), true);
    assert.strictEqual(acquire('owner-A'), false);
    db.prepare("UPDATE dispatcher_lock SET owner=NULL, lease_until=NULL WHERE id=1").run();
  });
});
