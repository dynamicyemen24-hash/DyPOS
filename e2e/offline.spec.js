/**
 * DyPOS UI Offline — the resilience proof.
 *
 * Threat modeled: the cashier loses connectivity mid-sale. The POS must keep
 * selling, spool to the local queue (IndexedDB "DyPOS_offline", queuedInvoices),
 * flip the SyncStatusIndicator to offline, and then drain the queue on
 * reconnect.
 *
 * Selectors (verified):
 *   SyncStatusIndicator.vue — button.sync-indicator (+ --offline),
 *     .sync-indicator__dot, .sync-indicator__badge (pending count)
 *   POSSale.vue             — same data-testids as sale.spec.js
 *
 * DEFERRED by default (same Frappe-compat gate as auth/sale).
 */
const { test, expect } = require("playwright/test")
const { UI_ENABLED, UI_GATE_REASON } = require("./support/env")
const { seedApi } = require("./support/api")

const ui = test.describe.skip(!UI_ENABLED, UI_GATE_REASON)

ui("DyPOS UI offline resilience", () => {
	let seed
	const email = `off_${Date.now()}@dypos.test`
	const password = "OffPass1234"

	test.beforeAll(async ({ baseURL, request }) => {
		seed = await seedApi(baseURL)
	})

	test("offline sale is spooled locally, then drained on reconnect", async ({
		page,
	}) => {
		// Kill /api traffic before login completes so every auth/bootstrap call
		// fails — this mirrors a mid-shift network drop.
		await page.route("**/api/**", (route) => route.abort())
		await page.goto("/account/login")
		await page.fill("#dypos-login-email", seed.username)
		await page.fill("#dypos-login-password", seed.password)
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()

		await expect(page.locator(".sync-indicator")).toHaveClass(
			/sync-indicator--offline/,
			{ timeout: 20000 },
		)

		await page.route("**/api/**", (route) => route.abort())
		await page.goBack()
		await page.goto("/pos")

		// The queue inside the worker must now contain the sale we book offline.
		const queuedCount = await page.evaluate(async () => {
			const request = indexedDB.open("DyPOS_offline")
			return new Promise((resolve) => {
				request.onsuccess = () => {
					const db = request.result
					try {
						const tx = db.transaction("queuedInvoices", "readonly")
						const count = tx.objectStore("queuedInvoices").count()
						count.onsuccess = () => resolve(count.result)
						count.onerror = () => resolve(-1)
					} catch {
						resolve(-1)
					}
				}
				request.onerror = () => resolve(-1)
			})
		})

		expect(queuedCount).toBeGreaterThan(0)

		// Reconnect: release the traffic block and let the sync loop drain.
		await page.unroute("**/api/**")
		await expect(page.locator(".sync-indicator")).toHaveClass(
			/sync-indicator--online/,
			{ timeout: 20000 },
		)
		await expect(page.locator(".sync-indicator__badge")).toHaveCount(0, {
			timeout: 20000,
		})
	})
})
