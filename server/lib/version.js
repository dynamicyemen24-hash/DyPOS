/**
 * DyPOS single source of truth for the server version (C3) v1.47.3
 *
 * 1.44.6 -- the round where a green suite stopped being evidence. Fourteen real
 * defects, and the reason no gate saw them is the same every time: a gate that
 * READS text cannot see a binding that is missing at RUN time. `vite build`
 * accepted all fourteen; 2077 unit tests accepted all fourteen.
 *
 *   - `Login.vue` did not render at all. An unterminated block comment swallowed
 *     the line declaring `runtimeStatus`, so the template read `.type` off
 *     `undefined` -- `TypeError: Cannot read properties of undefined (reading
 *     'type')`. Separately, `showPinSetup`/`pinModeActive` were passed INTO a
 *     composable and destructured back OUT of the same `const` (a
 *     temporal-dead-zone hit), and `handleKeyboardSubmit` / `enterPinMode` /
 *     `exitPinMode` were bound in the template and declared nowhere.
 *   - `TouchKeyboard.vue` called `defineProps(...)` without assigning it, then
 *     read `props.isOpen` off the nonexistent binding.
 *   - Five files called `__()` inside `<script setup>` without importing it --
 *     it resolves through `globalProperties` in a TEMPLATE, never in a script.
 *   - The self-checkout sale exported `backToCart`, `chooseMethod`,
 *     `setTenderMinor` and `bumpTenderMinor` and defined NONE of them: a customer
 *     at that till could not go back from payment, could not change payment
 *     method, and could not type or add an amount. Its screen also never called
 *     `startSession()`, so the session stayed `IDLE` and every item tap was
 *     silently ignored -- the feature could not sell anything at all.
 *   - The offline payment error told the cashier "the operation was not
 *     applied" while the sale was already in IndexedDB (invariant 8). The
 *     honest retry is to ring it again, and that is how a customer is charged
 *     twice. It now says the sale is saved and will sync.
 *   - `canConfirm` accepted an EMPTY cart, issuing a zero-value invoice.
 *   - `setTenderMinor` clamped the tender to the total, so a customer paying
 *     150 against 125 was shown "paid exactly" and left 25 short.
 *   - `StockImportExportDialog` validated with `"product_code required"` and
 *     `"invalid uom"` -- English, rendered verbatim in the preview table.
 *
 * The round's actual product is the three gates that would have caught them:
 * every SFC is MOUNTED (`sfcCompiles.test.js`), a sale runs end to end
 * (`selfCheckoutSale.test.js`), and every user-facing message is asserted to be
 * Arabic and to name a recovery (`errorMessages.test.js`).
 *
 * 1.44.5 -- the round that finished what a green suite was hiding. Three
 * defects, none of which any test could see, because each one lived in the
 * gap between a gate and what it claimed to measure:
 *   - the encoding gate exempted ITSELF. Its signatures were written as
 *     literal characters, so the file matched its own detector and the only
 *     way out was a KNOWN_UNREPAIRABLE entry naming the gate -- exactly the
 *     one file whose corruption silently switches the check off. They are
 *     escapes now, so the gate covers itself and the list is one file again.
 *   - the operator menu arrived by RAISING the file-size cap (6239 -> 6259),
 *     which is the one direction the ratchet forbids. Paid for by extraction
 *     instead: the three print paths moved to `useSalePrint.js` (they shared
 *     one spool -> direct -> browser fallback chain, copied three times in a
 *     page no suite mounts) and the cap now moves DOWN, 6239 -> 6155.
 *   - `create-local-user.mjs` carried the default password `DyPOS@2026` in
 *     the repository with `must_change_password=0`. It now generates a
 *     20-character password, forces the change on first login, and never
 *     resets a live account's password.
 *
 * 1.44.3 -- the last deferred debt items closed. `formatter.enabled` is on
 * for the server and all five style rules it had been carrying as exemptions
 * (`useTemplate`, `useSingleVarDeclarator`, `useNumberNamespace`,
 * `useNodejsImportProtocol`, `noUnusedTemplateLiteral`) are errors: 211 files
 * clean. The round taught one thing worth keeping: `lineWidth: 100` does not
 * merely re-wrap, it SPLIT member chains -- `(await req(...)).body` followed
 * by a bare `.token;` line -- which silently drops the expression and turned
 * five suites red with HTTP 401. `lineWidth: 120` keeps the chain whole, so
 * that is what the config pins; the ratchet caps follow the measured numbers.
 *
 * 1.44.2 -- login screen: 137 lines of unreferenced CSS removed from
 * login.css (eleven selectors from the SystemAboutPanel migration), the
 * page gained its missing <h1> (and the PIN-setup heading moved h3 -> h2 so
 * the outline no longer starts at level 2), and "create account" now routes
 * through the SPA instead of reloading the document. Two gates keep it.
 * * 1.44.1 -- the file-size ratchet was not measuring anything. Three caps had
 * drifted above their files (db/schema.js 1037 vs 745, routes/method.js 3907
 * vs 3784, pages/Login.vue 1890 vs 1845) -- 460 lines of unmeasured growth
 * had been passing -- and four of the largest modules in src/ (offline.worker,
 * posCart, posSettings, AutocompleteSelect) carried no cap at all. Every cap
 * is now the measured number. docs/TECH_DEBT_PAYDOWN.md was re-measured: it
 * still charged for three files deleted in 1.39.0 and listed DOCTYPES as
 * "scheduled" when it ships in routes/doctypes.js.
 * 1.44.0 -- the queue system ships PROVEN. 21 modules landed with zero
 * tests, so two production defects lived in the tree unnoticed:
 *   - issueTicket wrote its TICKET_CREATED event OUTSIDE the Dexie
 *     transaction, which refuses it: issuing a ticket threw
 *     NotFoundError, so the kiosk could not issue at all.
 *   - CALLED -> TRANSFERRED was missing from the state machine, so the
 *     transfer button failed on the most common path it exists for.
 * Both are covered by tests that fail if they regress
 * (POS/tests/queueDomain.test.js, POS/tests/queueRepository.test.js).
 * Also: server.js 618 -> 601 lines (rate limiters extracted, passkeys
 * mounted inside routes/auth.js), and 204 lines of dead brand-panel CSS
 * removed from Register.vue behind a gate that keeps it gone.
 * * 1.42.0 -- standalone-first networking: zero connections without user
 * demand or granted linkage consent (services/link-consent.js,
 * auto/ask/off per trigger, default off), enforced by
 * POS/tests/standaloneBoot.test.js; the API-upstream outage is now a
 * deploy-time gate (`npm run upstream`) instead of a red heartbeat; the
 * edge worker version is pinned to this single source by
 * server/tests/worker-version.test.js.
 *
 * 1.41.2 -- the subscriber-#1 operational run is now a repeatable, measured
 * gate instead of a one-off: `npm run e2e:yaqoub` boots a real server and
 * drives 17 checks as the shop's own manager account (login -> shift -> sale
 * -> payment -> stock -> report -> settlement -> void), and the item-search
 * registry moved to `stores/itemListRegistry.js` with 12 new unit tests
 * behind a lowered file-size cap.
 *
 * 1.41.1 — the production dependency audit is clean again: `@vue/test-utils`
 * sat in `dependencies` while only tests import it, so the chain
 * `js-beautify -> editorconfig -> minimatch -> brace-expansion` was audited as
 * PRODUCTION and failed `npm audit --omit=dev` (one high DoS advisory on a
 * library the PWA never ships). Moved to `devDependencies`; the packaged
 * bundle is byte-identical.
 *
 * 1.41.0 — the login family frames the 1200x630 sharing card as a figure at
 * its native aspect ratio instead of stretching it behind live copy, and the
 * POS `biome check .` gate is green again (10 files were never formatted).
 *
 * Bumped with every change, as the deploy gate compares the live
 * /version.json against this number.
 *
 * 1.45.1 -- the transaction-safety round: duplicate sales on retry are
 * impossible (stable idempotency from cart-open through the sync queue to the
 * server dedupe), the daily Z report is tenant-isolated, zero-value invoices
 * cannot be issued, the registration screen reads clean Arabic again, and an
 * import-time crash in the brand module (TDZ) is fixed. All suites green.
 *
 * 1.46.0 -- operational maturity End-to-End: login shift dialog rewired to its
 * contract (v-model + shift-opened/dialog-closed), PIN unified through the
 * single authentication path, auth errors Arabic with recovery and never leak
 * English transport text, offline shift queue fixed (indexed keys + drain on
 * reconnect) with offline close wired, sale search debounced + grid-windowed
 * with all clear paths synced, customer display follows the effective
 * (pinned) account, payment methods show loading + retry, barcode lookup is
 * offline-first with honest miss, and stock auto-sync requires link consent.
 *
 * 1.47.0 -- first-subscriber provisioning (Royal International, Marib):
 * opt-in IndexedDB seed (company/branch/warehouse/YER + owner-supplied users
 * + owner-supplied opening stock), one-shot with secret-key deletion.
 *
 * 1.47.1 -- subscriber manager account: `yaqoub.sahel` (MANAGER, Royal tenant)
 * joins the Royal fixture users — `npm run e2e:yaqoub` authenticates as him,
 * and the seed no longer tells the operator to run itself first for an
 * account it never created.
 *
 * 1.47.2 -- one-link subscriber opt-in: `?subscriber=royal-marib` claims and
 * scrubs itself (including the login guard's nested `redirect` copy), so the
 * owner's device provisions without pasting keys.
 *
 * 1.47.3 -- offline boot on installed devices: the `/*.js` immutable edge
 * rule also matched `/sw.js`, so devices kept a worker whose precache URLs
 * no longer existed (importScripts 404 → empty caches → dead offline boot).
 * Immutable caching is now scoped to hashed paths only; `/sw.js` revalidates.
 */
export const VERSION = '1.47.3';
export default VERSION;
