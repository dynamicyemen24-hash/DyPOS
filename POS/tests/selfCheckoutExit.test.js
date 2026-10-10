/**
 * Kiosk exit — the door out of the customer screen.
 *
 * The kiosk is deliberately staff-nav-free, but stranding whoever opened
 * it is a wall with no door: the cashier who came from POS and the guest
 * from Login must both find a working «عودة». This pins the pure decision
 * (`resolveKioskExit`) and the wired button (internal back only — never a
 * blind jump to an external site; dashboard for staff, login for guests).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"

import { resolveKioskExit } from "@/components/selfCheckout/selfCheckoutState.js"

const mocks = vi.hoisted(() => ({
	back: vi.fn(),
	goToDashboard: vi.fn(),
	goToLogin: vi.fn(),
	historyBack: "/pos",
}))

vi.mock("@/router", () => ({
	default: {
		get options() {
			return { history: { state: { back: mocks.historyBack } } }
		},
		back: (...args) => mocks.back(...args),
	},
	goToDashboard: (...args) => mocks.goToDashboard(...args),
	goToLogin: (...args) => mocks.goToLogin(...args),
}))

function seedLocalSession(email) {
	if (email) {
		localStorage.setItem(
			"dypos_user_session",
			JSON.stringify({
				email,
				full_name: "مستخدم",
				user_id: "u-1",
				role: "CASHIER",
				loginTime: Date.now(),
				expiresAt: Date.now() + 3600_000,
			}),
		)
	} else {
		localStorage.removeItem("dypos_user_session")
	}
}

describe("resolveKioskExit (pure decision)", () => {
	it("prefers an internal history entry", () => {
		expect(resolveKioskExit({ back: "/pos", loggedIn: true })).toBe("back")
		expect(resolveKioskExit({ back: "/account/login", loggedIn: false })).toBe(
			"back",
		)
	})

	it("never jumps blind to an external site", () => {
		expect(
			resolveKioskExit({ back: "https://evil.test/x", loggedIn: true }),
		).toBe("dashboard")
		expect(resolveKioskExit({ back: null, loggedIn: true })).toBe("dashboard")
		expect(resolveKioskExit({ back: undefined, loggedIn: false })).toBe("login")
		expect(resolveKioskExit()).toBe("login")
	})

	it("ignores non-/api-looking tricks and api paths alike", () => {
		expect(resolveKioskExit({ back: "/api/auth/me", loggedIn: true })).toBe(
			"dashboard",
		)
		expect(resolveKioskExit({ back: "", loggedIn: false })).toBe("login")
	})
})

describe("kiosk exit button (wired, never dead)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline")
			}),
		)
		mocks.back.mockClear()
		mocks.goToDashboard.mockClear()
		mocks.goToLogin.mockClear()
		mocks.historyBack = "/pos"
		localStorage.clear()
	})

	it("renders the exit button on the kiosk header", async () => {
		const { default: Screen } = await import(
			"@/components/selfCheckout/SelfCheckoutScreen.vue"
		)
		const wrapper = mount(Screen)
		// NOTE: dynamic import inside it() is intentional — the @/router
		// mock above must win over the real singleton for click assertions.
		expect(wrapper.find('[data-testid="kiosk-exit"]').exists()).toBe(true)
	})

	it("goes back when the previous entry is internal", async () => {
		const { default: Screen } = await import(
			"@/components/selfCheckout/SelfCheckoutScreen.vue"
		)
		const wrapper = mount(Screen)
		mocks.historyBack = "/pos"
		await wrapper.find('[data-testid="kiosk-exit"]').trigger("click")
		expect(mocks.back).toHaveBeenCalledTimes(1)
		expect(mocks.goToDashboard).not.toHaveBeenCalled()
		expect(mocks.goToLogin).not.toHaveBeenCalled()
	})

	it("sends staff to the dashboard (the hub of all work) with no history", async () => {
		seedLocalSession("cashier@shop.test")
		const { default: Screen } = await import(
			"@/components/selfCheckout/SelfCheckoutScreen.vue"
		)
		const wrapper = mount(Screen)
		mocks.historyBack = null
		await wrapper.find('[data-testid="kiosk-exit"]').trigger("click")
		expect(mocks.back).not.toHaveBeenCalled()
		expect(mocks.goToDashboard).toHaveBeenCalledTimes(1)
	})

	it("sends guests to login with no history", async () => {
		seedLocalSession(null)
		const { default: Screen } = await import(
			"@/components/selfCheckout/SelfCheckoutScreen.vue"
		)
		const wrapper = mount(Screen)
		mocks.historyBack = null
		await wrapper.find('[data-testid="kiosk-exit"]').trigger("click")
		expect(mocks.back).not.toHaveBeenCalled()
		expect(mocks.goToLogin).toHaveBeenCalledTimes(1)
	})
})
