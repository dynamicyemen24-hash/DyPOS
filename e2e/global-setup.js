/**
 * Playwright global setup — deterministic, throwaway infrastructure.
 *
 * The backend webServer boots against a temp SQLite file under
 * test-results/e2e-db. Removing that directory here guarantees every CI/local
 * run starts from a blank catalog, so seeded products/accounts can never leak
 * between runs. Test artifacts (screenshots/traces) live under test-results too.
 */
const fs = require("node:fs")
const path = require("node:path")

const TEST_RESULTS = path.join(__dirname, "..", "test-results")
const E2E_DB = path.join(TEST_RESULTS, "e2e-db")

module.exports = async function globalSetup() {
	try {
		fs.rmSync(E2E_DB, { recursive: true, force: true })
	} catch (e) {
		// Directory might be locked by webServer startup; ignore and continue
		console.warn("[globalSetup] Could not remove e2e-db:", e.message)
	}
}
