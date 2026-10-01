/**
 * v30 — currency + UoM catalog parity (POS ⇄ SQLite).
 *
 * The POS ships `CURRENCY_DEFINITIONS` (11 currencies) and `UOM_DEFINITIONS`
 * (~40 units) in `POS/src/utils/uom.js`, but the SQLite seed only created
 * 8 currencies and 12 UoMs. The gap is not cosmetic: `routes/invoices.js`
 * calls `assertCurrency(invCurrency)` and `assertUom(it.uom || 'Unit')`, both
 * of which throw 400 from `lib/fx.js` — so a shop configured for OMR, a cart
 * line in CTN, or a product measured in M² was rejected at submit time with
 * "العملة غير مدعومة" / "وحدة القياس غير مدعومة" after it had already been
 * rung up. `routes/import.js` writes `products.uom` verbatim with no
 * validation, so an import could seed exactly the units that sales reject.
 *
 * Rate convention (documented in lib/fx.js): `rate_to_base` = units of the
 * currency per 1 base unit (SAR). The POS stores the reciprocal ("SAR per 1
 * unit"), so the seed writes `1 / posRate`.
 *
 * Factors are expressed against the SERVER base per category — count→Unit,
 * weight→G, volume→ML, length→MM, area→M², time→s — which preserves the
 * ratios POS defines against its own bases (KG/L/M), because `convertQty`
 * only ever uses the ratio within a category.
 *
 * Signature follows LATE_MIGRATIONS: (db, addColumnIfMissing, {version…}).
 * Everything is INSERT OR IGNORE, so re-running is a no-op and an operator
 * who has already adjusted a rate keeps their value.
 */

// code, name, name_ar, symbol, decimals, rate_to_base (= 1 / POS rate), is_base
const CURRENCIES = [
	['OMR', 'Omani Rial', 'ريال عماني', 'ر.ع.', 3, 0.10256, 0],
	['JOD', 'Jordanian Dinar', 'دينار أردني', 'د.أ', 3, 0.18868, 0],
	['TRY', 'Turkish Lira', 'ليرة تركية', '₺', 2, 8.69565, 0],
	['YER', 'Yemeni Rial', 'ريال يمني', 'ر.ي', 2, 66.5, 0],
];

// code, name, name_ar, category, factor_to_base, is_base
const UOMS = [
	// count → base Unit
	['PAIR', 'Pair', 'زوج', 'count', 2, 0],
	['DZN', 'Dozen', 'دزينة', 'count', 12, 0],
	['GR', 'Gross', 'جراس', 'count', 144, 0],
	['PK', 'Pack', 'حزمة', 'count', 6, 0],
	['CTN', 'Carton', 'كرتون', 'count', 24, 0],
	['PLT', 'Pallet', 'بالت', 'count', 576, 0],
	['ROLL', 'Roll', 'رول', 'count', 1, 0],
	['SET', 'Set', 'مجموعة', 'count', 1, 0],
	['KIT', 'Kit', 'طقم', 'count', 1, 0],
	// weight → base G
	['MG', 'Milligram', 'مجم', 'weight', 0.001, 0],
	['LB', 'Pound', 'رطل', 'weight', 453.592, 0],
	['OZ', 'Ounce', 'أونصة', 'weight', 28.3495, 0],
	// volume → base ML
	['M3', 'Cubic Meter', 'م³', 'volume', 1000000, 0],
	['GAL', 'Gallon', 'جالون', 'volume', 3785.41, 0],
	['QT', 'Quart', 'كوارت', 'volume', 946.353, 0],
	['PT', 'Pint', 'باينت', 'volume', 473.176, 0],
	['BBL', 'Barrel', 'برميل', 'volume', 158987, 0],
	// length → base MM
	['KM', 'Kilometer', 'كم', 'length', 1000000, 0],
	['FT', 'Foot', 'قدم', 'length', 304.8, 0],
	['IN', 'Inch', 'بوصة', 'length', 25.4, 0],
	['YD', 'Yard', 'ياردة', 'length', 914.4, 0],
	// area → base M²
	['M2', 'Square Meter', 'م²', 'area', 1, 1],
	['CM2', 'Square Centimeter', 'سم²', 'area', 0.0001, 0],
	['HA', 'Hectare', 'هكتار', 'area', 10000, 0],
	['ACRE', 'Acre', 'فدان', 'area', 4046.86, 0],
	// time → base second
	['SEC', 'Second', 'ثانية', 'time', 1, 1],
	['MIN', 'Minute', 'دقيقة', 'time', 60, 0],
	['HR', 'Hour', 'ساعة', 'time', 3600, 0],
	['DAY', 'Day', 'يوم', 'time', 86400, 0],
	['WK', 'Week', 'أسبوع', 'time', 604800, 0],
	['MON', 'Month', 'شهر', 'time', 2629746, 0],
	['YR', 'Year', 'سنة', 'time', 31556952, 0],
];

export function migrateCatalogParity(
	db,
	_insertColumn,
	{ version = 30, description = 'currency + UoM catalog parity (POS ⇄ SQLite)' } = {},
) {
	const cur = db.prepare(
		`INSERT OR IGNORE INTO currencies (code,name,name_ar,symbol,decimals,rate_to_base,is_base)
		 VALUES (?,?,?,?,?,?,?)`,
	);
	for (const row of CURRENCIES) cur.run(...row);

	const uom = db.prepare(
		`INSERT OR IGNORE INTO uoms (code,name,name_ar,category,factor_to_base,is_base)
		 VALUES (?,?,?,?,?,?)`,
	);
	for (const row of UOMS) uom.run(...row);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)')
		.run(version, description);
}

export default migrateCatalogParity;
