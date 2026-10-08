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
    expect(router).toContain('return { name: ROUTE_NAMES.LOGIN, query: { redirect: to.fullPath } }')
    expect(router).toContain('return { name: ROUTE_NAMES.REPORTS }')
    expect(router).toContain('if (guestOnly && authenticated)')
    expect(router).toContain("return redirectToDashboard()")
    expect(router).toContain('path: "/account/login"')
    expect(router).not.toContain("EnterpriseControlCenter")
  })

  it("sends every completed login method to the same main dashboard", async () => {
    const login = await source("src/pages/Login.vue")

    expect(login).toContain("await bootstrapAuthenticatedSession()")
    expect(login).toContain("await goToDashboard()")
    expect(login).toMatch(/async function onPasskeyAuthenticated[\\s\\S]*?await goToDashboard\\(\\)/)
    expect(login).toMatch(/async function onPinAuthenticated[\s\S]*?await goToDashboard\(\)/)
  })

  it("keeps the dashboard as the hub for core POS screens", async () => {
    const dashboard = await source("src/components/reports/DashboardPage.vue")

    for (const routeName of [
      "POSSale",
      "WorkScreens",
      "StockManagement",
      "Reports",
    ]) {
      expect(dashboard).toContain(`name: "${routeName}"`)
    }

    expect(dashboard).not.toContain("EnterpriseControlCenter")
  })
})
