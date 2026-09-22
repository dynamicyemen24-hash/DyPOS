/**
 * DyPOS UI Auth — register → login → wrong-password error → logout.
 *
 * Selectors (verified against POS/src/pages/Login.vue + Register.vue):
 *   #dypos-login-email | #dypos-login-password | #dypos-login-error (role=alert)
 *   #dypos-register-name | -email | -password | -confirm
 * Register success banner: "تم إنشاء الحساب بنجاح!"
 * Logout lives in UserMenu.vue ("Logout" item).
 *
 * DEFERRED by default: requires Frappe-compat login (see e2e/support/env.js).
 */
const { test, expect } = require("playwright/test")
const { UI_ENABLED, UI_GATE_REASON } = require("./support/env")
const { seedApi } = require("./support/api")

const ui = test.describe.skip(!UI_ENABLED, UI_GATE_REASON)

ui("DyPOS UI auth", () => {
	let seed
	const email = `ui_${Date.now()}@dypos.test`
	const password = "UiPass1234"

	test.beforeAll(async ({ baseURL, request }) => {
		seed = await seedApi(baseURL)
	})

	test("register a new account through the UI", async ({ page }) => {
		await page.goto("/account/register")
		await page.fill("#dypos-register-name", "UI Register User")
		await page.fill("#dypos-register-email", email)
		await page.fill("#dypos-register-password", password)
		await page.fill("#dypos-register-confirm", password)
		await page
			.locator('.dy-register__checkbox-label input[type="checkbox"]')
			.check()
		await page
			.getByRole("button", { name: /إنشاء|تسجيل/i })
			.first()
			.click()

		await expect(page.getByText("تم إنشاء الحساب بنجاح!")).toBeVisible()
	})

	test("login through the UI and land on the dashboard", async ({ page }) => {
		await page.goto("/account/login")
		await page.fill("#dypos-login-email", email)
		await page.fill("#dypos-login-password", password)
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()

		await expect(page).not.toHaveURL(/account\/login/, { timeout: 20000 })
	})

	test("wrong password shows the inline error", async ({ page }) => {
		await page.goto("/account/login")
		await page.fill("#dypos-login-email", email)
		await page.fill("#dypos-login-password", "definitely-not-the-password")
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()

		await expect(page.locator("#dypos-login-error")).toBeVisible()
	})

	test("logout returns to the login screen", async ({ page }) => {
		await page.goto("/account/login")
		await page.fill("#dypos-login-email", email)
		await page.fill("#dypos-login-password", password)
		await page
			.locator("form", { has: page.locator("#dypos-login-email") })
			.getByRole("button")
			.first()
			.click()
		await expect(page).not.toHaveURL(/account\/login/, { timeout: 20000 })

		// Header user menu → "Logout".
		await page.locator("header").getByRole("button").first().click()
		await page.getByText("Logout").click()

		await expect(page).toHaveURL(/account\/login/)
	})
})
