# AGENTS.md — Repo conventions for AI coding agents

> This repo is Arabic-first (UI, messages, commit bodies) with English code.
> Production: https://dypos.smartportssoft.com/ · Version single source: `1.36.0`
> (root `package.json` + `POS/package.json` + `server/package.json` + `server/lib/version.js`).

## Shell (Windows PowerShell 5.1 — win32)

- Chain with `;` / `if ($?) { }`. **No** `&&`, `head`, `sed`, `ls -la`.
- Never `cd` inside commands — use the tool `workdir` parameter.
- Prefer dedicated file tools over `cat`/`Select-String` for edits; `Select-String` is fine for search.

## Verify before you claim done (all must be green)

```powershell
# server/ — 362 tests
node --test --import ./tests/setup.js "tests/**/*.test.js"
npx @biomejs/biome check .
node scripts/check-pg-parity.mjs
node scripts/check-method-coverage.mjs
# POS/ — 552 tests
npm run test:run
npx biome check src/<touched-file>
```

## Invariants (never break)

1. **Tenant fail-closed**: every method/REST list gets a tenant clause;
   invalid/spoofed tenant → 403, foreign row → 404. Never degrade to unscoped.
2. **No credential leaks**: `password_hash`/tokens never selectable
   (`safeColumns` + `forbidden` + `redactRow` in `server/routes/method.js`).
3. **One money implementation**: invoice math lives in `routes/invoices.js`
   (`createOrFinalizeSale`, `applyInvoiceReturn`) — the method router reuses
   it, never duplicates it. Amounts via `lib/money.js` (minor units).
4. **Method coverage**: any new POS `call("DyPOS…")` needs a handler in
   `routes/method.js` — `npm run contract` must stay 105+/105+.
5. **DDL single source**: `server/db/schema.js` (+ `schema-postgres.sql` in
   lockstep — `npm run parity` must stay `ok:true`). Lib ensure-functions are
   backstops, not sources.
6. **No secrets in repo**: tokens via env/secrets only; QZ keys stay under
   gitignored `server/uploads/qz/` (0600). Never commit `*.db`, `uploads/`, `dev-dist/`.
7. **Arabic UX**: user-facing strings, errors, audit notes in Arabic.
8. **Offline-First PWA (Installable)**: The POS MUST work 100% offline as an
   installable mobile/desktop app. Zero network calls on startup.
   - IndexedDB (Dexie) is the local database — all sales, stock, customers cached.
   - Service Worker precaches ALL assets (HTML, JS, CSS, fonts, images).
   - Background sync queue persists pending operations to IndexedDB.
   - Offline invoice numbering (POS-{branch}-{terminal}-{date}-{seq}).
   - Stock reservations prevent overselling across terminals offline.
   - Auto-sync when backend reachesable (SQLite on server).
   - `npm run build` produces installable PWA at `DyPOS/public/pos/`.
   - Cloudflare Pages deployment serves the PWA with proper headers.

## Gotchas

- `off += takeLen()`-style compound assignment with mutating RHS reads the
  LHS **before** the call — split into two statements (bit us in QZ DER code).
- Express 4.22, no `cookie-parser`/`multer` — `upload_file` is JSON-base64.
- `users` has no `preferred_locale` — locale defaults to `'ar'`.
- `scale7.test.js` is occasionally flaky — rerun before blaming your change.
- Frontend adapter: `frappe-ui call()` POSTs `/api/method/<path>`, unwraps
  `{ message }`; `login` returns the full payload (short-circuit path).
