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

module.exports = async function globalSetup() {
	fs.rmSync(TEST_RESULTS, { recursive: true, force: true })
}
