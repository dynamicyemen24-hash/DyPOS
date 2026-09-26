# DyPOS Frappe-removal Migration Plan

## Done (v1.36.0)

- [x] Architecture audit (see OFFLINE_ARCHITECTURE.md)
- [x] Offline auth: Dexie `users` table, PBKDF2-HMAC-SHA256 credentials, Login/Register offline flows
- [x] Guest pages: session-expiry popup removed from Login/Register/Forgot/Reset
- [x] `useSessionTimeout`: explicit `start()` only, no auto-start on mount
- [x] Startup: local session authoritative, CSRF skipped offline, ping endpoint unified (`/api/ping`)
- [x] Localization: bundled `public/locales/{ar,en}.json`, no server requirement
- [x] Device/features: offline short-circuit, fail-soft defaults
- [x] PWA dual build (`build` for Frappe, `build:pages` for Pages root, scope follows base)
- [x] Dead SVG icon pack removed (`src/assets/icons/`)
- [x] Edge API Worker (`worker-api.js`) with canonical `/api/*` + legacy `/api/method/*` compatibility
- [x] Central endpoint map (`src/utils/apiEndpoints.js`)

## Done (v1.37.0, repositories Phase 1)

- [x] `src/repositories/` foundation: `base.js` (CRUD + `runTransaction`),
  `userRepository` (normalize/hash/create/verify/authenticate),
  `saleRepository` (OPEN → COMPLETED → VOIDED, atomic payments, no empty
  sales, void-keeps-row), `inventoryRepository` (availability = stock −
  active reservations, checkout validation).
- [x] Triplicated credential logic consolidated: Login/Register/data-session
  all delegate to `userRepository` (covered by `tests/repositories.test.js`).

## Done (unreleased)

- [x] **Credential hardening**: local `users` moved from a bare SHA-256 digest
  to PBKDF2-HMAC-SHA256 (210k iterations, random 16-byte salt, self-describing
  `pbkdf2-sha256$iters$salt$hash`, constant-time compare). Rows written by
  older builds (SHA-256 hex, or plaintext) still unlock and are rewritten to
  PBKDF2 on the first successful login; a failed attempt never upgrades.
  Server-side credentials stay bcrypt (cost 12) — the local table is the only
  thing that moved.
- [x] **Tenant scoping on the stock read plane**: `GET /api/stock` resolved its
  scope from a client-supplied `?tenant=`, so any caller could omit it and read
  every tenant's levels. It now resolves from the bound caller (fail-closed) and
  rejects a foreign `?tenant=` with 403. `get_warehouses` is scoped too.
- [x] **Stock correctness**: `GET /api/stock` silently defaulted an absent
  `warehouse` to `W-01`, so "all warehouses" was never actually requested — the
  per-product sum and the warehouse picker both covered one warehouse while
  claiming the whole estate. Added an explicit `all_warehouses=1` mode (the
  `W-01` default is preserved for existing callers) and a stable
  `(warehouse_id, product_id)` sort so offset pagination cannot skip/duplicate.
- [x] **Dashboard data layer**: one `useDashboardSource` (period, extra filters,
  cache/stale hydration, realtime refresh) instead of per-dashboard fetching;
  hidden tabs are no longer mounted on open; `defaultPeriod` uses the local
  date rather than `toISOString()`.
- [x] **No silent row caps**: incremental pagination for unpaid invoices,
  partial payments and returnable invoices; the stock catalog walk surfaces
  `truncated`/`productTotal`/`stockTruncated` and the UI says "N من M" instead
  of implying whole-catalog totals.
- [x] **Currency single source**: `utils/currency.js` is the only default.
  Removed a second hardcoded `DEFAULT_CURRENCY` (`regional.js`), the SaaS store
  seed/reset, user-facing SAR literals in `marketing.js`, and the SAR-defaulted
  `selectedCurrency` props. CSV import templates now emit the configured
  currency.
- [x] **Dead code removed**: `src/composables/sale/` (13 files),
  `utils/resilience.js`, `utils/structuredLog.js` (TS syntax in `.js`),
  `utils/helpers.js` (unreferenced, carried a duplicate `formatCurrency`), and
  `dashboards/core/useDashboardData.js` (unreferenced, superseded).

## Next (in order)

1. Repository layer (continued): Shift/Settings/Audit/Sync repositories
   over Dexie (`sessions` has no local writer yet — deferred honestly);
   Product/Customer done. UI stops importing `db` directly.
2. Dexie `items` parity: add `name_ar` (+`brand`) columns (schema v5) so
   Arabic-name search works offline like the server catalog; extend
   `upsertCatalog` writers in `utils/offline/items.js` to fill them.
3. Domain services: move pricing/tax/discount/checkout rules out of Vue
   components into `CheckoutService → Pricing → Tax → Inventory → Payment`.
4. Atomic checkout transaction + crash tests (power loss during/after payment).
5. Shift/cash reconciliation + receipt sequences (`receipts`, `receipt_sequences`).
6. Self-checkout on the same core (separate UX, shared services).
7. Attendant/assistance console (local-first).
8. Sync engine over `sync_queue`/`sync_metadata` (idempotent, ordered, observable).
9. Delete compatibility shims (`adapters/frappe`, legacy `/api/method/*` paths)
   once no importer remains.

## Compatibility boundary (temporary)

```
Legacy callers (frappe-ui call/createResource, /api/method/*)
  → apiEndpoints map + worker-api.js legacy paths
  → local application services
```

Goal: zero Frappe runtime imports. UI-only `frappe-ui` component imports
(FeatherIcon etc.) are presentation-only and allowed until the design-system
migration replaces them.
