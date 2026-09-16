import { test, expect, beforeEach, describe } from "@playwright/test"

describe("DyPOS - Offline Mode", () => {
	const BASE_URL = "/pos"

	beforeEach(async ({ page }) => {
		// Mock offline mode
		await page.addInitScript(() => {
			// Set up offline state
			window.navigator.onLine = false
			// Dispatch offline event
			window.dispatchEvent(new Event("offline"))
		})

		await page.goto(BASE_URL)
		// Wait for POS to be ready
		await expect(page.locator('[data-testid="pos-root"]')).toBeVisible({
			timeout: 30000,
		})
	})

	test("POS should work in offline mode - browse items from cache", async ({
		page,
	}) => {
		// Wait for items to load from cache
		await expect(page.locator(".item-grid-item")).toHaveCountGreaterThan(0)

		// Search for an item
		await page.fill('[data-testid="item-search"]', "test")
		await expect(page.locator(".search-results-item")).toHaveCountGreaterThan(0)
	})

	test("POS should work in offline mode - select customer from cache", async ({
		page,
	}) => {
		// First add an item to cart
		await page.click('[data-testid="add-sample-item"]')

		// Try to select customer from cache
		await page.click('[data-testid="customer-button"]')
		await expect(page.locator(".customer-list-item")).toHaveCountGreaterThan(0)
	})

	test("POS should queue invoice when offline and sync when online", async ({
		page,
	}) => {
		// Make a sale while offline
		await page.click('[data-testid="add-sample-item"]')
		await page.click('[data-testid="proceed-to-payment"]')

		// Should show saved offline notification
		await expect(page.locator(".saved-offline-notification")).toBeVisible()

		// Now go online and verify sync
		await page.addInitScript(() => {
			window.navigator.onLine = true
			window.dispatchEvent(new Event("online"))
		})

		await page.waitForLoadState("networkidle")
		await expect(page.locator(".synced-notification")).toBeVisible({
			timeout: 10000,
		})
	})

	test("POS should display ZATCA compliance indicator", async ({ page }) => {
		// Wait for ZATCA header to load
		await expect(page.locator(".zatca-compliance")).toBeVisible({
			timeout: 10000,
		})
		await expect(page.locator(".registration-number")).toBeVisible({
			timeout: 10000,
		})
		await expect(page.locator(".validity-date")).toBeVisible({ timeout: 10000 })
	})
})

describe("DyPOS - Core Sales Flow", () => {
	const BASE_URL = "/pos"

	beforeEach(async ({ page }) => {
		await page.goto(BASE_URL)
		await expect(page.locator('[data-testid="pos-root"]')).toBeVisible({
			timeout: 30000,
		})
	})

	test("complete sales cycle: items -> customer -> payment -> receipt", async ({
		page,
	}) => {
		// Open shift
		await page.click('[data-testid="open-shift-btn"]')
		await expect(
			page.locator('[data-testid="shift-open-success"]'),
		).toBeVisible()

		// Add items to cart
		await page.click('[data-testid="add-item-001"]')
		await page.click('[data-testid="add-item-002"]')
		await expect(page.locator(".cart-item")).toHaveCount(2)

		// Select customer
		await page.click('[data-testid="customer-button"]')
		await page.fill('[data-testid="customer-search"]', "walk-in")
		await page.click('[data-testid="customer-walk-in"]')

		// Proceed to payment
		await page.click('[data-testid="proceed-to-payment"]')

		// Select cash payment
		await page.click('[data-testid="payment-cash"]')
		await page.fill('[data-testid="payment-amount"]', "100")

		// Complete payment
		await page.click('[data-testid="complete-payment"]')

		// Should show success
		await expect(page.locator(".invoice-success")).toBeVisible()
		await expect(page.locator(".receipt-printable")).toBeVisible()
	})

	test("promotional offers should apply automatically", async ({ page }) => {
		await page.click('[data-testid="open-shift-btn"]')
		await page.click('[data-testid="add-item-001"]')

		// Check for offers
		await page.click('[data-testid="show-offers-btn"]')
		await expect(page.locator(".offer-list-item")).toHaveCountGreaterThan(0)

		// Apply an offer
		await page.click('[data-testid="apply-offer-0"]')
		await expect(page.locator(".discount-applied")).toBeVisible()
	})

	test("split payments should work correctly", async ({ page }) => {
		await page.click('[data-testid="open-shift-btn"]')
		await page.click('[data-testid="add-item-001"]')
		await page.click('[data-testid="proceed-to-payment"]')

		// Select first payment method
		await page.click('[data-testid="payment-cash"]')
		await page.fill('[data-testid="payment-amount"]', "50")

		// Add second payment method
		await page.click('[data-testid="payment-card"]')
		await page.fill('[data-testid="payment-amount"]', "50")

		// Complete payment
		await page.click('[data-testid="complete-payment"]')

		await expect(page.locator(".invoice-success")).toBeVisible()
	})

	test("ZATCA invoice should have compliance header", async ({ page }) => {
		// Open shift
		await page.click('[data-testid="open-shift-btn"]')
		await page.click('[data-testid="add-item-001"]')
		await page.click('[data-testid="proceed-to-payment"]')

		// Select cash payment
		await page.click('[data-testid="payment-cash"]')
		await page.fill('[data-testid="payment-amount"]', "100")

		// Complete payment
		await page.click('[data-testid="complete-payment"]')

		// Verify ZATCA compliance header on invoice
		await expect(page.locator(".zatca-header")).toBeVisible({ timeout: 5000 })
		await expect(page.locator(".registration-number")).toBeVisible({
			timeout: 5000,
		})
		await expect(page.locator(".validity-period")).toBeVisible({
			timeout: 5000,
		})
	})
})
