# DyPOS Frappe-removal Migration Plan

## Done (v1.36.0)

- [x] Architecture audit (see OFFLINE_ARCHITECTURE.md)
- [x] Offline auth: Dexie `users` table, SHA-256 credentials, Login/Register offline flows
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

## Next (in order)

1. Repository layer (continued): Product/Customer/Shift/Settings/Audit/Sync
   repositories over Dexie; UI stops importing `db` directly.
2. Domain services: move pricing/tax/discount/checkout rules out of Vue
   components into `CheckoutService → Pricing → Tax → Inventory → Payment`.
3. Atomic checkout transaction + crash tests (power loss during/after payment).
4. Shift/cash reconciliation + receipt sequences (`receipts`, `receipt_sequences`).
5. Self-checkout on the same core (separate UX, shared services).
6. Attendant/assistance console (local-first).
7. Sync engine over `sync_queue`/`sync_metadata` (idempotent, ordered, observable).
8. Delete compatibility shims (`adapters/frappe`, legacy `/api/method/*` paths)
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
