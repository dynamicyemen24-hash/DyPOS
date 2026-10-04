/**
 * The migration ladder is the single source of the schema version.
 *
 * ## The defect this gate exists for
 *
 * `db/schema.js` carried `const MIGRATION_VERSION = 34; // Increment when schema
 * changes`. That comment was the bug: registering a migration in the ladder was
 * ONE edit, and updating the number that decides whether it RUNS was a second,
 * separate, easy-to-forget edit in a different file.
 *
 * Nothing checked the two against each other. So v35 could be added to the
 * ladder, wired into `schema.js`, sit in the import graph, be fully connected —
 * and still never execute on any deployment, while every suite reported green.
 * That is the exact class of failure invariant 5 exists to prevent (DDL single
 * source), and it reached production-sized schema changes unnoticed.
 *
 * The number is now `reduce(max)` over the ladder, so the two cannot diverge.
 * These assertions keep that true and keep the ladder honest.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LATE_MIGRATIONS } from '../db/migration-ladder.js';

describe('the migration ladder', () => {
	it('is a real, non-empty, strictly ascending ladder', () => {
		assert.ok(LATE_MIGRATIONS.length >= 13, 'the v23+ ladder lost rows');
		for (let i = 1; i < LATE_MIGRATIONS.length; i += 1) {
			assert.ok(
				LATE_MIGRATIONS[i].version > LATE_MIGRATIONS[i - 1].version,
				`version ${LATE_MIGRATIONS[i].version} does not follow ${LATE_MIGRATIONS[i - 1].version} — migrate() applies in array order and stops at the first row not above the recorded version`,
			);
		}
	});

	it('every row is callable and carries a note', () => {
		// A row whose `run` is undefined registers without running; a row with no
		// note is how the next reader cannot tell what it was for.
		for (const row of LATE_MIGRATIONS) {
			assert.equal(typeof row.run, 'function', `v${row.version} has no callable run()`);
			assert.ok(row.note?.length > 5, `v${row.version} needs a note`);
			assert.ok(Number.isInteger(row.version) && row.version > 0, `v${row.version} is not a positive integer`);
		}
	});

	it('exports no duplicate version', () => {
		const seen = new Set();
		for (const row of LATE_MIGRATIONS) {
			assert.ok(!seen.has(row.version), `v${row.version} is registered twice`);
			seen.add(row.version);
		}
	});

	it('MIGRATION_VERSION equals the highest ladder version', async () => {
		// The assertion the "Increment when schema changes" comment could not make:
		// the version the code PROMISES and the ladder it APPLIES are one number.
		const highest = LATE_MIGRATIONS.reduce((h, { version }) => Math.max(h, version), 0);
		const schema = await import('../db/schema.js');
		assert.strictEqual(schema.MIGRATION_VERSION, highest);
	});
});
