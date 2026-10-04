/**
 * v35 — the base units, seeded by MIGRATION rather than by a seed script.
 *
 * ## The defect this closes
 *
 * `migrations-catalog-parity.js` (v30) seeded 32 units. The POS ships 42 in
 * `POS/src/utils/uom.js`. The ten missing ones are not exotic:
 *
 *     PCS · BOX · KG · G · TON · L · ML · M · CM · MM
 *
 * They are the COUNT, WEIGHT, VOLUME and LENGTH BASE units — the ones a shop
 * cannot ring up a single item without. They existed only inside the seed
 * SCRIPTS (`seed-production.mjs`, `seed-royal-production.mjs`), which an
 * operator runs once by choice.
 *
 * So a deployment that migrates (the path `entrypoint.js` takes on every boot,
 * and the path CI and `npm run e2e:yaqoub` take) ends up with a `uoms` table
 * that sales REJECT: `lib/fx.js#assertUom` throws 400 "وحدة القياس غير مدعومة"
 * for a kilogram of rice, after the cashier has rung it up. The deployment that
 * "passed" is the one that also ran a seed script by hand.
 *
 * ## Why a migration and not another seed row
 *
 * Because the seed scripts are optional and the migration is not. A unit the
 * POS can ring up must exist in every database that reached this version, so it
 * belongs in the version ladder where `npm run migrate` and the container boot
 * both reach it.
 *
 * ## One source, not a fourth copy
 *
 * The catalog is repeated across four files today (POS `uom.js`, v30, two seed
 * scripts) and nothing checked they agreed. `tests/catalog-parity.test.js` now
 * does, and it reads THIS list — so the next unit added to the POS without a
 * row here fails the build instead of failing at the till.
 *
 * Every statement is `INSERT OR IGNORE`, so re-running is a no-op and an operator
 * who adjusted a factor keeps their value.
 */

// code, name, name_ar, category, factor_to_base, is_base
// The factors are against the SERVER base per category (count→Unit,
// weight→G, volume→ML, length→MM), matching v30's convention, so a POS-side
// ratio against its own bases (KG/L/M) preserves exactly.
//
// Exactly ONE base per category. `seed-production.mjs` marked THREE rows in
// `count` as base — `Unit`, `PCS` and `Set` all with factor 1 — which makes
// every count conversion ambiguous ("one what?"), and it gave `BOX` a factor of
// 12 while `PCS` is 1, so the same carton priced per piece vs per box disagreed
// by 12x. Both are fixed here; the seed script now agrees with this list rather
// than the other way round, because a migration runs on every boot and a seed
// script runs by choice.
const BASE_UOMS = [
	// count → base Unit
	['Unit', 'Unit', 'وحدة', 'count', 1, 1],
	['PCS', 'Pieces', 'قطع', 'count', 1, 0],
	['BOX', 'Box', 'كرتون', 'count', 1, 0],
	['DOZEN', 'Dozen', 'دزينة', 'count', 12, 0],
	// weight → base G
	['G', 'Gram', 'جرام', 'weight', 1, 1],
	['KG', 'Kilogram', 'كيلوجرام', 'weight', 1000, 0],
	['TON', 'Tonne', 'طن', 'weight', 1000000, 0],
	// volume → base ML
	['ML', 'Millilitre', 'ملليلتر', 'volume', 1, 1],
	['L', 'Litre', 'لتر', 'volume', 1000, 0],
	// length → base MM
	['MM', 'Millimetre', 'ميليمتر', 'length', 1, 1],
	['CM', 'Centimetre', 'سنتيمتر', 'length', 10, 0],
	['M', 'Metre', 'متر', 'length', 1000, 0],
];

export function migrateCatalogBaseUnits(
	db,
	_addColumnIfMissing,
	{ version = 35, description = 'catalog base units (count/weight/volume/length)' } = {},
) {
	const insert = db.prepare(
		`INSERT OR IGNORE INTO uoms (code,name,name_ar,category,factor_to_base,is_base)
		 VALUES (?,?,?,?,?,?)`,
	);
	for (const row of BASE_UOMS) insert.run(...row);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export { BASE_UOMS };
export default migrateCatalogBaseUnits;
