/**
 * DyPOS Playwright — QA Engineering Layer
 * =======================================
 *
 * Architecture (seamless full-stack wiring — every test, even the REST smoke
 * suite, flows through the SAME origin as a real cashier, http://localhost:8080):
 *
 *   browser ──► vite dev :8080 ──proxy (app|api|assets|files|printview)──► Node API :8000
 *
 * webServer (array):
 *   1. Node backend  — `node server.js` on :8000 in TEST mode against a throwaway
 *      temp SQLite file (globalSetup wipes it for determinism). Env is passed
 *      explicitly so `server/.env` (NODE_ENV=production) can never poison the run.
 *   2. POS frontend  — `npm run dev -- --port 8080 --strictPort` (POS/.env absent,
 *      so the SPA falls back to the /api proxy → backend; no POS/.env needed).
 *
 * The API-only smoke spec (e2e/api.smoke.spec.js) runs WITHOUT any browser
 * binary and is the wiring-proof + CI gatekeeper.
 *
 * UI specs (auth/sale/offline/print) are written to run against a Frappe-compatible
 * login contract (`/api/method/login`, CSRF, shift check). TODAY the Node backend
 * only implements REST /api/auth/*, so those specs are DEFERRED via
 *   E2E_UI=1 npx playwright test        # after the compatibility layer lands
 * See docs/QA_ENGINEERING.md "Known gaps" for the exact endpoints required.
 *
 * Run:
 *   npx playwright test                               # full suite
 *   npx playwright test e2e/api.smoke.spec.js         # REST-only (no browser)
 *   E2E_UI=1 npx playwright test e2e/auth.spec.js     # browser UI (needs compat)
 */
const { defineConfig, devices } = require("playwright/test")
const path = require("node:path")

const TEST_RESULTS = path.join(__dirname, "test-results")

module.exports = defineConfig({
	testDir: "./e2e",
	globalSetup: path.join(__dirname, "e2e", "global-setup.js"),
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: [
		["list"],
		["html", { outputFolder: path.join(TEST_RESULTS, "html"), open: "never" }],
	],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
		viewport: { width: 1366, height: 2400 },
		locale: "en-GB",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	timeout: 30 * 1000,
	expect: { timeout: 10 * 1000 },
	webServer: [
		{
			command: "node server.js",
			cwd: path.join(__dirname, "server"),
			url: "http://127.0.0.1:8000/api/ready",
			timeout: 120 * 1000,
			reuseExistingServer: !process.env.CI,
			env: {
				...process.env,
				NODE_ENV: "test",
				DYPOS_PORT: "8000",
				DYPOS_DB_PATH: path.join(TEST_RESULTS, "e2e-db", "dypos-e2e.db"),
				DYPOS_JWT_SECRET: "dypos-e2e-playwright-secret-0123456789abcdef",
				DYPOS_CORS_ORIGIN: "http://localhost:8080",
				DYPOS_WEBHOOKS: "0",
			},
		},
		{
			command: "npm run dev -- --port 8080 --strictPort",
			cwd: path.join(__dirname, "POS"),
			url: "http://localhost:8080",
			timeout: 120 * 1000,
			reuseExistingServer: !process.env.CI,
		},
	],
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
})
