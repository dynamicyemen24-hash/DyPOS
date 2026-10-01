/**
 * DyPOS single source of truth for the server version (C3) v1.43.0
 *
 * 1.42.0 -- standalone-first networking: zero connections without user
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
 */
export const VERSION = '1.43.0';
export default VERSION;
