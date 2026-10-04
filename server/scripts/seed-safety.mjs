const GUARDED_TABLES = [
	'business_settings',
	'tenants',
	'organizations',
	'branches',
	'warehouses',
	'users',
	'api_keys',
	'currencies',
	'uoms',
	'customers',
	'products',
	'invoices',
	'stock_levels',
	'fiscal_years',
	'invoice_sequences',
	'zatca_settings',
];

export function assertSafeRoyalDemoSeed(db, { nodeEnv = process.env.NODE_ENV } = {}) {
	if (nodeEnv === 'production') {
		throw new Error('Refusing sample seed: NODE_ENV=production.');
	}

	const counts = Object.fromEntries(
		GUARDED_TABLES.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]),
	);
	const occupied = Object.entries(counts)
		.filter(([, count]) => count > 0)
		.map(([table, count]) => `${table}=${count}`);

	if (occupied.length > 0) {
		throw new Error(`Refusing sample seed: database already contains business data (${occupied.join(', ')}).`);
	}

	return counts;
}
