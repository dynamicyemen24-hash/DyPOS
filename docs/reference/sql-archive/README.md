# SQL Archive — superseded reference packs (NOT applied)

## Status: REFERENCE ONLY — do not execute against any database

These four files were moved here from `server/db/` on 2026-09-25 after a
verified audit proved **no loader, migration, seed, test, or route references
them**:

| File | Lines | Target | Status |
|---|---|---|---|
| `dypos_production_setup.sql` | 236 | PostgreSQL (`dypos.*` schema) | NOT applied |
| `dypos_schema_complement_v24_v40.sql` | 994 | PostgreSQL | NOT applied |
| `dypos_final_global_production_complement_v41_v100.sql` | 834 | PostgreSQL | NOT applied |
| `dypos_database_engine_v101_v130.sql` | 1226 | PostgreSQL 14+ (views/functions/RLS) | NOT applied |

## Why they must stay unapplied

1. **Wrong dialect**: `CREATE SCHEMA`, `plpgsql`, `MATERIALIZED VIEW`, RLS —
   none of it runs on SQLite (production engine), and it is not valid
   Postgres-migration input either (no down-migrations, no version gate).
2. **Parallel data model**: they describe a second universe (`orders`,
   `kitchen_tickets`, `deliveries`, `journal_entries`, …) that zero Express
   routes use. Live API runs on the `schema.js` model (`invoices`,
   `products`, `shifts`, … — 54 tables verified live 2026-09-25).
3. **Single DDL source rule** (AGENTS.md invariant #5): `server/db/schema.js`
   (+ `schema-postgres.sql` in lockstep, `parity ok:true`). Applying these
   packs would fork the model and break the parity gate plus every tenant
   isolation test.
4. Verified live: `chart_of_accounts`, `journal_entries`, `orders`,
   `kitchen_tickets`, `deliveries`, `promotions`, `reservations`,
   `sync_batches` are all **absent** from production `data/dypos.db`.

## How to port a capability properly (if ever needed)

1. Pick ONE capability (e.g. accounting journal) — never the whole pack.
2. Add a numbered migration under `server/db/migrations/` (SQLite DDL).
3. Mirror it in `schema-postgres.sql`; keep `npm run parity` → `ok:true`.
4. Add route + tenant-scope + tests; keep `npm run contract` green.
5. Seed demo data only via `scripts/seed-royal-production.mjs` conventions
   (atomic transaction, `ON CONFLICT DO UPDATE`, fixed UUIDs).

## Left in place (intentionally)

- `server/db/_inventory_tmp.mjs` — the earlier inventory script that compares
  these packs against `schema-postgres.sql`. Kept as audit tooling; it reads
  from its own directory, so it now reports them as external reference.
- `server/scripts/seed-production.mjs` header comment mentions
  `dypos_production_setup.sql` as inspiration — historical note only; the
  canonical production seed is `npm run seed:royal`.
