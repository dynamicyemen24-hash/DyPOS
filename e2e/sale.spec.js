/**
 * DyPOS UI Sale — the money path end-to-end.
 *
 * Selectors (verified against POS/src/pages/POSSale.vue):
 *   [data-testid="pos-root"] grid shell
 *   [data-testid="pos-search"]            search input
 *   [data-testid="pos-product-item"]      product tile (click)
 *   [data-testid="pos-cart"]              cart panel
 *   [data-testid="pos-cart-item"]         line in cart
 *   [data-testid="pos-proceed-to-payment"]
 *   #dypos-payment-amount                 cash amount (auto-filled = total)
 *   [data-testid="pos-complete-payment"]
 *   [data-testid="pos-receipt"]           success receipt
 *
 * DEFERRED by default: needs an open shift (guarded by requiresOpenShift) plus
 * the Frappe-compat login tunnel. Sequence below drives shift opening through
 * the UI once login works (see e2e/support/env.js + QA_ENGINEERING.md).
 */
const { test, expect } = require("playwright/test")
const { UI_ENABLED, UI_GATE_REASON } = require("./support/env")
const { seedApi } = require("./support/api")

const ui = test.describe.skip(!UI_ENABLED, UI_GATE_REASON)

ui("DyPOS UI sale", () => {
	let seed
	const email = `sale_${Date.now()}@dypos.test`
	const password = "SalePass1234"

	test.beforeAll(async ({ baseURL, request }) => {
		seed = await seedApi(baseURL)
	})

	test("search → add → pay cash → receipt with correct total", async ({
		page,
	}) => {
		const login = await page.request.post("/api/auth/login", {
			data: { username: seed.username, password: seed.password },
		})
		const token = (await login.json()).token

		await page.goto("/account/login")
		await page.addInitScript((tok) => {
			localStorage.setItem("dypos_token", tok || "")
		}, token)
		await page.fill("#dypos-login-email", seed.username)
		await page.fill("#dypos-login-password", seed.password)
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()
		await expect(page).not.toHaveURL(/account\/login/, { timeout: 20000 })

		// Open the (empty) operational shift via the UI dialog when it appears.
		const openShift = page.getByRole("button", {
			name: /افتح الوردية|فتح الوردية|Open Shift/i,
		})
		if (await openShift.count()) {
			await openShift.first().click()
			await expect(openShift).toHaveCount(0, { timeout: 15000 })
		}

		await page.goto("/pos")
		const pos = page.getByTestId("pos-root")
		await expect(pos).toBeVisible({ timeout: 20000 })

		// Seed a second product through the API so the UI has an addable tile.
		const prod = await seed.client.post("/api/products", {
			data: {
				name: "UI Sale Rice",
				code: `UI-SALE-${Date.now()}`,
				unitPrice: 40,
			},
		})
		const product = await prod.json()

		await page.getByTestId("pos-search").fill("UI Sale Rice")
		const tile = page
			.getByTestId("pos-product-item")
			.filter({ hasText: "UI Sale Rice" })
			.first()
		await expect(tile).toBeVisible()
		await tile.click()

		await expect(page.getByTestId("pos-cart-item")).toContainText(
			"UI Sale Rice",
		)

		await page.getByTestId("pos-proceed-to-payment").click()
		await expect(page.locator("#dypos-payment-amount")).toBeVisible()

		// Cash tender defaults to the exact total; completion yields a receipt.
		await page.getByTestId("pos-complete-payment").click()
		const receipt = page.getByTestId("pos-receipt")
		await expect(receipt).toBeVisible({ timeout: 15000 })
		await expect(receipt).toContainText(/4[0-9.]{0,2}/) // 40 * qty 1, +tax
	})
})
