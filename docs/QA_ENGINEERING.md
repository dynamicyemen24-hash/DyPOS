# DyPOS — QA Engineering Layer

A three-layer reliability harness for DyPOS: **chaos drills** (survive the
hostile world), **end-to-end tests** (the cashier's world), and **load stress**
(the flash-sale world). Everything here is owned by this repo's QA layer and
verified with read-only discipline: it builds, seeds, and destroys its own
state, and never mutates production configuration.

```
DyPOS/
├── playwright.config.js              # E2E harness (backend :8000 + vite :8080)
├── e2e/
│   ├── global-setup.js               # wipes test-results/e2e-db for determinism
│   ├── api.smoke.spec.js             # REST contract — CI gatekeeper, no browser
│   ├── auth.spec.js  [UI, gated]     # register → login → error → logout
│   ├── sale.spec.js   [UI, gated]    # search → add → cash → receipt
│   ├── offline.spec.js [UI, gated]   # kill /api → spool → drain on reconnect
│   ├── print.spec.js  [UI, gated]    # reprint → print-monitor lifecycle
│   └── support/                      # seedApi() helper + deferred-UI gate
├── server/scripts/
│   ├── chaos/lock-injection.test.js  # 2/2 PASS — writer-contention contract
│   ├── chaos/process-kill.test.js    # 1/1 PASS — kill -9 → idempotent replay
│   ├── chaos/recovery-drill.test.js  # 3/3 PASS — corrupt DB fail-fast + restart
│   └── load-stress.k6.js             # k6 spice: 150-terminal holiday spike
└── docs/QA_ENGINEERING.md            # this file
```

---

## 1. Chaos layer (node:test — runs NOW)

Each drill boots the **real server** and forces a failure mode, then asserts the
recovery contract. They use throwaway temp-DB files and never touch
production data.

### Run

```powershell
cd D:\SulationDy\DyPOS\server

# drills, one at a time (mirror of `npm test -- <file>`)
node --test --import ./tests/setup.js scripts/chaos/lock-injection.test.js
node --test --import ./tests/setup.js scripts/chaos/process-kill.test.js
node --test --import ./tests/setup.js scripts/chaos/recovery-drill.test.js
```

### Verified results (this workspace)

| Drill | Tests | Outcome |
|---|---|---|
| `lock-injection.test.js` | 2 | **PASS** — reads stay live under a foreign writer lock (WAL); the colliding sale returns **503** (retryable) then succeeds on retry after the lock releases |
| `process-kill.test.js` | 1 | **PASS** — paid invoice survives `SIGKILL` mid-session; exact idempotency-key replay after restart is `deduped: true`, same id, exactly one row |
| `recovery-drill.test.js` | 3 | **PASS** — corrupt DB file → boot **exits non-zero** with `not a database`; DB path under a file → **exit non-zero** + clear mkdir error; restart series on the same DB serves login again |

**Finding (tracked):** lock collision on `POST /api/invoices` returns 503 — good —
but **without the advisory `Retry-After` header**. The central error middleware
adds `Retry-After: 2` for 503s, but `routes/invoices.js` maps lock errors inside
its own `try/catch` (`res.status(mapErrorStatus(e)).json(...)`) and short-circuits
before the middleware runs. The retryable contract holds; a client relying on the
header for backoff gets nothing on this path.

## 2. End-to-end layer (Playwright)

### Topology (verified from source)

```
browser ─► vite dev :8080 ──proxy──► Node API :8000
             /api/* → 127.0.0.1:8000
```

- `POS/vite.config.js` binds **8080** (not 5173) and proxies
  `app|api|assets|files|printview` → `127.0.0.1:8000`.
- `POS/.env` does **not** exist ⇒ `VITE_DYPOS_API` falls back to `/api` (proxy).
- `server/.env` hard-codes `NODE_ENV=production`, but `dotenv` never overrides
  env vars set by Playwright's `webServer.env`, so the harness boots the backend
  in test mode on **:8000** against a throwaway SQLite file.

### Run

```powershell
# first time only (allowed count: 1 attempt; single browser, ~180 s)
npx playwright install chromium

# full suite (runs after the repo has provisioned node_modules, e.g. `npm ci`)
npx playwright test

# REST-only contract — runs WITHOUT any browser binary (CI gatekeeper)
npx playwright test e2e/api.smoke.spec.js
```

> **Executed-here outcome (2026-09-22):** the sanctioned single
> `npx playwright install chromium` attempt exhausted its 180 s budget on the
> npx → npm-registry package fetch (no `playwright` NPM package is cached for
> npx on this box, and root `node_modules` is not provisioned). Chromium
> binaries for Playwright 1.57 (`chromium_headless_shell-1243`) are **already
> present** in `%LOCALAPPDATA%\ms-playwright` from earlier workspace work. The
> runner cannot load (`playwright/test`) until the repo root deps are
> installed — an operation outside the safety scope of this handoff. On any
> provisioned checkout, `npm ci` + `npx playwright test
> e2e/api.smoke.spec.js` is the entry point.

### Status

- `e2e/api.smoke.spec.js` — **REST-only, executable today**: register
  (bootstrap ADMIN) → wrong-password 401 → login → `/auth/me` → product →
  taxed invoice → idempotent replay → daily report → logout → token dead.
  Exercises the entire `:8080 → :8000` wiring. **Not run here** (runner
  unpresent, see above); the equivalent contract is actively covered by the
  three chaos drills, which boot the same server.
- `auth.spec.js`, `sale.spec.js`, `offline.spec.js`, `print.spec.js` — **fully
  written, deferred by default** (`E2E_UI=1` to enable). They are skipped until
  the "Known gaps" below are closed, because the *frontend cannot log in today*.

## 3. Load layer (k6)

`server/scripts/load-stress.k6.js` — a 50→150-VU holiday spike on the money
path (70% invoice creates with unique idempotency keys, 25% reports, 5% page
scans). It self-seeds a throwaway admin + product via `setup()`, tracks a
dedicated `invoice_create_ok` rate, keeps retryable 503 collisions visible as a
soft metric, and hard-gates on `http_req_failed` + p95/p99 latency.

```powershell
# against a running backend :
cd D:\SulationDy\DyPOS\server
k6 run -e BASE=http://127.0.0.1:8000/api scripts/load-stress.k6.js

# end-to-end through the vite proxy (full UI stack):
k6 run -e BASE=http://localhost:8080/api scripts/load-stress.k6.js
```

## 4. Lint gate

```powershell
cd D:\SulationDy\DyPOS\POS
npx biome check ../e2e ../playwright.config.js
```

---

## Known gaps — blocking the UI e2e

The POS frontend authenticates through the **Frappe ERPNext contract**, while
the Node backend implements **REST JWT auth**. Grep-verified: the backend has
**no** `/api/method/*` routes today. Endpoints the UI calls (from source):

| Needed by | Path the SPA requests | Node backend today |
|---|---|---|
| Login (`stores/session.js` → frappe-ui resource `login`) | `POST /api/method/login` | `POST /api/auth/login` (REST) |
| CSRF readiness (`utils/csrf.js`) | `GET /api/method/DyPOS.api.utilities.get_csrf_token` | — |
| Shift pre-check (`useShift.js`) | `POST /api/method/DyPOS.api.shifts.check_opening_shift` | `POST /api/shifts` (REST) |
| Registration (`pages/Register.vue`) | Frappe register method | `POST /api/auth/register` (REST) |

Once the backend (orchestrator/server team) exposes these `/api/method/*`
endpoints (thin adapters onto the existing REST handlers are sufficient),
flip `E2E_UI=1` and run `npx playwright test`. Until then, CI's gate is
`api.smoke.spec.js` + the chaos drills.

## Seeds & credentials

- **No hard-coded credentials exist** (`server/db/seed.js` generates random
  admin/cashier passwords; they print once at seed time).
- The QA harness **bootstraps its own users** via the register endpoint (first
  account → ADMIN) and deletes its temp DB afterwards. The e2e API spec
  registers `smoke_<ts>`, the chaos drills `chaos_<ts>`, the load script
  `load_<rand>`.

## Selector inventory (verified)

| Concern | Selector |
|---|---|
| Login form | `#dypos-login-email`, `#dypos-login-password` |
| Login error | `#dypos-login-error` (`role=alert`) |
| Register form | `#dypos-register-name/-email/-password/-confirm/-phone/-company` |
| POS shell | `[data-testid="pos-root"]` |
| Search / grid / add | `pos-search`, `pos-product-grid`, `pos-product-item` |
| Cart / checkout | `pos-cart`, `pos-cart-item`, `pos-proceed-to-payment` |
| Payment | `#dypos-payment-amount` (+ `pos-payment-amount`), `pos-complete-payment` |
| Receipt | `[data-testid="pos-receipt"]` |
| Sync state | `button.sync-indicator`, `--offline/--online`, `.sync-indicator__badge` |
| Reprint | header print action (aria-label "طباعة آخر فاتورة") |

## Orchestrator notes

- **Port reality:** backend :8000 + SPA :8080 is the current dev contract
  (`POS/vite.config.js`). The commonly-quoted "5173 default" is stale.
- **Do not** run `npm test`/`npm run build` at root while the QA layer is
  mid-flight; the live gate commands are the three `node --test --import
  ./tests/setup.js scripts/chaos/*.test.js` invocations, `npx playwright test`,
  and the biome check above.