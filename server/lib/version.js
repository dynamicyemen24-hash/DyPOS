/**
 * DyPOS single source of truth for the server version (C3) v1.41.1
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
export const VERSION = '1.41.1';
export default VERSION;
