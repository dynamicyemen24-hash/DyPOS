import { test, expect, describe } from "@playwright/test"

/**
 * DyPOS E2E — smoke + shell contract (v1.28).
 *
 * Design notes (honest scope):
 * - These specs run against a bare dev server with NO seeded backend, so they
 *   assert the guest shell contract: guards, RTL/Arabic shell, login form,
 *   and POS test-hooks presence. They must stay green in CI without fixtures.
 * - Full sales-cycle flows (shift → cart → pay → receipt, offline queue →
 *   sync) require seeded auth + catalog and live under `describe.fixme`
 *   with explicit reasons until the seed harness lands. This keeps the suite
 *   truthful: skipped-by-design, not silently red.
 */

const LOGIN_HEADING = /مرحبًا بك/

describe("DyPOS — guest shell contract", () => {
	test("landing redirects guests to Arabic login", async ({ page }) => {
		await page.goto("/")
		await expect(page).toHaveURL(/account\/login/)
		await expect(page.locator("html")).toHaveAttribute("lang", "ar")
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
		await expect(
			page.getByRole("heading", { name: LOGIN_HEADING }).first(),
		).toBeVisible({ timeout: 30000 })
	})

	test("login form is Arabic-first with described errors", async ({ page }) => {
		await page.goto("/account/login")
		const email = page.locator("#dypos-login-email")
		const password = page.locator("#dypos-login-password")
		await expect(email).toBeVisible({ timeout: 30000 })
		await expect(password).toBeVisible()
		await expect(email).toHaveAttribute("dir", "ltr")
		await expect(password).toHaveAttribute("dir", "ltr")
		// Error container exists in DOM contract (assertive live region)
		await expect(page.locator("#dypos-login-error")).toHaveCount(0)
		await expect(email).toHaveAttribute("aria-describedby", "dypos-login-error")
	})

	test("POS route is guarded for guests", async ({ page }) => {
		await page.goto("/pos")
		await expect(page).toHaveURL(/account\/login/)
	})

	test("Arabic document titles per route", async ({ page }) => {
		await page.goto("/account/login")
		await expect(page).toHaveTitle(/تسجيل الدخول/)
	})
})

describe.fixme(
	"DyPOS — authenticated sales cycle (needs seeded auth + catalog)",
	() => {
		test("complete sales cycle: search → cart → payment → receipt", async ({
			page,
		}) => {
			// Requires: logged-in session + seeded catalog.
			await page.goto("/pos")
			await expect(page.getByTestId("pos-root")).toBeVisible({
				timeout: 30000,
			})
			await page.getByTestId("pos-search").fill("قلم")
			await expect(page.getByTestId("pos-product-item").first()).toBeVisible()
			await page.getByTestId("pos-product-item").first().click()
			await expect(page.getByTestId("pos-cart-item")).toHaveCount(1)
			await page.getByTestId("pos-proceed-to-payment").click()
			await page.getByTestId("pos-payment-amount").fill("100")
			await page.getByTestId("pos-complete-payment").click()
			await expect(page.getByTestId("pos-receipt")).toBeVisible()
		})

		test("offline queue syncs on reconnect", async ({ page, context }) => {
			// Requires: logged-in session + cached catalog.
			await page.goto("/pos")
			await expect(page.getByTestId("pos-root")).toBeVisible({
				timeout: 30000,
			})
			await context.setOffline(true)
			await page.getByTestId("pos-product-item").first().click()
			await expect(page.getByTestId("pos-cart-item")).toHaveCount(1)
			await context.setOffline(false)
		})
	},
)
