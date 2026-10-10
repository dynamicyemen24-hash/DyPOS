/**
 * Self-checkout route — a real navigation proof, not a source scan.
 *
 * The hole this closes: every existing route test asserts STRINGS in
 * router.js (`toContain('path: "/self-checkout"')`). A barrel that fails
 * to load at runtime, a guard that bounces, or a component that resolves
 * to nothing all pass those tests — and the cashier gets a button that
 * does nothing. This file actually pushes the route through the real
 * router: guard + lazy barrel import + resolved component shape.
 */
import { describe, expect, it } from "vitest"

describe("self-checkout route (real navigation)", () => {
	it("pushing SelfCheckout lands on SelfCheckout with a mountable component", async () => {
		const router = (await import("@/router")).default
		await router.push({ name: "SelfCheckout" })
		await router.isReady()

		const current = router.currentRoute.value
		expect(current.name).toBe("SelfCheckout")

		const resolved = current.matched?.[0]?.components?.default ?? null
		expect(resolved, "lazy barrel resolved to nothing").toBeTruthy()
		expect(
			typeof resolved === "object" &&
				("setup" in resolved || "render" in resolved),
			"resolved route component is not mountable",
		).toBe(true)
	})

	it("the router's barrel path and the screen module agree", async () => {
		const barrel = await import("@/components/selfCheckout")
		expect(typeof barrel.SelfCheckoutScreen).toBe("object")

		const router = (await import("@/router")).default
		await router.push({ name: "SelfCheckout" })
		await router.isReady()
		const resolved = router.currentRoute.value.matched?.[0]?.components?.default
		expect(resolved).toBe(barrel.SelfCheckoutScreen)
	})
})
