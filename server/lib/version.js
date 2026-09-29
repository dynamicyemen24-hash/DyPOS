/**
 * DyPOS single source of truth for the server version (C3) v1.40.0
 *
 * 1.40.0 — the POS sale page's keyboard shortcuts and header actions land as
 * two composables, and the extraction's two dead identifiers (a `closeHeld`
 * that never existed, a `showSmartDock` the factory never destructured) are
 * fixed and pinned by POS/tests/posHeaderActions.test.js. Login's buttons
 * gained accessible names, and the corrupted generated block in
 * styles/dypos/tokens.css — duplicate palettes with `.` instead of `;` and an
 * unclosed comment — is gone. Bumped with the change, as the deploy gate
 * compares the live /version.json against this number.
 */
export const VERSION = '1.40.0';
export default VERSION;
