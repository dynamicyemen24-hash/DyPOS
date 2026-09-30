/**
 * DyPOS single source of truth for the server version (C3) v1.41.0
 *
 * 1.41.0 — the login family (Login / Register / ForgotPassword /
 * ResetPassword) stops stretching the 1200x630 sharing card behind live
 * copy and frames it as a figure at its native aspect ratio; the four
 * siblings are pinned by designTokens.test.js so one page can never drift
 * back to a cropped `cover`. Also: the POS `biome check .` gate is green
 * again (10 files were never formatted), and the workspace scratch files
 * that kept appearing in `git status` are ignored. Bumped with the change,
 * as the deploy gate compares the live /version.json against this number.
 */
export const VERSION = '1.41.0';
export default VERSION;
