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
	// 745 → 851 → **840** — the round's one deliberate move, and it is not
	// growth. `formatter.enabled` came on for the server (server/biome.json),
	// so `biome format --write` reflowed every file: the hand-packed
	// statements (multi-clause one-liners) became one clause per line, which
	// is MORE lines for the SAME statements. Settling at 840 = the measured
	// number after `lineWidth` moved 100 → 120 (see the note at the top of
	// this file: a 100-column reflow SPLIT member chains such as
	// `(await req(...)).body\n  .token;`, which is not a formatting choice —
	// it silently reassigns the expression to nothing. That broke 5 test
	// suites with HTTP 401s and was the reason lineWidth is 120.)
	// The contract still holds: no growth from here, and the next migration
	// is still expected to leave for db/migrations-*.js.
	// 840 → 830: v34 joined as one import + one registry row, funded by reflowing
	// the v27/v28/v29 entries to the single-line shape v30–v33 already use.
	// Net −10, measured — the ratchet's direction still holds from here.
	['db/schema.js', 830],
	// 3907 → 3784: same story, smaller. The router shrank (doctypes, the
	// mappers, the tenant table set and the voucher projection each left for
	// their own module) and the cap never followed. Re-measured, not guessed.
	// 3784 → 5238 → 4911 — formatter reflow, same cause as db/schema.js: the
	// router was hand-packed at ~2.4 statements per line, and 120 columns
	// recovers part of that. The router splits already done (doctypes /
	// method-payloads / method-i18n) are unaffected.
	// 4911 → 4915: `has_permission` now reports the tenant alongside the flag,
	// so the client can scope its UI without a second round trip. Four lines of
	// behaviour, measured — the ratchet's direction still holds from here.
	// 4915 → 4912: coupon/offer deletes became is_active retires with trail rows,
	// stale drafts EXPIRE via lib/invoice-expiry.js (policy extracted, verb stays
	// thin), and dypos.delete_doc refuses tables with no status flag instead of
	// destroying them. Net −3, measured — the ratchet's direction holds.
	['routes/method.js', 4903],
	// 881 → 888, the one deliberate raise in this release: tenant-scoped
	// idempotency lookups and the non-cash overpayment guard. The guard itself was
	// extracted to lib/payment-invariants.js, so the next payment rule lands
	// there instead of here.
	// 888 → 1546 → 1428 — formatter reflow, same cause. Long SQL template
	// strings were packed several per line; each now occupies its own.
	// 1428 → 1400: the daily Z report left for routes/invoice-daily.js (with
	// tenant isolation on both aggregates), mounted first via router.use so
	// /reports/daily still beats /:id on the same mount point.
	['routes/invoices.js', 1400],
	['routes/invoice-daily.js', 65],
	// 615 → 601: the two rate limiters (global + auth) moved to
	// middleware/rate-limiters.js, and HEALTH_PATHS to lib/health-paths.js so the
	// limiter and the request logger exempt exactly the same three probes.
	// Passkeys then stopped costing server.js a mount point at all: they hang
	// off routes/auth.js, where the auth limiter already applies — so adding a
	// biometric ceremony no longer grows this file. The cap moves down only.
	// 601 → 723 → 693 — formatter reflow, same cause as db/schema.js.
	['server.js', 693],
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
