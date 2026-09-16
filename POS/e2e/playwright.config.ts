import { defineConfig, devices } from "@playwright/test"

/**
 * DyPOS E2E Test Configuration
 *
 * المعايير العالمية المطبقة:
 * - Page Object Model للمكونات المعقدة
 * - Fixtures reusable للمختبرات المتكررة
 * - اختبارات مستقلة ومعزولة (isolated)
 * - البيانات الإنشائية (fixtures data) مسؤولة عن التحضير
 * - Retry logic للاختبارات غير المستقرة
 * - تسميات واضحة ومصفوفة (metadata) لكل اختبار
 * - تتبع الزمني للاختبارات (tracing)
 *
 * PoC - Sketch: هذه هي النسخة الأولى من الاختبارات.
 * في الإصدارات القادمة سنضيف:
 * - مولد بيانات عشوائي (Faker) للاختبارات
 * - Page Objects للمكونات المعقدة
 * - اختبارات دمج مع ERP (Dycos)
 * - اختبارات أداء (Lighthouse, Web Vitals)
 * - اختبارات أمان (OWASP)
 */

const buildVersion = process.env.DyPOS_BUILD_VERSION || "latest"

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		["list", { outputStyle: "compact" }],
		["html", { outputFolder: "e2e-report", open: "never" }],
		["json", { outputFile: "e2e-report/results.json" }],
	],
	use: {
		baseURL: process.env.POS_BASE_URL || "http://localhost:8080",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "replay-on-failure",
		actionTimeout: 10000,
		navigationTimeout: 30000,
		headless: true,
		viewport: { width: 1280, height: 720 },
		locale: "ar-SA",
		timezoneId: "Asia/Riyadh",
		colorScheme: "light",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: ["e2e/offline.spec.ts"],
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
		{
			name: "mobile-chromium",
			use: { ...devices["iPhone 13"] },
		},
		{
			name: "offline-mode",
			testMatch: ["e2e/offline.spec.ts"],
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
	webServer: process.env.CI
		? undefined
		: {
				command: "cd ../.. && yarn dev",
				url: "http://localhost:8080/pos",
				reuse: true,
				timeout: 120000,
			},
	outputDir: "e2e-test-results",
	globalSetup: "e2e/global-setup.ts",
	globalTeardown: "e2e/global-teardown.ts",
})
