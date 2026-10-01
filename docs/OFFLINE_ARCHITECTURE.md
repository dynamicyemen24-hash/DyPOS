# DyPOS Offline-First Architecture

## Principle

```
UI → Application Services → Repositories → SQLite (local source of truth)
```

The **Express server (and the legacy Frappe app) is not a runtime
dependency** — it is an optional sync-and-management backend. The POS must
open, sell, and print with no network, no Frappe, no cloud — and it must
initiate zero connections on its own: every network movement happens only on
explicit user demand (Sync Now, server login, explicit pull) or under
automation the user enabled per-trigger in the linkage variables
(`POS/src/services/link-consent.js`: `auto`/`ask`/`off`, default `off`).
`ask` never transmits; it surfaces the pending count for the user to demand.

## Server is optional (sync-only)

The server is on **no** critical path:

| Server does (when present) | Server never does |
| --- | --- |
| Acknowledge synced records, reconcile conflicts | Gate boot, login, or first paint |
| Cross-branch / cloud reporting and admin | Gate a sale, return, shift, or print |
| Tenant isolation for multi-site records | Hold the only copy of a financial truth |
| Backup, chain verification, optional ZATCA submission | Provide feature flags the UI requires to render |

Offline, the local ledger (Dexie) **is** the authority for that device; the
server re-validates and becomes the cloud record on sync. Anything a screen
needs is read locally first (`methodGetListWithSource` reports
`server | local | unavailable` — never a silent empty list). A deployment
with the server absent is a supported production configuration, not a
degraded one.

## Startup order (offline-first)

1. Load local configuration (localStorage / IndexedDB)
2. Open local DB (Dexie IndexedDB in browser; SQLite file on server)
3. Run migrations / validate schema
4. Resolve local session (no network)
5. Load terminal/device config (local, sync-optional)
6. Render UI (Arabic RTL first paint)
7. Initialize domain services
8. Standalone by default — NO backend probe. Pinging to decide the mode was
   itself an undemanded connection on every boot. Server reachability is
   learned from the user's first demanded call, never probed for.
9. Queue sync operations for later (flushed only on demand or consented automation)

Forbidden at startup: `dypos.auth.get_logged_user`, `/api/method/*` Frappe
whitelists, CSRF fetch, remote localization, remote device/features,
any `/api/ping` or connectivity probe, any auto-sync/auto-connect.

## Layers

- **UI (Vue)**: never touches SQL or the database directly.
- **Application services**: Checkout, Pricing, Tax, Inventory, Payment, Shift,
  Customer, Receipt, Auth, Sync (target layout; partially consolidated —
  see MIGRATION_PLAN.md).
- **Repositories**: Product/Customer/Inventory/Sale/Payment/Shift/User/
  Settings/Audit/Sync (Dexie-backed today; SQLite-native interface next).
- **Storage**: browser IndexedDB (Dexie) is the primary store; the server
  SQLite file and Cloudflare D1 are the **sync tier (optional)** — absent
  whenever the server is.

## Sync (future-ready, never blocking)

```
SALE → SQLite COMMIT → sale completed locally → sync queue → cloud later
```

Events (`SALE_CREATED`, `PAYMENT_CREATED`, `INVENTORY_MOVEMENT_CREATED`,
`SHIFT_CLOSED`, …) are retryable, idempotent, ordered where required.

## PWA

- Dual-target build: DyPOS desk (`/assets/DyPOS/pos/`, `npm run build`)
  and Pages root (`/`, `npm run build:pages` via `DYPOS_PAGES_BUILD=1`).
- Manifest scope/start_url follow the base, so the SW scope error
  (`'/' not under '/assets/DyPOS/pos/'`) cannot recur.
- `navigateFallback` follows the base; `/api/*` never falls back to HTML.
- `POS/public/_headers` sets `Service-Worker-Allowed: /` on Pages.
