/**
 * DyPOS single source of truth for the server version (C3) v1.44.3
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
 * 1.41.1 â€” the production dependency audit is clean again: `@vue/test-utils`
 * sat in `dependencies` while only tests import it, so the chain
 * `js-beautify -> editorconfig -> minimatch -> brace-expansion` was audited as
 * PRODUCTION and failed `npm audit --omit=dev` (one high DoS advisory on a
 * library the PWA never ships). Moved to `devDependencies`; the packaged
 * bundle is byte-identical.
 *
 * 1.41.0 â€” the login family frames the 1200x630 sharing card as a figure at
 * its native aspect ratio instead of stretching it behind live copy, and the
 * POS `biome check .` gate is green again (10 files were never formatted).
 *
 * Bumped with every change, as the deploy gate compares the live
 * /version.json against this number.
 */
export const VERSION = '1.44.3';
export default VERSION;
