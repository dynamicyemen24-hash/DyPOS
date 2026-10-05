/**
 * حارس بذرة العينة — يفرق بين بيانات المشترك وbaselines الترحيل.
 *
 * الدرس المدفوع: الحارس القديم رفض أي صف في 17 جدولًا، لكن الترحيلات نفسها
 * تبذر baselines (`ONLY W-01` في warehouses، وإعدادات business_settings،
 * والعملات والوحدات) — فالتدفق الموثق (migrate ثم seed) كان مرفوضًا دائمًا
 * على أي قاعدة جديدة. الحارس الآن يرفض فقط ما يثبت وجود مشترك حقيقي.
 */

// وجود صف واحد هنا = قاعدة مشترك عاملة: المساس بها مرفوض دائمًا.
const FATAL_TABLES = [
	'tenants',
	'organizations',
	'branches',
	'users',
	'api_keys',
	'customers',
	'products',
	'invoices',
	'stock_levels',
	'invoice_sequences',
];

// baselines يبذرها الترحيل بالتصميم، والبذرة الملكية تُدخلها upsert بمفاتيح
// ثابتة (لا حذف أبدًا) — فوجودها لا يمنع البذر الآمن.
const BASELINE_TABLES = ['business_settings', 'warehouses', 'currencies', 'uoms', 'fiscal_years', 'zatca_settings'];

function countRows(db, table) {
	return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

export function assertSafeRoyalDemoSeed(db, { nodeEnv = process.env.NODE_ENV } = {}) {
	if (nodeEnv === 'production') {
		throw new Error('Refusing sample seed: NODE_ENV=production.');
	}

	const fatal = Object.fromEntries(FATAL_TABLES.map((table) => [table, countRows(db, table)]));
	const occupiedFatal = Object.entries(fatal)
		.filter(([, count]) => count > 0)
		.map(([table, count]) => `${table}=${count}`);

	if (occupiedFatal.length > 0) {
		throw new Error(`Refusing sample seed: database already contains subscriber data (${occupiedFatal.join(', ')}).`);
	}

	const baseline = Object.fromEntries(BASELINE_TABLES.map((table) => [table, countRows(db, table)]));
	const occupiedBaseline = Object.entries(baseline)
		.filter(([, count]) => count > 0)
		.map(([table, count]) => `${table}=${count}`);

	return { fatal, baseline, baselineNote: occupiedBaseline };
}

export const GUARDED_TABLES = Object.freeze([...FATAL_TABLES, ...BASELINE_TABLES]);
