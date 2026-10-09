/**
 * The v23+ migration ladder — DATA, not code.
 *
 * `db/schema.js` used to inline this array, which meant registering a migration
 * cost it two edits (an import + a row) and pushed the file toward its
 * file-size cap for no reason: a version NUMBER and a note are data, and data
 * does not belong in the module that runs it.
 *
 * So the table lives here and `schema.js` imports it. One edit per migration
 * (this file), and the DDL and its rationale stay with the migration module it
 * names.
 */
import { migratePromotionTenancy } from './migrations-promotion-tenancy.js';
import { migrateInvoiceReturnTracking } from './migrations-invoice-returns.js';
import { migrateOpeningBalances } from './migrations-opening-balances.js';
import { migrateOpeningBalanceItems } from './migrations-opening-balance-items.js';
import { migrateInvoiceTenantIdempotency } from './migrations-invoice-tenant-idempotency.js';
import { migrateShiftSettlementIntegrity } from './migrations-shift-settlement-integrity.js';
import { migrateSyncLogBranchScope } from './migrations-sync-branch-scope.js';
import { migrateCatalogParity } from './migrations-catalog-parity.js';
import { migrateReorderPoint } from './migrations-reorder-point.js';
import { migratePasskeys } from './migrations-passkeys.js';
import { migrateQueueManagement } from './migrations-queue-management.js';
import { migrateRecordProtection } from './migrations-record-protection.js';
import { migrateCatalogBaseUnits } from './migrations-catalog-base-units.js';
import { migrateInvoiceTenantUniqueness } from './migrations-invoice-tenant-uniqueness.js';
import { migrateOperationalOnboarding } from './migrations-operational-onboarding.js';
import { migrateShiftTenantScope } from './migrations-shift-tenant-scope.js';
import { migrateSyncIdempotencyScope } from './migrations-sync-idempotency-scope.js';
import { migrateInvoiceBranchUniqueness } from './migrations-invoice-branch-uniqueness.js';
import { migrateReferenceFoundation } from './migrations-reference-foundation.js';
import { migrateCountries } from './migrations-countries.js';
import { migrateRegions } from './migrations-regions.js';
import { migrateCities } from './migrations-cities.js';
import { migrateLanguages } from './migrations-languages.js';
import { migrateTimezones } from './migrations-timezones.js';
import { migrateBusinessSectors } from './migrations-business-sectors.js';
import { migrateCategories } from './migrations-categories.js';
import { migrateTaxes } from './migrations-taxes.js';
import { migrateChartOfAccounts } from './migrations-chart-of-accounts.js';
import { migrateUnits } from './migrations-units.js';
import { migrateProductCatalog } from './migrations-product-catalog.js';
import { migratePricing } from './migrations-pricing.js';
import { migrateSalesCustomers } from './migrations-sales-customers.js';
import { migratePurchasing } from './migrations-purchasing.js';
import { migrateReferenceSeeds } from './migrations-reference-seeds.js';

/**
 * Ordered by version; `migrate()` applies every row above the recorded version
 * inside one transaction each. Never renumber an applied migration — a
 * deployment mid-ladder skips rows it has already recorded.
 *
 * v39–v41 belong to the origin/main foundation (sync idempotency scope,
 * invoice branch uniqueness, reference foundation). The 15 domain migrations
 * from the reference-data branch were drafted as v39–v53 BEFORE that push
 * landed and are renumbered v42–v56 here: they were never shipped, so the
 * renumber costs nobody a skipped row, and v41 stays the number production
 * already recorded. `business_sectors` / `account_templates` exist in BOTH
 * foundations — v41 creates the flat shape, v47/v50 rebuild it into the
 * canonical id-keyed shape the doctypes and seeds require (row-carrying,
 * idempotent, FK-safe).
 */
export const LATE_MIGRATIONS = Object.freeze([
	{ version: 23, run: migratePromotionTenancy, note: 'offers + coupons tenant isolation' },
	{ version: 24, run: migrateInvoiceReturnTracking, note: 'invoice return tracking fields' },
	{ version: 25, run: (d) => migrateOpeningBalances(d), note: 'opening balances per fiscal year' },
	{ version: 26, run: migrateOpeningBalanceItems, note: 'opening balances item link (product_id)' },
	{ version: 27, run: migrateInvoiceTenantIdempotency, note: 'invoice idempotency scoped to tenant' },
	{ version: 28, run: migrateShiftSettlementIntegrity, note: 'shift settlement concurrency integrity' },
	{ version: 29, run: migrateSyncLogBranchScope, note: 'sync_log branch scope (multi-branch pull)' },
	{ version: 30, run: migrateCatalogParity, note: 'currency + UoM catalog parity (POS ⇄ SQLite)' },
	{ version: 31, run: migrateReorderPoint, note: 'per-product reorder point' },
	{ version: 32, run: migratePasskeys, note: 'webauthn passkey credentials' },
	{ version: 33, run: migrateQueueManagement, note: 'queue management (tickets, counters, calls)' },
	{ version: 34, run: migrateRecordProtection, note: 'void status for expenses + opening balances' },
	{ version: 35, run: migrateCatalogBaseUnits, note: 'catalog base units (count/weight/volume/length)' },
	{
		version: 36,
		run: migrateInvoiceTenantUniqueness,
		note: 'tenant-scoped uniqueness on invoices (number + idempotency_key)',
	},
	{
		version: 37,
		run: migrateOperationalOnboarding,
		note: 'POS operational onboarding profile + saved import templates',
	},
	{ version: 38, run: migrateShiftTenantScope, note: 'POS shifts tenant isolation' },
	{ version: 39, run: migrateSyncIdempotencyScope, note: 'sync idempotency tenant and branch isolation' },
	{
		version: 40,
		run: migrateInvoiceBranchUniqueness,
		note: 'invoice uniqueness aligned with branch-scoped numbering and idempotency',
	},
	{ version: 41, run: migrateReferenceFoundation, note: 'comprehensive reference/master data foundation' },
	{ version: 42, run: migrateCountries, note: 'countries (ISO 3166-1)' },
	{ version: 43, run: migrateRegions, note: 'regions (states/provinces/governorates)' },
	{ version: 44, run: migrateCities, note: 'cities (districts/municipalities)' },
	{ version: 45, run: migrateLanguages, note: 'languages (ISO 639)' },
	{ version: 46, run: migrateTimezones, note: 'timezones (IANA)' },
	{ version: 47, run: migrateBusinessSectors, note: 'business sectors (hierarchical; rebuilds the v41 flat shape)' },
	{ version: 48, run: migrateCategories, note: 'product/service categories (hierarchical)' },
	{ version: 49, run: migrateTaxes, note: 'tax master data' },
	{ version: 50, run: migrateChartOfAccounts, note: 'chart of accounts templates (rebuilds the v41 flat shape)' },
	{ version: 51, run: migrateUnits, note: 'units of measure with conversions' },
	{ version: 52, run: migrateProductCatalog, note: 'professional product catalog' },
	{ version: 53, run: migratePricing, note: 'pricing engine' },
	{ version: 54, run: migrateSalesCustomers, note: 'sales & customers' },
	{ version: 55, run: migratePurchasing, note: 'purchasing & suppliers' },
	{ version: 56, run: migrateReferenceSeeds, note: 'global reference data seeds (countries→COA)' },
]);

export default LATE_MIGRATIONS;
