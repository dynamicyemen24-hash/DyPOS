import { describe, expect, it } from "vitest"
import { resolveDashboardId } from "@/components/reports/dashboards/core/dashboardTab"

const ids = ["executive-dashboard", "sales-summary"]

describe("resolveDashboardId", () => {
	it("keeps a known dashboard query", () => {
		expect(
			resolveDashboardId("sales-summary", ids, "executive-dashboard"),
		).toBe("sales-summary")
	})

	it("uses the default for missing or unknown dashboard queries", () => {
		expect(resolveDashboardId(undefined, ids, "executive-dashboard")).toBe(
			"executive-dashboard",
		)
		expect(resolveDashboardId("missing", ids, "executive-dashboard")).toBe(
			"executive-dashboard",
		)
	})

	it("normalizes repeated query parameters", () => {
		expect(
			resolveDashboardId(
				["sales-summary", "finance-overview"],
				ids,
				"executive-dashboard",
			),
		).toBe("sales-summary")
	})

	it("falls back to the first registered dashboard when needed", () => {
		expect(resolveDashboardId("missing", ids, "not-registered")).toBe(ids[0])
		expect(resolveDashboardId(undefined, [], "executive-dashboard")).toBe(
			"executive-dashboard",
		)
	})
})
