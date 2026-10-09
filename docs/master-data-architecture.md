# Master-Data Reference Architecture (v39–v56)

> The single source for how DyPOS provisions, seeds, serves and edits
> global/tenant reference data. Design contract: S1 (no fabricated data),
> S2 (offline absolute), S3 (one implementation per rule).

## What it is

A ladder of migrations that creates a comprehensive reference layer once per
database, seeds it from curated sources (never placeholders), and exposes it
to the product through the method router — with the same tables mirrored into
the POS via the local `reference_data` store so every screen works offline.

- **Range**: `v39`–`v41` (sync/branch idempotency + origin foundation) and
  `v42`–`v56` (the reference-data domain migrations + seeds). Highest version
  = `MIGRATION_VERSION` computed in `server/db/migration-ladder.js`.
- **Seed rule**: every row is real (ISO catalogs, country setup, sector
  templates). `seed()` is `INSERT OR IGNORE` — idempotent across re-runs.

## The tables (15 domain migrations)

| Migration | Table(s) | Content |
|---|---|---|
| v42 countries/regions/cities | `ref_countries`, `ref_regions`, `ref_cities` | ISO 3166-1 (247), admin-1 regions, cities |
| v43 languages/timezones | `ref_languages`, `ref_timezones` | ISO 639, IANA zones |
| v44 currencies | `ref_currencies` | ISO 4217 (150+) |
| v45 units of measure | `units_of_measure` | UNECE-style codes (44) |
| v46 categories | `categories` | hierarchical product/service categories |
| v47 business sectors | `business_sectors` | level-1 sectors (id-keyed, `lower(code)` ids) |
| v49 taxes | `tax_rates`, `product_tax_rates` | per-country VAT templates |
| v50 chart of accounts | `account_templates`, `account_template_lines` | POS/retail/restaurant templates |
| v51 opening balances | `opening_balance_templates*` | per-template opening lines |
| v52 pricing | `price_rule_types` | standard/group/quantity/time/promo |
| v53 purchasing/sales/customers | `suppliers`, `customers`, `sales_channels` | seed skeletons |
| v54 product catalog | `product_catalog_classes`, barcode symbologies | catalog reference |
| v55 establishment/org modes | `business_sectors` level-1 + `ORG_MODES` | registration lists |
| v56 reference seeds | all of the above | row payloads |

`v41` (origin/main foundation) additionally provides `ref_countries`,
`business_activities` (22), `activity_*` (product classes/services/units/
payment methods/onboarding), `settings_definitions`, `price_rule_types` and
`account_templates` flat legacy shapes. **Shape collision**: v41's
`business_sectors`/`account_templates` are flat (`code` PK); v47/v50 rebuild
them into the canonical id-keyed shape with a legacy-pragma dance
(`PRAGMA foreign_keys=OFF` + `legacy_alter_table=ON` → rename to `*_flat_v41`
→ create canonical → carry rows → drop flat), because SQLite's default mode
rewrites child `REFERENCES` clauses on RENAME.

v41 was fixed in place during the merge (it had never run green anywhere):
its `idx_onboarding_country` index collided with v37's different
`onboarding_templates` (saved import templates), and its
`account_template_lines` insert had an 8-args/9-placeholders arity bug.
The table is now `activity_onboarding_profiles` in SQLite, PostgreSQL and
its test.

## Serving path (S2: offline absolute)

1. **Boot / pull**: `localMirror.js` caches the 26 reference doctypes into the
   Dexie `reference_data` store (`POS/src/utils/offline/db.js`).
2. **Read**: `POS/src/composables/useReferenceData.js` serves the cache first,
   server second — never blocks on network.
3. **Write**: `ReferenceDataPage.vue` (route `/reference-data`, linked from
   the work nav manage section) edits through `method-doc-writes`
   (`dypos.client.insert` / `set_value` / `delete_doc`).
4. **Registration**: `Register.vue` builds its country/sector/timezone/currency
   lists from `registration_meta` (server-driven, no hardcoded lists).

`globalScope: true` doctypes are read with `OR tenant_id=''` by
`pushTenantScope` — global rows are tenant-invisible-but-readable; every
list still carries a tenant clause (S4).

## PostgreSQL parity

- `server/db/schema-postgres.sql` is compared against the live SQLite
  `migrate()` by `scripts/check-pg-parity.mjs` (`npm run parity`): tables,
  columns, indexes. `extraTables` is informational; only missing objects fail.
- Regenerate the canonical section with `npm run parity:sync`
  (`scripts/gen-pg-parity.mjs`, sharing the DDL reader
  `scripts/lib/parity-sql.mjs`).
- v39/v40 idempotency indexes (`idx_sync_*`, `idx_invoices_*`) are mirrored
  into the PG file — partial unique indexes translate 1:1.

## Gates that pin this contract

| Gate | Asserts |
|---|---|
| `server/tests/reference-foundation.test.js` | seeded counts, `YE`/`YER` rows, `MIGRATION_VERSION === highest`, second `migrate()` idempotent |
| `server/tests/migration-ladder.test.js` | versions strictly ascending, every entry callable |
| `npm run parity` | SQLite ↔ PG drift |
| `npm run contract` | every POS `call()` has a handler |
| `POS/tests/referenceData.test.js` | the management screen mounts and edits |

## Operational note

A local dev database created with the **pre-merge** ladder recorded max
version 53 under the old numbering (our v14 domain rows). Post-merge that
watermark is 56 and remote v39–v41 would be skipped on such a database —
recreate dev DBs from scratch (production was never on the old numbering;
the branch was never deployed).
