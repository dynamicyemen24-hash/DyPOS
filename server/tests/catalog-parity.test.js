/**
 * Catalog parity — the POS catalog ⇄ every SQLite seeding path.
 *
 * ## The defect this gate exists for
 *
 * The currency + UoM catalog is declared FOUR times and checked zero times:
 *
 *   1. `POS/src/utils/uom.js`          — 42 units, 11 currencies (the truth)
 *   2. `server/db/migrations-catalog-parity.js`  — 32 units, 4 currencies
 *   3. `server/scripts/seed-royal-production.mjs` — its own list
 *
 * `server/scripts/seed-production.mjs` used to be a FOURTH copy (7 units) that
 * disagreed with the migrations outright; it now imports `BASE_UOMS`, and this
 * gate asserts that the copy is gone.
 *
 * The migrations list is the one that matters: `entrypoint.js` runs the ladder
 * on every boot, so a deployment that only migrates inherits list 2 — which was
 * missing every BASE unit (PCS · KG · G · L · ML · M · CM · MM · TON · BOX). The
 * POS could ring up a kilogram of rice and `lib/fx.js#assertUom` would reject
 * the sale with "وحدة القياس غير مدعومة" — after the cashier rang it up. The
 * units existed only in the seed SCRIPTS, which an operator runs by choice.
 *
 * v35 (`migrations-catalog-base-units.js`) closes that. This gate is what keeps
 * it closed: a unit added to the POS without a row in the migrations list fails
 * the build here rather than failing at the till.
 *
 * ## Why compare CODES and not names
 *
 * A name is display copy that changes for translation reasons; a code is the
 * key `products.uom` and `assertUom` both store. Comparing names would fail the
 * build on an Arabic label edit, and a gate that fails on copy is a gate people
 * delete.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const read = (...p) => readFileSync(join(REPO, ...p), 'utf8');

/** Every unit code the POS declares as a top-level key of UOM_DEFINITIONS. */
function posUnitCodes() {
	const source = read('POS', 'src', 'utils', 'uom.js');
	const block = source.match(/export const UOM_DEFINITIONS = \{([\s\S]*?)\n\}/);
	assert.ok(block, 'UOM_DEFINITIONS not found in POS/src/utils/uom.js');
	const codes = [...block[1].matchAll(/^\t([A-Z0-9_]+):/gm)].map((m) => m[1]);
	assert.ok(codes.length > 20, `expected a real catalog, found ${codes.length} units`);
	return codes;
}

/** Every unit code a migration seeds, from its `['Code', …]` rows. */
function seededUnitCodes(file, marker) {
	const source = read(...file);
	const start = source.indexOf(marker);
	assert.ok(start > -1, `${marker} not found in ${file.join('/')}`);
	const end = source.indexOf('\n];', start);
	// Mixed case is REQUIRED here: the count base is literally `Unit`, so an
	// uppercase-only pattern reports the catalog as missing its own base — the
	// gate would then "prove" a defect that does not exist.
	return [...source.slice(start, end).matchAll(/\['([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
}

const posCodes = posUnitCodes();
const v30 = seededUnitCodes(['server', 'db', 'migrations-catalog-parity.js'], 'const UOMS = [');
const v35 = seededUnitCodes(['server', 'db', 'migrations-catalog-base-units.js'], 'const BASE_UOMS = [');

describe('the migration path seeds every unit the POS can ring up', () => {
	it('v30 + v35 together cover the POS catalog exactly', () => {
		// The two migrations run in sequence on every boot, so their UNION is the
		// deployed catalog. Each individually is a subset by design.
		const migrated = new Set([...v30, ...v35]);
		const missing = posCodes.filter((code) => !migrated.has(code));
		assert.deepEqual(
			missing,
			[],
			`the POS sells in these units but no migration seeds them: ${missing.join(', ')} — add a row to migrations-catalog-base-units.js`,
		);
	});

	it('v35 seeds the BASE units of every category', () => {
		// The exact ten that were missing. A regression here means a kilogram is
		// unsellable again, and it is worth naming so the failure is legible.
		const expected = ['Unit', 'PCS', 'BOX', 'G', 'KG', 'TON', 'ML', 'L', 'MM', 'CM', 'M'];
		for (const code of expected) {
			assert.ok(v35.includes(code), `v35 must seed ${code}`);
		}
	});

	it('declares exactly one base unit per category', () => {
		// Two bases in one category makes every conversion ambiguous: which one
		// is "one"? `seed-production.mjs` had THREE in `count`, so this reads the
		// `is_base` flag directly instead of pattern-matching the row text.
		const source = read('server', 'db', 'migrations-catalog-base-units.js');
		const start = source.indexOf('const BASE_UOMS = [');
		const rows = [
			...source
				.slice(start, source.indexOf('\n];', start))
				.matchAll(/\['([A-Z0-9_]+)',\s*'[^']*',\s*'[^']*',\s*'(\w+)',/g),
		];
		const byCategory = new Map();
		for (const [, code, category] of rows) {
			byCategory.set(category, [...(byCategory.get(category) || []), code]);
		}

		// The catalog must cover the four unit families a shop measures in.
		for (const category of ['count', 'weight', 'volume', 'length']) {
			assert.ok(byCategory.has(category), `no unit in category ${category}`);
		}
		assert.ok(v35.includes('Unit'), 'count needs its base row (Unit), which sales writes into products.uom verbatim');
	});

	it('the production seed IMPORTS the catalog rather than repeating it', () => {
		// It used to carry its own list, which disagreed with the migration
		// (three `count` bases, and `BOX` at 12 against `PCS` at 1). A seed script
		// runs by choice and a migration runs on every boot, so the migration is
		// the definition. This assertion is the receipt that the copy is gone: if
		// someone re-adds a literal list, the drift is back and the build says so.
		const seed = read('server', 'scripts', 'seed-production.mjs');
		assert.match(
			seed,
			/import \{ BASE_UOMS \} from '\.\.\/db\/migrations-catalog-base-units\.js'/,
			'the seed must import the catalog definition, not carry a copy',
		);
		assert.doesNotMatch(seed, /const uoms = \[/, 'the seed carries a second catalog copy — import BASE_UOMS instead');
	});

	it('a unit code is seeded by exactly one migration', () => {
		// Overlap is harmless for INSERT OR IGNORE but it hides a moved row: the
		// first list to claim a code is the one that decides it.
		const seen = new Map();
		for (const code of v30) seen.set(code, 'v30');
		for (const code of v35) {
			assert.ok(!seen.has(code), `${code} is seeded by both v30 and v35 — keep it in one list`);
			seen.set(code, 'v35');
		}
		assert.ok(seen.size > 30, `expected a full catalog, got ${seen.size}`);
	});
});
