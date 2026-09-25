# DyPOS Offline + SQLite Production Campaign

## Scope

This campaign targets a **browser/PWA DyPOS runtime** that must operate without Frappe and without network access for normal POS operations.

### Current verified architecture

The repository already contains:

- a domain/repository layer,
- REST and Frappe adapters,
- extensive IndexedDB/Dexie offline persistence,
- offline invoice/payment queues,
- crash-resume and idempotency utilities,
- PWA/service-worker infrastructure,
- offline-focused tests.

The critical finding is that the current offline storage is **IndexedDB/Dexie, not SQLite**.

The current bootstrap still imports Frappe runtime facilities and performs Frappe-specific initialization. Therefore the project is **not yet 100% offline and not yet Frappe-independent**.

## Current blockers

### P0 — Frappe runtime coupling

The current frontend imports `frappe-ui` and uses Frappe-specific request/session primitives in the application bootstrap and data layer.

Examples include:

- `frappeRequest`
- `frappeCall`
- `frappe.auth.get_logged_user`
- Frappe CSRF handling
- Frappe bootstrap endpoints
- Frappe realtime initialization

These must be moved behind optional integration boundaries or removed from the offline runtime.

### P0 — No SQLite runtime

The current local database is Dexie/IndexedDB.

SQLite in a browser requires a WASM build plus a persistent browser storage strategy such as OPFS. SQLite's official WASM documentation describes OPFS-backed persistence and notes that OPFS access is worker-oriented for the standard VFS. Browser support and multi-tab locking characteristics must therefore be part of the acceptance matrix.

Target:

```
Vue
  ↓
Application Services
  ↓
Repositories
  ↓
SQLite WASM Worker
  ↓
OPFS
```

Dexie must not remain the financial source of truth after the SQLite migration is complete.

### P0 — Financial transaction boundary

Sales, payments, inventory movements and shift state must be committed atomically in SQLite.

A completed sale must never depend on a network request.

### P0 — Authentication

The current user/session layer is still Frappe-cookie based. Offline cashier authentication must be local and must not require `get_logged_user`.

### P1 — PWA/service-worker scope

The application is built under `/assets/DyPOS/pos/` while the manifest declares a root scope. The worker registration must be made internally consistent with the deployment topology. A root scope requires the worker to be served from an allowed location or an appropriate Service-Worker-Allowed response header.

### P1 — Optional integrations

Realtime, cloud sync, remote feature flags, remote localization, remote bootstrap and remote analytics must be optional enhancements.

They may never block:

- application startup,
- local login,
- product lookup,
- cart,
- checkout,
- cash payment,
- inventory movement,
- receipt creation,
- shift operations.

## Target architecture

```
                    DyPOS Offline Runtime

┌──────────────────────────────────────────────┐
│                  Vue / PWA                   │
├──────────────────────────────────────────────┤
│ UI State / Pinia / Accessibility             │
├──────────────────────────────────────────────┤
│ Application Services                         │
│ Checkout • Payment • Inventory • Shift       │
├──────────────────────────────────────────────┤
│ Domain Rules                                 │
├──────────────────────────────────────────────┤
│ Repository Contracts                         │
├──────────────────────────────────────────────┤
│ SQLite Adapter / Worker                      │
├──────────────────────────────────────────────┤
│ SQLite WASM + OPFS                           │
└──────────────────────────────────────────────┘

Optional:
SQLite → Sync Queue → Cloud Adapter
```

## Definition of 100% Offline

The following must work after a clean install and after network access is disabled:

1. application boot,
2. local user authentication,
3. product search,
4. barcode lookup,
5. cart operations,
6. pricing/tax/discount calculation,
7. stock validation,
8. sale creation,
9. cash payment,
10. atomic inventory deduction,
11. receipt generation,
12. shift open/close,
13. returns,
14. draft recovery,
15. restart recovery,
16. self-checkout,
17. local assistance requests.

No HTTP request may be required for any of the above.

## Campaign phases

### Phase 1 — Boundary extraction

- Remove Frappe from startup.
- Define local application services.
- Define repository contracts.
- Define optional remote adapter.

### Phase 2 — SQLite foundation

- Add SQLite WASM distribution.
- Run database access in a worker.
- Persist the DB through OPFS where supported.
- Add capability detection and a supported-browser policy.
- Add migration runner.
- Add integrity/health checks.

### Phase 3 — Schema

Create versioned migrations for:

- users,
- roles,
- permissions,
- terminals,
- branches,
- products,
- barcodes,
- prices,
- customers,
- taxes,
- promotions,
- inventory,
- inventory movements,
- sales,
- sale items,
- payments,
- returns,
- shifts,
- cash movements,
- receipts,
- settings,
- audit log,
- sync queue.

### Phase 4 — Domain migration

Move financial operations to application services and repositories.

### Phase 5 — Transaction safety

Use SQLite transactions for sale/payment/inventory/receipt operations.

### Phase 6 — Offline authentication

Replace remote-session dependency with local credential verification.

### Phase 7 — PWA hardening

- correct worker scope,
- offline navigation,
- versioned caches,
- update recovery,
- stale-worker recovery,
- no API dependency in app shell.

### Phase 8 — Self Checkout

Use the same domain/application/repository layer and the same SQLite database contract.

### Phase 9 — Optional synchronization

Only after offline correctness is proven.

## Non-negotiable rule

**Do not "fix" Frappe 503 errors as a solution to this campaign.**

A Frappe server may be retained later as an optional synchronization/integration target, but it must not be required for the POS runtime.

## Production gate

The campaign is not complete until CI contains an automated offline gate that:

- starts the application,
- blocks all network access,
- initializes the local database,
- authenticates locally,
- creates a sale,
- processes cash,
- commits inventory,
- restarts the application,
- verifies the committed sale remains present,
- verifies no Frappe/API request was required.
