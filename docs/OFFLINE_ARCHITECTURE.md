# DyPOS Offline-First Architecture (v1.36.0)

## Principle

```
UI → Application Services → Repositories → SQLite (local source of truth)
```

Frappe is **not** a runtime dependency. The POS must open, sell, and print
with no network, no Frappe, no cloud.

## Startup order (offline-first)

1. Load local configuration (localStorage / IndexedDB)
2. Open local DB (Dexie IndexedDB in browser; SQLite file on server)
3. Run migrations / validate schema
4. Resolve local session (no network)
5. Load terminal/device config (local, sync-optional)
6. Render UI (Arabic RTL first paint)
7. Initialize domain services
8. Optionally probe backend (`/api/ping`) — failure = offline mode, never a blocker
9. Queue sync operations for later

Forbidden at startup: `frappe.auth.get_logged_user`, `/api/method/*` Frappe
whitelists, CSRF fetch, remote localization, remote device/features.

## Layers

- **UI (Vue)**: never touches SQL or Frappe directly.
- **Application services**: Checkout, Pricing, Tax, Inventory, Payment, Shift,
  Customer, Receipt, Auth, Sync (target layout; partially consolidated —
  see MIGRATION_PLAN.md).
- **Repositories**: Product/Customer/Inventory/Sale/Payment/Shift/User/
  Settings/Audit/Sync (Dexie-backed today; SQLite-native interface next).
- **Storage**: browser IndexedDB (Dexie) today; server SQLite file;
  Cloudflare D1 for the edge Worker.

## Sync (future-ready, never blocking)

```
SALE → SQLite COMMIT → sale completed locally → sync queue → cloud later
```

Events (`SALE_CREATED`, `PAYMENT_CREATED`, `INVENTORY_MOVEMENT_CREATED`,
`SHIFT_CLOSED`, …) are retryable, idempotent, ordered where required.

## PWA

- Dual-target build: Frappe desk (`/assets/DyPOS/pos/`, `npm run build`)
  and Pages root (`/`, `npm run build:pages` via `DYPOS_PAGES_BUILD=1`).
- Manifest scope/start_url follow the base, so the SW scope error
  (`'/' not under '/assets/DyPOS/pos/'`) cannot recur.
- `navigateFallback` follows the base; `/api/*` never falls back to HTML.
- `POS/public/_headers` sets `Service-Worker-Allowed: /` on Pages.
