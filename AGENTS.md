# AGENTS.md — Repo conventions for AI coding agents

> This repo is Arabic-first (UI, messages, commit bodies) with English code.
> Production: https://dypos.smartportssoft.com/ · Version single source: `1.44.7`
> (root `package.json` + `POS/package.json` + `server/package.json` + `server/lib/version.js`
> + `worker-api.js` `API_VERSION` — the edge's copy, asserted by both suites).

## Shell (Windows PowerShell 5.1 — win32)

- Chain with `;` / `if ($?) { }`. **No** `&&`, `head`, `sed`, `ls -la`.
- Never `cd` inside commands — use the tool `workdir` parameter.
- Prefer dedicated file tools over `cat`/`Select-String` for edits; `Select-String` is fine for search.

## Verify before you claim done (all must be green)

```powershell
# server/ — 684 tests / 198 suites
npm test                              # = node scripts/run-tests.mjs
npx @biomejs/biome check .
npm run parity
npm run contract
# POS/ — 2150 tests / 125 files
npm run test:run
npx biome check src/<touched-file>
# production, from the repo root (after a deploy)
npm run verify:live                   # = node scripts/verify-live.mjs
```

Test counts are *measured* by the runners, never estimated: server
`684 tests / 198 suites`, POS `2150 tests / 125 files`.

`POS/node_modules` is disposable — if a command hangs on `npx … Ok to proceed?`,
the install is missing: `npm ci` in `POS/` (and add the package to
`POS/package.json`; a dependency used by shipped code but absent from the
manifest breaks both the build and any test that compiles CSS).

## Product identity — who DyPOS is FOR

**DyPOS is built for small commercial establishments**: the corner shop, the
family-run supermarket, the single-branch café, the two-terminal restaurant,
the neighbourhood workshop. That is not a market segment bolted on later — it
is the constraint the whole architecture is derived from, and every rule below
exists because of it.

### S0 — Built for the small establishment, at its scale

A small shop is not an enterprise that happens to be small. Its constraints are
different, and a feature that violates them is a defect even if it works at
1000 branches:

- **Zero entry cost.** Installing must be: open the URL, install the PWA, sell.
  No server purchase, no IT contract, no licence negotiation. That is why
  SQLite is the production database (DB_DECISION.md: one node, tens of
  points) and why the server is optional for 100% of the seller's job (S2).
- **No per-seat metering.** Nothing may gate a feature by user count, branch
  count, or "plan". A shop with four cashiers is not a bigger version of a shop
  with one, and the product must not pretend otherwise. `legacy/pos_next`
  carried `max_users` / `max_tenants` columns; the live tree must never
  reintroduce that shape — a limit that appears in a schema is a limit a
  customer will hit.
- **One owner, not a department.** Setup, training and recovery must be
  something a proprietor does between deliveries. A wizard that needs an
  administrator is a wizard the shop never completes.
- **Hardware reality.** A cheap tablet, a thermal printer, a cheap phone. Hence
  the 44px touch targets, the density tokens, and the offline-first rule: a
  shop with unreliable wifi must still open the till in the morning (S2).
- **Arabic and RTL are the default, not a locale.** A secondary shop that needs
  LTR must be able to switch, but no shop's primary language is optional.

### S7b — No feature advertised unless it is reachable

A control, a report, a wizard or a dashboard that no one can reach is a lie in
the product, not a backlog item. Deleting unreachable UI is a *feature*
delivery: 6228 lines of work-kit components shipped to every shop's browser
while rendering nothing. `tests/deadExports.test.js` fails the build when a
barrel exports a component no template renders and no registry mounts.

## Technical specification — binding for every developer (human or agent)

These are the acceptance criteria of the product. They are **not** aspirations:
each line names the gate that enforces it, and a gate that stops enforcing it is
itself a defect to be fixed in the same round that noticed it.

### S1 — No fabricated data, ever
The POS shows a shop's real numbers. No demo rows, no mock tables, no typed
revenue, no placeholder totals, no "coming soon" figure that renders as a fact.
Business constants (VAT rates, currency decimals, page sizes, barcode symbologies,
permission tables) are **specification**, not data, and are allowed.

- Gate: `POS/tests/truthfulness.test.js` (scans `src/` + server runtime dirs)
- Rule: a failure is never a measurement — `.catch(() => [])` / `.catch(() => 0)`
  on a *report* is forbidden. Legitimate fallbacks (memo cache, optional Redis,
  a schema probe) are allowed because they return "not cached", not "none".
- A count that merges several sources must report whether it is **complete**,
  so a partial read can never render as a confident zero
  (`device-catalog#countDeviceProducts` returns `{count, complete}`).

### S2 — Offline is absolute, not a feature
100% of the seller's job works with no network: sale, return, print, reports,
stock count, shifts, customers. The server is optional and sync-only. Sync runs
only on explicit user demand or a linkage the user set to `auto` (default `off`).
- Gates: `standaloneBoot.test.js`, `offlineFirst.test.js`, `offlineSale.test.js`

### S3 — One implementation per rule
Money (`lib/money.js#computeLineMinor`), returns (`applyInvoiceReturn`), method
handlers (`routes/method.js`), DDL (`db/schema.js` ↔ `schema-postgres.sql`).
A second implementation is a defect even when both are correct.
- Gates: `money-line.test.js`, `npm run contract`, `npm run parity`

### S4 — Tenant fail-closed, secrets never leak
Every list carries a tenant clause (403 spoofed / 404 foreign, never unscoped);
`password_hash` and tokens are never selectable.
- Gates: tenant suites in `server/tests`, `branding-integrity.test.js`

### S5 — Honest UX
Arabic user-facing text, and every error **names a recovery**. A dead control, a
dead `emit`, an unreachable feature, or a component that renders but does nothing
is a defect even though it compiles green.
- Gates: `errorMessages.test.js`, `sfcCompiles.test.js`, `deadCode.test.js`,
  `barcodeScanner.test.js` (the `this.$root` class)

### S6 — Config follows the code
Every path a build config names exists; every eagerly pre-bundled module is a
declared dependency; the version single source is asserted across all five
places.
- Gates: `buildConfig.test.js`, `versionDrift.test.js`, `deadCode.test.js`

### S7 — Measure, never wish
File-size caps only move **down**; extract first, then lower the number in the
same commit. A backlog item nobody measures is a wish.
- Gates: `POS/tests/fileSize.test.js`, `server/tests/fileSize.test.js`

## Development metrics — the numbers that must never regress

| Metric | Where it is measured | Now | Direction |
|---|---|---|---|
| Server tests / suites | `server` `npm test` | **684 / 198** | up or flat |
| POS tests / files | `POS` `npm run test:run` | **2150 / 125** | up or flat |
| Truthfulness gates | `truthfulness.test.js` | **12** | up or flat |
| Runtime gates (server+P0) | `run-tests.mjs`, `vitest` | **320+** | up or flat |
| Bundle budget (gzip JS+CSS) | `POS` `npm run size` | **≤ 900 KB** | down or flat |
| Dependency advisories (prod) | `npm audit --omit=dev` | **0** | flat |
| Escaped/excused gate entries | `ALLOWED_SURFACES`, `KNOWN_*` | **0 / minimal** | down or flat |
| Largest shipped file | `fileSize.test.js` | measured, capped | down or flat |
| Codepath reachability | `deadCode.test.js` | **0 unreachable** | flat |

### The ratchet's one upward move, recorded rather than hidden

`POSSale.vue` went **6165 → 6200** in 1.44.7, when the barcode branch was opened
and a real OPEN button had to exist. The rule says caps move down, so this is
the exception that needed an argument, and the argument is written where the
cap is: the 14 added lines are shipped markup, not growth, and the *next* round
paid it back. `useBarcodeScanner.js` (1.44.7) and `useCartLines.js` (1.44.9,
6200 → **6115**) both landed as extractions, each with its own cap so it cannot
regrow into the page. Had the 1.44.7 number been left to drift silently, the
file would be 6200 lines *and* nobody would know the debt was already paid.

A change that moves a row the wrong way must either fix the underlying debt in
the same commit (then move the cap down) or explain in `CHANGELOG.md` why the
metric moved. Silence is not an option.

**Why the test COUNT can fall while the suite gets stronger.** Deleting 12 dead
components (6228 lines) took their unit tests with them, so the count reads
2150 where it read 2180. Three gates were added in the same round
(`truthfulness`, `deadExports`, `cartLines`) and three new mount mechanisms
were taught to the existing ones, so fewer assertions cover more of the
product. A falling count is not automatically a regression — an UNEXPLAINED
one is.

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
8. **Standalone-First PWA (Installable)**: The POS MUST work 100% offline as an
   installable mobile/desktop app. Zero network calls on startup — and zero
   network at any time without the user's demand or granted automation.
   - **Offline-first on local storage is absolute**: Dexie/IndexedDB (client)
     and SQLite (server) are the only sources of truth. The Express server is
     **optional and sync-only** — no feature, screen, sale, return, print or
     report may be gated on its availability. Nothing may limit offline
     operation: no offline feature flags, no license/telemetry/boot fetch, no
     "server required" fallback screen. Any unavoidable offline limitation is
     a measured debt item (`docs/TECH_DEBT_PAYDOWN.md`), never a silent design.
   - IndexedDB (Dexie) is the local database — all sales, stock, customers cached.
   - Service Worker precaches ALL assets (HTML, JS, CSS, fonts, images).
   - Background sync queue persists pending operations to IndexedDB.
   - Offline invoice numbering (POS-{branch}-{terminal}-{date}-{seq}).
   - Stock reservations prevent overselling across terminals offline.
   - Sync runs ONLY on explicit user demand (Sync Now, server login, explicit
     pull) or per-trigger automation the user set to `auto` in the linkage
     variables (`POS/src/services/link-consent.js`: `auto`/`ask`/`off`,
     default `off`). No boot probe, no online-event auto-flush, no interval
     poll, no auto-reconnect without that consent —
     `POS/tests/standaloneBoot.test.js` fails the build on any of them.
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
- **Never run the two suites concurrently on one machine and call the result a
  regression.** Measured here: `scale.test.js` alone fails 13 assertions with
  HTTP 401 (its registration→login→invoice chain times out under CPU contention),
  and the full server suite reports one failed file — yet `npm test` in isolation,
  on the identical code, is 620/185 green. CI runs them in separate jobs for this
  reason. A red suite beside a busy `vitest` is a measurement artefact, not a
  defect; confirm with a serial run before touching any code.
- **`grid-area: <name>` is not checked by anything — and CSS does not complain.**
  `login.css` declared the page grid under two names (`showcase`, then
  `workspace`), so `.dy-login__workspace` was left pointing at an area no
  `grid-template-areas` string declared. An unknown area name is NOT an error:
  the element falls back to auto-placement, so the workspace column quietly
  stopped being a column and the screen looked "assembled", not broken. The
  second claimant of one named area behaves the same way (pushed into implicit
  rows below). `designTokens.test.js` now cross-checks every `grid-area:` name
  against every `grid-template-areas` string, and fails on orphans.
- **A layout gate that pins `height: 100dvh` + `overflow: hidden` pins the
  fold.** That lock is what made the register link and footer unreachable on a
  short window or a landscape phone; the gate *required* it, which is why it
  survived. The gate is now inverted: it fails if the lock ever returns.
- **A CSS-only gate can be TRUE without looking at anything.** `loginIdentityCard`
  asserted `order.indexOf("showcase") < order.indexOf("panel")` inside the
  narrow breakpoint — a name that breakpoint never declared, so `indexOf`
  returned `-1` and `-1 < 0` passed on every run. Whenever a gate compares
  positions, it must FIRST prove both names were found. Same class as the
  glob-that-runs-nothing and the encoding gate that exempted itself.
- **`node --test <file>` without `--import ./tests/setup.js` fails 20/20, and
  the failures lie.** Running `subscriptions.test.js` bare gave 0/20 with
  `المستأجر غير موجود` and 401s on `/tenants` — because `setup.js` is what
  points the suite at a scratch DB and seeds the auth env. The file is green
  through `npm test` (`node scripts/run-tests.mjs`, which injects
  `--import ./tests/setup.js`). Diagnose with the runner, not with a bare
  `node --test`, or you will "fix" a file that was never broken.
- **A dependency version that does not exist on npm breaks the deploy and
  nothing else.** `instascan@3.2.1` (published versions stop at `2.0.0-rc.4`)
  sat in `POS/package.json`, so `npm ci` in CI died with `ETARGET` before a
  single test ran — while 2148 local tests stayed green, because
  `node_modules` was already populated and `vite build` never resolves an
  import that does not exist: nothing imported it at all. The component read a
  `window.Instascan` global instead (invariant 9). `tests/barcodeScanner.test.js`
  now asserts the dependency is absent AND that no shipped code names the
  global. For any camera/scanner work prefer the ENGINE primitive
  (`BarcodeDetector`): no dependency, no network, invariant 8 intact.
- **A gate must be proven to bite, and its FIRST run is a measurement, not a
  verdict.** `truthfulness.test.js` (S1) went red on its first two runs — both
  times on *its own* regex, never on the product:
  `= {` matched `getCustomerBalance(id) {`, and `revenue:` matched an
  accumulator's zero seed inside a real `reduce`. Fixing the detector is right;
  allow-listing the file would have taught the gate nothing. The file now asserts
  both directions (`mustCatch` / `mustNotCatch`), which is what separates a gate
  from a decoration. The first run also found a genuine defect the tree had been
  hiding behind a comment that said it was honest.
- **Two sources merged into one number must report completeness.** A count that
  reads several stores cannot tell "empty" from "unreadable" unless it says so.
  `device-catalog#countDeviceProducts` returned `0` when both sources failed, and
  its docstring claimed the opposite. It now returns `{count, complete}` and
  `deviceCatalog.test.js` pins the incomplete case.
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
  `server/package.json` + `server/lib/version.js` + `worker-api.js`
  `API_VERSION`). The deploy workflow asserts
  the live `/version.json` against that number; shipping code without a bump
  makes that gate pass over a **failed** deploy, because the domain already
  serves the old number. **`worker-api.js` was the fifth place and it went
  stale on its own** — `/api/edge-health` served `1.44.2` while the release
  was `1.44.3`, and two green suites missed it because neither read that
  literal. `POS/tests/versionDrift.test.js` now asserts all five together.
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
- **A `ref` bound to no element is a silent dead contract.** `StockImportExportDialog`
  had a complete import pipeline (`fileInput`, `handleFileSelect`, `validateRows`,
  `executeImport`) and NO `<input type="file">`; the button called
  `fileInput.value.click()` and `if (fileInput.value)` skipped, so the whole
  feature was unreachable with every suite green. `POS/tests/stockImportDialog.test.js`
  now mounts it and asserts on rendered output. Same class: `<StepCard>` /
  `<ShortcutKey>` used without an import (not in the `main.js` global registry)
  render as unknown elements, and a prop literally named `key` never binds —
  Vue reserves it, so `<kbd>` stayed empty. Render the component, then assert the
  text is there.
- **Mojibake here is UTF-8 re-decoded as CP1252, and it is reversible.** A file
  whose Arabic shows as `Ø§Ù„Ø¹Ù…Ù„Ø©` has each original byte mapped through
  CP1252 then re-encoded as UTF-8 (the BOM often survives as a lone `U+FEFF`).
  Reverse it by mapping each char back to its CP1252 byte — `0x80–0x9F` through
  the CP1252 table, everything else by code point — then decoding the byte array
  as UTF-8. `StockImportExportDialog.vue` was the only such file in the tree;
  check `arabicChars > 0 && no U+FFFD` before claiming it fixed.
