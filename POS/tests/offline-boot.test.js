/**
 * Offline-first boot regression.
 *
 * Production incident (2026-09-24): the live site showed a BLANK screen with
 * zero rendered content when /api was unreachable. Two mechanisms combined:
 *  1. The router base was hardcoded to "/pos" while the Worker serves the
 *     app at domain root — no route matched, so RouterView stayed empty.
 *  2. The auth guard awaited a network resource with no ceiling — a hanging
 *     fetch (dead backend, captive portal) froze navigation forever.
 *
 * These tests pin the fixes: adaptive base + a guard that always settles to
 * guest, so Login renders from cache on any device, online or not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// frappe-ui's bare package import breaks under vitest module resolution
// (extensionless internal import); this suite tests OUR boot logic, so the
// transport layer is stubbed. Production behavior is proven by vite build.
vi.mock("frappe-ui", () => ({
	createResource: vi.fn(() => ({
		fetch: vi.fn(async () => null),
		promise: null,
		data: { value: null },
		reset: vi.fn(),
		reload: vi.fn(),
	})),
}))

vi.mock("@/data/user", () => ({
	userResource: {
		fetch: vi.fn(),
		promise: null,
		data: { value: null },
		reset: vi.fn(),
		reload: vi.fn(),
	},
	userData: { refresh: vi.fn() },
}))

vi.mock("@/composables/useShift", () => ({
	shiftState: { isOpen: false },
}))

const goHome = () => {
	window.history.replaceState({}, "", "/")
}

describe("resolveRouterBase (dual-mode serving)", () => {
	beforeEach(async () => {
		vi.resetModules()
		goHome()
	})

	it("serves domain root when the app lives at /", async () => {
		const { resolveRouterBase } = await import("@/router")
		expect(resolveRouterBase()).toBe("/")
	})

	it("keeps /pos base for Frappe-embedded desk pages", async () => {
		window.history.replaceState({}, "", "/pos/account/login")
		const { resolveRouterBase } = await import("@/router")
		expect(resolveRouterBase()).toBe("/pos")
		goHome()
	})
})

describe("settleSession (guard always settles offline)", () => {
	beforeEach(() => {
		vi.resetModules()
		goHome()
	})

	it("fast 405-style rejection settles to guest immediately", async () => {
		const user = await import("@/data/user")
		user.userResource.fetch.mockRejectedValueOnce(
			Object.assign(new Error("Method Not Allowed"), { status: 405 }),
		)
		const { settleSession } = await import("@/router")
		const started = Date.now()
		await expect(settleSession()).resolves.toBe(false)
		expect(Date.now() - started).toBeLessThan(2000)
	})

	it("hanging fetch hits the ceiling and settles to guest", async () => {
		const user = await import("@/data/user")
		user.userResource.fetch.mockImplementationOnce(() => new Promise(() => {}))
		const { settleSession } = await import("@/router")
		const started = Date.now()
		await expect(settleSession(60)).resolves.toBe(false)
		expect(Date.now() - started).toBeLessThan(2000)
	})
})

describe("offline navigation renders Login (no backend)", () => {
	beforeEach(() => {
		vi.resetModules()
		goHome()
	})

	it("push('/') with a dead backend lands on Login, never hangs", async () => {
		const user = await import("@/data/user")
		user.userResource.fetch.mockRejectedValue(
			Object.assign(new Error("Method Not Allowed"), { status: 405 }),
		)
		const router = (await import("@/router")).default
		await router.push("/")
		expect(["Login", "POSSale"]).toContain(router.currentRoute.value.name)
		// Guest with no session must land on Login (POS requires auth).
		expect(router.currentRoute.value.name).toBe("Login")
	}, 15000)
})
