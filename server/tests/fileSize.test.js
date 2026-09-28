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
  // the duplicated VAT split out of five call sites. Caps are the measured
  // sizes after each extraction — the ratchet bites again from here.
  ['routes/method.js', 4001],
  ['db/schema.js', 1039],
  ['routes/invoices.js', 881],
  ['server.js', 639],
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
