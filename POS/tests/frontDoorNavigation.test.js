import { describe, expect, it } from "vitest"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

async function source(path) {
	return readFile(join(process.cwd(), path), "utf8")
}

describe("DyPOS front-door navigation", () => {
	it("opens the login route for unauthenticated users and the dashboard for authenticated users", async () => {
		const router = await source("src/router.js")

		expect(router).toContain('path: "/"')
		expect(router).toContain(
			"return { name: ROUTE_NAMES.LOGIN, query: { redirect: to.fullPath } }",
		)
		expect(router).toContain("return { name: ROUTE_NAMES.REPORTS }")
		expect(router).toContain("if (guestOnly && authenticated)")
		expect(router).toContain("return redirectToDashboard()")
		expect(router).toContain('path: "/account/login"')
		expect(router).not.toContain("EnterpriseControlCenter")
	})

	it("sends every completed login method to the same main dashboard", async () => {
		const login = await source("src/pages/Login.vue")

		expect(login).toContain("await bootstrapAuthenticatedSession()")
		expect(login).toContain("await goToDashboard()")
		expect(login).toMatch(
			/async function onPasskeyAuthenticated[\s\S]*?await goToDashboard\(\)/,
		)
		expect(login).toMatch(
			/async function onPinAuthenticated[\s\S]*?await goToDashboard\(\)/,
		)

		const register = await source("src/pages/Register.vue")
		expect(register).toContain('router.replace({ name: "Reports" })')
	})

	it("keeps the dashboard as the hub for core POS screens", async () => {
		const dashboard = await source("src/components/reports/DashboardPage.vue")

		// Hub links live in the single access-policy table and render via v-for —
		// the dashboard binds modules by role/capability instead of hardcoding tiles.
		expect(dashboard).toContain("filterHomeModules")
		expect(dashboard).toContain('v-for="module in modules"')

		const policy = await source("src/utils/accessPolicy.js")
		for (const routeName of [
			"POSSale",
			"WorkScreens",
			"StockManagement",
			"Reports",
		]) {
			expect(policy).toContain(`"${routeName}"`)
		}

		expect(dashboard).toContain("نظام نقاط البيع الذكي")
		expect(dashboard).toContain("بدء بيع جديد")
		expect(dashboard).toContain("آخر المبيعات")
		expect(dashboard).not.toContain("EnterpriseControlCenter")

		const toolbar = await source("src/components/pos/POSGlobalToolbar.vue")
		expect(toolbar).not.toContain("enterprise")
	})
})
