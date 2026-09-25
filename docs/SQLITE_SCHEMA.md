# DyPOS SQLite Schema (local source of truth)

## Browser (Dexie IndexedDB) — current

Tables (see `POS/src/services/db.js`):

```
customers, items, stock, invoices, payments, settings,
syncQueue, syncAudit, sessions, dailyReports,       (v1)
reservations,                                        (v2 anti-oversell)
drivers, intermediaries, deliveryOrders,
customerRequests,                                    (v3)
users                                                (v4 — offline auth)
```

## Target SQLite schema (server + future native local core)

```
users, roles, permissions
branches, terminals, devices
products, product_categories, product_variants, barcodes, product_prices
customers, customer_addresses
taxes, discounts, promotions
inventory, inventory_movements, stock_adjustments
sales, sale_items, sale_payments, sale_taxes, sale_discounts
returns, return_items
shifts, shift_events, cash_movements
receipts, receipt_sequences
settings
audit_logs
sync_queue, sync_metadata
```

## Production pragmas (server SQLite)

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

## Integrity rules

- No `Sale` without `Sale Items`.
- No `Payment` without `Sale`.
- No inventory change without an `inventory_movements` row.
- Receipt numbers unique per (terminal, business_date):
  `BR01-T03-20260925-000123`.
- Money in minor units; deterministic UUID/ULID ids for syncable entities.
- Checkout is one transaction: validate → price → tax → discount →
  stock check → sale + items + payment + inventory + movements +
  receipt + audit → COMMIT, else ROLLBACK.

## Migrations

Numbered, repeatable: `001_initial_schema`, `002_products`, `003_sales`,
`004_inventory`, `005_payments`, `006_shifts`, `007_audit_logs`,
`008_sync_engine`. Server DB is at v23 (`server/db/schema.js` is the
DDL single source; `schema-postgres.sql` in lockstep).
