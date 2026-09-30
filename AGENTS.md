# AGENTS.md — Repo conventions for AI coding agents

> This repo is Arabic-first (UI, messages, commit bodies) with English code.
> Production: https://dypos.smartportssoft.com/ · Version single source: `1.41.2`
> (root `package.json` + `POS/package.json` + `server/package.json` + `server/lib/version.js`).

## Shell (Windows PowerShell 5.1 — win32)

- Chain with `;` / `if ($?) { }`. **No** `&&`, `head`, `sed`, `ls -la`.
- Never `cd` inside commands — use the tool `workdir` parameter.
- Prefer dedicated file tools over `cat`/`Select-String` for edits; `Select-String` is fine for search.

## Verify before you claim done (all must be green)

```powershell
# server/ — 534 tests / 166 suites
npm test                              # = node scripts/run-tests.mjs
npx @biomejs/biome check .
npm run parity
npm run contract
# POS/ — 1048 tests / 73 files
npm run test:run
npx biome check src/<touched-file>
# production, from the repo root (after a deploy)
npm run verify:live                   # = node scripts/verify-live.mjs
```

Test counts are *measured* by the runners, never estimated: server
`534 tests / 166 suites`, POS `1048 tests / 73 files`.

`POS/node_modules` is disposable — if a command hangs on `npx … Ok to proceed?`,
the install is missing: `npm ci` in `POS/` (and add the package to
`POS/package.json`; a dependency used by shipped code but absent from the
manifest breaks both the build and any test that compiles CSS).

## Invariants (never break)

1. **Tenant fail-closed**: every method/REST list gets a tenant clause;
   invalid/spoofed tenant → 403, foreign row → 404. Never degrade to unscoped.
2. **No credential leaks**: `password_hash`/tokens never selectable
   (`safeColumns` + `forbidden` + `redactRow` in `server/routes/method.js`).
3. **One money implementation**: the line rule (discount clamp → gross →
   exclusive/inclusive net-tax split) lives in `lib/money.js
   #computeLineMinor` and is called by REST create + partial return
   (`routes/invoices.js`), the method router (`routes/method.js`, incl. the
   draft writer) and `services/invoice-totals.js` — never re-implemented.
   `server/tests/money-line.test.js` fails the build if any other runtime file
   contains the VAT split. Returns go through `applyInvoiceReturn`
   (`routes/invoices.js`), which the method router *imports*.
4. **Method coverage**: any new POS `call("DyPOS…")` needs a handler in
   `routes/method.js` — `npm run contract` must stay green (every call site
   resolves to a registered handler).
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
   - `npm run build` produces installable PWA at `POS/dist/pos/`.
   - Cloudflare Pages deployment serves the PWA with proper headers.
9. **No third-party runtime, no desk globals**: the runtime stack is
   Vue + Dexie + the first-party `dypos-ui` kit (`POS/packages/dypos-ui`).
   - Non-Vue code reaches the server through `src/utils/methodClient.js`
     (`methodCall` / `methodGetList`) — never a `window.<desk>` global, which
     does not exist standalone and silently disables whole features.
   - Identity comes from the local session (`@/data/session`: `sessionUser()`,
     `sessionRole()`), never from a global.
   - **An empty list is not a measurement.** Anything a dashboard renders must
     carry its provenance: `methodGetListWithSource` returns
     `server | local | unavailable` (`utils/offline/localMirror` serves the
     cached rows offline; `useDashboardSource` maps `local` to the stale banner
     and `unavailable` to the error state). Never `catch(() => [])` a report
     fetch — a confident "Stock Value 0.00" is worse than an error.
   - Renaming a third-party name is **not** a licence to `find/replace` it:
     `server/tests/branding-integrity.test.js` fails on glued brand tokens
     (`dyposerror`), dead globals and resurrected legacy identifiers.
10. **Config must follow the code**: every path a build config names must exist
    and every eagerly pre-bundled module must be a declared dependency
    (`POS/tests/buildConfig.test.js`). The UI kit is **aliased**
    (`POS/packages/dypos-ui`), never installed from a registry.
11. **Measure, don't wish**: oversized files are capped by
    `POS/tests/fileSize.test.js` + `server/tests/fileSize.test.js`. Caps only
    move **down** — extract a composable/module, then lower the number in the
    same commit. A backlog item nobody measures is a wish.

## Gotchas

- **A glob handed to `node --test` runs nothing and still exits 0.** Node does
  not expand `tests/**/...`; unquoted it only works on POSIX shells. Always go
  through `server/scripts/run-tests.mjs` (`npm test`), which enumerates the
  files and refuses to report green when it finds none.

- `off += takeLen()`-style compound assignment with mutating RHS reads the
  LHS **before** the call — split into two statements (bit us in QZ DER code).
- **Rollup runs `writeBundle` hooks in parallel** unless the hook object sets
  `sequential: true`. Two first-party plugins mutating `dist/pos/assets` used to
  race (prune unlinked a CSS file the font-strip hook was about to read → ENOENT
  failing a good build). Keep such hooks sequential, and in array order.
- **npm only, at the root**: root scripts call `npm --prefix POS …`. An earlier
  `postinstall: cd POS && yarn install` floated versions and broke on machines
  without yarn — `npm ci` per package is the reproducibility contract.
- `npm run test:watch` (server) now goes through `run-tests.mjs --watch`, so it
  enumerates the same files `npm test` does (the old `tests/*.test.js` glob ran
  nothing on Windows).
- Express 4.22, no `cookie-parser`/`multer` — `upload_file` is JSON-base64.
- **Two dead-code gates judge "delete or wire", and they are not optional:**
  `POS/tests/deadCode.test.js` (from `main.js` + routes + test/script roots) and
  `server/tests/deadCode.test.js` (from `server.js`, workers, tests, scripts and
  every path named in `server/package.json` scripts). Only *literal*
  import/require specifiers count — `require(variable)` is invisible to both, so
  a module loaded only that way is a hole in the gate, not an exemption. Restoring
  a file is not a fix: it must be reachable **and** compile **and** mount, or it is
  back to dead. That is how `WorkForm.vue` (unbalanced markup), `WorkWizard.vue`
  (unquoted attribute) and `WorkNotification.vue` (ES exports in `<script setup>`)
  stayed broken for months while every suite was green.
- A `useDialog("key")` / `emit("x-clicked")` / `to: { name }` with no consumer is
  a **dead contract**: a button that renders and does nothing, or a nav entry
  that navigates nowhere. Wire the consumer or delete the contract — never leave
  it "for later"; that is how settings and logout became unreachable while their
  code sat fully written.
- `users` has no `preferred_locale` — locale defaults to `'ar'`.
- **`/api/health` returns 503 whenever *any* registered check degrades** (memory
  and disk thresholds included), so it is environment-dependent under a parallel
  suite. Assert the contract (payload shape + status/`status` agreement), never a
  hard `200`; `/api/ready` is the container probe path. Four tests still did
  (auth/version/scale/scale8) and failed on the CI runner while passing locally.
- **`npm ci` in `server/` can leave you unable to run the suite.** `better-sqlite3@13.0.3`
  ships no prebuilt binary for Node 24 on Windows, so the install falls back to
  `node-gyp`, which needs Python; without it the install dies halfway and the
  native binding is gone (dozens of tests fail on the missing module, not on any
  code change). CI runs Node 22 and installs the same lockfile cleanly. Before
  running `npm ci` here know the escape hatch: install Python, use Node 22, or let
  the `CI` workflow be the gate. Never call a code regression from a local
  failure without reading the error — this one literally names `gyp` and Python.
- Frontend adapter: `dypos-ui call()` POSTs `/api/method/<path>`, unwraps
  `{ message }`; `login` returns the full payload (short-circuit path).
- **A release MUST bump the version** (`package.json` + `POS/package.json` +
  `server/package.json` + `server/lib/version.js`). The deploy workflow asserts
  the live `/version.json` against that number; shipping code without a bump
  makes that gate pass over a **failed** deploy, because the domain already
  serves the old number.
- **Cloudflare deploys need `Cloudflare Pages:Edit` on the token.** Proven, not
  guessed: `scripts/pages-preflight.mjs` gets `403` + `code 10000` on
  `GET /accounts/{id}/pages/projects` *after* `/user/tokens/verify` passes, so
  the project exists and the token is valid — only the scope is missing. Fix once
  in the dashboard (no IP allowlist), then `gh secret set CLOUDFLARE_API_TOKEN`.
- **An unquoted YAML scalar cannot contain `": "`.** A step named
  `Preflight: Pages project…` made GitHub reject the ENTIRE workflow: the run
  reports "likely failed because of a workflow file issue", `workflow_dispatch`
  disappears, and not one step executes. `server/tests/deploy-diagnostics.test.js`
  fails the build on that colon now.
- **Live probes live in `scripts/verify-live.mjs`** (`npm run verify:live`), used
  by the deploy workflow and the 15-minute heartbeat. When production moves,
  change that one file — never reintroduce per-workflow inline `curl` probes with
  paths only the deployed layout knows (that is how the heartbeat stayed red on a
  healthy site).
