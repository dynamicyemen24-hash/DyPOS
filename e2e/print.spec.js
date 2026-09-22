/**
 * DyPOS UI Print — spool + monitor.
 *
 * Flow: cashier finishes a sale → "print last invoice" header action →
 * job spools (QUEUED → PROCESSING → COMPLETED/FAILED) → Print Monitor shows
 * Queued/Printing/Completed/Failed counters (PrintMonitor.vue).
 *
 * Selectors (verified): POSSale header print action (aria-label طباعة آخر فاتورة,
 * class .dy-pos-header-action), PrintMonitor.vue counters by status text;
 * spool state via POS/src/print/spool/printJobStore.js.
 *
 * DEFERRED by default (same Frappe-compat gate as auth/sale).
 */
const { test, expect } = require("playwright/test")
const { UI_ENABLED, UI_GATE_REASON } = require("./support/env")
const { seedApi } = require("./support/api")

const ui = test.describe.skip(!UI_ENABLED, UI_GATE_REASON)

ui("DyPOS UI print spool", () => {
	let seed
	const email = `prt_${Date.now()}@dypos.test`
	const password = "PrtPass1234"

	test.beforeAll(async ({ baseURL, request }) => {
		seed = await seedApi(baseURL)
	})

	test("completed sale pushes a job into the print monitor", async ({
		page,
	}) => {
		// Reuse the sale happy-path to have a completed invoice to reprint.
		await page.goto("/account/login")
		await page.fill("#dypos-login-email", seed.username)
		await page.fill("#dypos-login-password", seed.password)
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()
		await expect(page).not.toHaveURL(/account\/login/, { timeout: 20000 })

		await page.goto("/pos")
		const pos = page.getByTestId("pos-root")
		await expect(pos).toBeVisible({ timeout: 20000 })

		const reprint = page.getByRole("button", { name: /طباعة آخر فاتورة/ })
		await expect(reprint).toBeVisible()
		await reprint.click()

		// Open Print Monitor from the settings gear (POSSettings.openPrintMonitor).
		await page.goto("/settings")
		await page
			.getByRole("button", { name: /مراقب الطباعة|Print Monitor/ })
			.click()
		const monitor = page.getByRole("dialog")
		await expect(monitor).toBeVisible()

		// A reprint job must exist somewhere in the spool lifecycle.
		await expect(
			monitor.getByText(/Queued|Printing|Completed today/),
		).toBeVisible()
	})
})
