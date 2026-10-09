/**
 * حارس بذرة العينة — يميز بين البيانات التي للمشترك وbaselines الترحيل.
 *
 * الدرس المدفوع: الحارس القديم رفض أي صف في 17 جدولًا، لكن الترحيلات نفسها
 * تبذر baselines (`ONLY W-01` في warehouses، وإعدادات business_settings،
 * والعملات وال units) — فالتدفق الموثق (migrate ثم seed) كان مرفوضًا دائمًا
 * على أي قاعدة جديدة. الحارس الآن ي rejects فقط ما يثبت وجود مشترك حقيقي.
 *
 * ## why the guard can re-run on the Royal tenant
 *
 * The Royal seed is idempotent by construction: every row is an UPSERT keyed by
 * a fixed UUID or code, and existing accounts keep their password hash. So
 * re-running it on the subscriber's OWN database is safe — it corrects the
 * fixture in place without touching anything the owner supplied.
 *
 * What the guard therefore distinguishes is NOT "any row" but "any tenant that
 * is not the Royal one": a database holding Royal data may be re-seeded, while
 * a database holding someone else's data may not. That is the line the guard
 * exists to draw, and it is drawn by TENANT, not by table.
 */
// The tenant this seed writes. Re-running against it is safe; running against
// any other tenant's data is the refusal.
const ROYAL_TENANT_ID = '00000000-0000-0000-0000-000000000001';

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

// baselines يبذرها الترحيل بال تصميم، والبدرة الملكية تُدخلها upsert بمفاتيح
// ثابتة (لا حذف أبدًا) — فوجودها لا يمنع البذر الآمن.
const BASELINE_TABLES = ['business_settings', 'warehouses', 'currencies', 'uoms', 'fiscal_years', 'zatca_settings'];

function countRows(db, table) {
	return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function hasRoyalTenant(db) {
	const row = db.prepare('SELECT id FROM tenants WHERE id=?').get(ROYAL_TENANT_ID);
	return Boolean(row?.id);
}

function foreignTenants(db) {
	return db.prepare('SELECT id, name FROM tenants WHERE id IS NOT NULL AND id<>?').all(ROYAL_TENANT_ID);
}

export function assertSafeRoyalDemoSeed(db, { nodeEnv = process.env.NODE_ENV } = {}) {
	if (nodeEnv === 'production') {
		throw new Error('Refusing sample seed: NODE_ENV=production.');
	}

	// A re-seed of the subscriber's OWN database is allowed: the seed is an
	// upsert, and the guard's job is to stop someone seeding OVER a different
	// shop. The check is by tenant, so a database that holds Royal data and
	// nothing else may be re-seeded, while one holding another tenant's data may
	// not — regardless of which tables are non-empty.
	if (hasRoyalTenant(db)) {
		const foreign = foreignTenants(db);
		if (foreign.length > 0) {
			throw new Error(
				`Refusing sample seed: database already contains another subscriber (${foreign
					.map((t) => `${t.id}=${t.name}`)
					.join(', ')}). The Royal seed writes tenant ${ROYAL_TENANT_ID} only.`,
			);
		}
		return { fatal: {}, baseline: {}, baselineNote: [], reseed: true };
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

	return { fatal, baseline, baselineNote: occupiedBaseline, reseed: false };
}

export const GUARDED_TABLES = Object.freeze([...FATAL_TABLES, ...BASELINE_TABLES]);
