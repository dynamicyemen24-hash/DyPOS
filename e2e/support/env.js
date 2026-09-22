/**
 * Deferred-UI gate — see docs/QA_ENGINEERING.md "Known gaps".
 *
 * The browser specs below are fully written, but the Node backend currently
 * serves REST (/api/auth/*) while the POS frontend authenticates through the
 * Frappe contract (/api/method/login, CSRF fetch, shift check). Until the
 * backend exposes those endpoints, the UI specs are skipped; CI relies on
 * e2e/api.smoke.spec.js (no browser) instead.
 */
const UI_ENABLED = process.env.E2E_UI === "1"

const UI_GATE_REASON =
	'UI e2e deferred: frontend authenticates via Frappe-style /api/method/login + CSRF + shift check, which the Node backend does not expose yet. Run with E2E_UI=1 after the compatibility layer lands (see docs/QA_ENGINEERING.md, "Known gaps").'

module.exports = { UI_ENABLED, UI_GATE_REASON }
