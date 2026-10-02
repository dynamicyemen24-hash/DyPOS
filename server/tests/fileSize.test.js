/**
 * Server file-size ratchet — the same contract as POS/tests/fileSize.test.js.
 *
 * `routes/method.js` is the method router: every verb, alias and compatibility
 * shim lands there, so it is the file most likely to grow silently. Capping it
 * turns "split this someday" into a rule the suite enforces.
 *
 * Caps only move DOWN. Extract a router module, then lower the number here in
 * the same commit.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SERVER = resolve(import.meta.dirname, '..');

/** [file, maxLines] — measured. */
const CAPS = [
  // Extracted this release: routes/doctypes.js took the doctype specs +
  // coupon projection out of the router; db/migrations-tenancy.js took the v8
  // tenancy migration out of the schema; lib/money.js#computeLineMinor took
  // the duplicated VAT split out of five call sites.
  //
  // Extracted again for opening balances (v25): routes/method-payloads.js took
  // the Frappe⇄POS invoice/item/payment mappers out of the router and
  // lib/tenant-tables.js took the tenant-scoped TABLE SET with it, so adding
  // both a feature and its table to the registry did NOT raise a cap
  // (4001 → 3921 → 3905).
  //
  // db/schema.js dropped 1039 → 1038 for the same reason: the v23 promotions and
  // v24 invoice-return migrations moved to db/migrations-promotion-tenancy.js
  // and db/migrations-invoice-returns.js, joining db/migrations-opening-balances.js.
  // It then dropped again (1038 → 1033) when adding a migration stopped costing a
  // copy-pasted try/catch block: db/schema.js now runs v23+ from one LATE_MIGRATIONS
  // table, so db/migrations-opening-balance-items.js (v26) joined the registry as
  // one data row instead of ten lines.
  //
  // Raised once, and deliberately, for v27 + v28 (1033 → 1037): both are real
  // financial-integrity migrations (tenant-scoped invoice idempotency, one OPEN
  // shift per terminal). At four lines each — one import and one registry row —
  // they are already at the floor the table-driven runner allows.
  //
  // 1037 → 745: **the cap was stale, and a stale cap measures nothing.** The
  // file had already shrunk — migrations moved out, then the split registry —
  // while the number stayed behind, so this ratchet has been green through
  // 292 lines of unmeasured growth: the exact failure this file exists to
  // prevent, hidden inside the file that prevents it. Caps follow the measured
  // line, never the last number somebody remembered.
  ['db/schema.js', 745],
  // 3907 → 3784: same story, smaller. The router shrank (doctypes, the
  // mappers, the tenant table set and the voucher projection each left for
  // their own module) and the cap never followed. Re-measured, not guessed.
  ['routes/method.js', 3784],
  // 881 → 888, the one deliberate raise in this release: tenant-scoped
  // idempotency lookups and the non-cash overpayment guard. The guard itself was
  // extracted to lib/payment-invariants.js, so the next payment rule lands
  // there instead of here.
  ['routes/invoices.js', 888],
  // 615 → 601: the two rate limiters (global + auth) moved to
  // middleware/rate-limiters.js, and HEALTH_PATHS to lib/health-paths.js so the
  // limiter and the request logger exempt exactly the same three probes.
  // Passkeys then stopped costing server.js a mount point at all: they hang
  // off routes/auth.js, where the auth limiter already applies — so adding a
  // biometric ceremony no longer grows this file. The cap moves down only.
  ['server.js', 601],
];

function countLines(rel) {
  const text = readFileSync(join(SERVER, rel), 'utf8');
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

describe('server file-size ratchet', () => {
  for (const [rel, cap] of CAPS) {
    it(`${rel} stays at or under ${cap} lines`, () => {
      const actual = countLines(rel);
      assert.ok(
        actual <= cap,
        `${rel} is ${actual} lines (cap ${cap}). Extract a module and lower the cap in server/tests/fileSize.test.js.`,
      );
    });
  }
});
