/**
 * v23 migration — promotions plane tenant isolation (`offers` + `coupons`).
 *
 * Extracted from `db/schema.js` to keep the file inside its `fileSize.test.js`
 * cap; see `migrations-opening-balances.js` for why migrations leave that file.
 *
 * ## The bug this closes
 *
 * Offers and coupons are tenant-attributed business data — each store manages
 * its own promotions — but both tables shipped WITHOUT a tenant column, so
 * `GET /api/offers` answered with every tenant's promotions. This is a
 * cross-tenant data leak, not a cosmetic inconsistency.
 *
 * ## Why a guarded ADD COLUMN and not a backfill
 *
 * `addColumnIfMissing` adds the column as NULL and leaves existing rows NULL.
 * NULL means "global", and the read routes scope by tenant only when the caller
 * supplies one — the same legacy-passthrough rule `assertRecordTenant` applies
 * everywhere else. Backfilling every existing row with an arbitrary tenant would
 * have been worse: it would have silently assigned one store's historical
 * promotions to whichever tenant happened to migrate first.
 */
export function migratePromotionTenancy(db, addColumnIfMissing, { version = 23, description = 'offers + coupons tenant isolation' } = {}) {
	addColumnIfMissing('offers', 'tenant_id', 'TEXT');
	addColumnIfMissing('coupons', 'tenant_id', 'TEXT');
	db.exec(`
    CREATE INDEX IF NOT EXISTS idx_offers_tenant ON offers(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, is_active);
  `);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)')
		.run(version, description);
}

export default migratePromotionTenancy;
