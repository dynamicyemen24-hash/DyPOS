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
import { migrateOperationalOnboarding } from './migrations-operational-onboarding.js';

/**
 * Ordered by version; `migrate()` applies every row above the recorded version
 * inside one transaction each. Never renumber an applied migration — a
 * deployment mid-ladder skips rows it has already recorded.
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
	{ version: 37, run: migrateOperationalOnboarding, note: 'POS operational onboarding profile + saved import templates' },
]);

export default LATE_MIGRATIONS;
