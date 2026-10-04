/**
 * Operator menu — the cashier chip in the sale header.
 *
 * The chip rendered with a chevron-down and a pointer cursor for a long time
 * and did nothing at all: `POSHeader` emitted `cashier-clicked` and nobody
 * listened. That is the dead-contract class AGENTS.md warns about — a button
 * that renders and lies. `connection-clicked` and `shift-clicked` were the same
 * story in the same header.
 *
 * The gate asserts on RENDERED OUTPUT and on the dispatch, because a menu that
 * mounts and shows nothing is exactly the defect being guarded against:
 *   - the four destinations actually appear, with their Arabic labels;
 *   - the session name and role are shown (the chip's whole purpose);
 *   - clicking a row emits the key, and the composable routes every key to a
 *     destination that already exists — logout included, which must await the
 *     session teardown BEFORE navigating, or the next screen races the wipe.
 *
 * NOTE on reading the DOM: `Dialog` teleports to `body`, so `wrapper.text()`
 * is empty by design. Every rendered assertion below reads `document.body` —
 * an assertion against the wrapper would pass on a menu that renders nothing.
 */
import { mount } from "@vue/test-utils"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as DyPOSUI from "dypos-ui"
import { __ } from "@/utils/translation"

const goToLogin = vi.fn()
const goToSettings = vi.fn()
const goToWorkScreens = vi.fn()
const terminateSession = vi.fn(async () => {})

vi.mock("@/router", () => ({ goToLogin, goToSettings, goToWorkScreens }))
vi.mock("@/utils/auth", () => ({ terminateSession }))

const sessionUser = vi.fn(() => "محمد العتيبي")
const sessionRole = vi.fn(() => "MANAGER")
vi.mock("@/data/session", () => ({
	sessionUser: () => sessionUser(),
	sessionRole: () => sessionRole(),
}))

const OperatorMenu = (await import("@/components/pos/OperatorMenu.vue")).default
const { useOperatorMenu } = await import("@/composables/useOperatorMenu")

const global = {
	mocks: { __ },
	components: { Button: DyPOSUI.Button, Dialog: DyPOSUI.Dialog },
}

/** What the cashier actually sees — the dialog lives in `body`, not the wrapper. */
const panel = () => document.body.querySelector(".dy-dialog-panel")
const panelText = () => panel()?.textContent ?? ""

beforeEach(() => {
	vi.clearAllMocks()
	terminateSession.mockResolvedValue(undefined)
	sessionUser.mockReturnValue("محمد العتيبي")
	sessionRole.mockReturnValue("MANAGER")
})

afterEach(() => {
	document.body.innerHTML = ""
})

describe("OperatorMenu (rendered)", () => {
	const open = async () => {
		const wrapper = mount(OperatorMenu, { props: { open: true }, global })
		// Teleport + Transition: let both flush before reading the DOM.
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 0))
		return wrapper
	}

	it("renders every destination with its Arabic label", async () => {
		await open()

		expect(panel(), "the dialog panel never reached document.body").toBeTruthy()
		for (const label of [
			"شاشات العمل",
			"تسويات الوردية",
			"الإعدادات",
			"إنهاء الجلسة",
		]) {
			expect(panelText(), `menu row "${label}" is missing`).toContain(label)
		}
	})

	it("shows who the cashier is — the chip's entire purpose", async () => {
		await open()

		expect(panelText()).toContain("محمد العتيبي")
		expect(panelText()).toContain("مدير فرع")
	})

	it("does not invent a label for a role the server would reject", async () => {
		// An unknown role is shown as-is: a made-up Arabic title would tell the
		// cashier they hold permissions the server never granted them.
		sessionRole.mockReturnValue("SOME_FUTURE_ROLE")
		await open()

		expect(panelText()).toContain("SOME_FUTURE_ROLE")
	})

	it("emits the key of the row that was clicked", async () => {
		const wrapper = await open()
		const rows = [...panel().querySelectorAll("button")]
		const settingsRow = rows.find((b) => b.textContent.includes("الإعدادات"))

		expect(settingsRow, "no settings row rendered").toBeTruthy()
		settingsRow.click()
		await wrapper.vm.$nextTick()

		expect(wrapper.emitted("action")).toEqual([["settings"]])
	})

	it("asks the page to close when the dialog closes itself", async () => {
		const wrapper = await open()
		wrapper.findComponent(DyPOSUI.Dialog).vm.$emit("update:modelValue", false)
		await wrapper.vm.$nextTick()

		expect(wrapper.emitted("close")).toBeTruthy()
	})

	it("renders nothing visible while closed", async () => {
		const wrapper = mount(OperatorMenu, { props: { open: false }, global })
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 0))

		expect(panel()).toBeNull()
	})
})

describe("useOperatorMenu (dispatch)", () => {
	it("starts closed and opens on demand", () => {
		const { showOperatorMenu, openOperatorMenu, closeOperatorMenu } =
			useOperatorMenu()

		expect(showOperatorMenu.value).toBe(false)
		openOperatorMenu()
		expect(showOperatorMenu.value).toBe(true)
		closeOperatorMenu()
		expect(showOperatorMenu.value).toBe(false)
	})

	it("closes first, then navigates — the menu never floats over the next screen", async () => {
		const { showOperatorMenu, openOperatorMenu, onOperatorAction } =
			useOperatorMenu()
		openOperatorMenu()

		await onOperatorAction("settings")

		expect(showOperatorMenu.value).toBe(false)
		expect(goToSettings).toHaveBeenCalledTimes(1)
	})

	it("routes work and settlements to the screens that exist", async () => {
		const { onOperatorAction } = useOperatorMenu()

		await onOperatorAction("work")
		expect(goToWorkScreens).toHaveBeenCalledWith()

		await onOperatorAction("settlements")
		expect(goToWorkScreens).toHaveBeenLastCalledWith("settlements")
	})

	it("waits for the session teardown before going to login", async () => {
		// The race: navigating first would restore the session on the login
		// screen and bounce the cashier straight back into the till.
		let releaseTeardown
		terminateSession.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseTeardown = resolve
				}),
		)
		const { onOperatorAction } = useOperatorMenu()

		const pending = onOperatorAction("logout")
		expect(terminateSession).toHaveBeenCalledTimes(1)
		expect(goToLogin).not.toHaveBeenCalled()

		releaseTeardown()
		await pending
		expect(goToLogin).toHaveBeenCalledTimes(1)
	})

	it("ignores an unknown key instead of navigating somewhere arbitrary", async () => {
		const { onOperatorAction } = useOperatorMenu()

		await onOperatorAction("nonsense")

		expect(goToLogin).not.toHaveBeenCalled()
		expect(goToSettings).not.toHaveBeenCalled()
		expect(goToWorkScreens).not.toHaveBeenCalled()
	})
})

describe("the wiring this menu depends on", () => {
	const header = readFileSync("src/components/pos/POSHeader.vue", "utf8")
	const page = readFileSync("src/pages/POSSale.vue", "utf8")

	it("no POSHeader emit is left without a listener", () => {
		// The class of bug this file exists for, stated as a gate: an emit with
		// no consumer is a button that renders and does nothing. Read the two
		// sources rather than mounting a 6k-line page.
		const declared = [...header.matchAll(/emit\('([a-z-]+-clicked)'\)/g)].map(
			(m) => m[1],
		)
		expect(declared.length).toBeGreaterThan(0)

		// `show-notifications` defaults to false, so the bell never renders and
		// its emit is unreachable by construction — a documented exception, not
		// an oversight. Everything else must have a listener.
		const UNREACHABLE = new Set(["notifications-clicked"])

		const orphans = declared.filter(
			(name) => !UNREACHABLE.has(name) && !page.includes(`@${name}=`),
		)
		expect(
			orphans,
			"POSHeader emits with no listener in POSSale.vue — a button that " +
				"renders and does nothing. Wire it or delete the emit.",
		).toEqual([])
	})

	it("POSSale.vue uses the operator menu it imports", () => {
		// An extraction nobody calls is the same dead code wearing a new file
		// name, and it satisfies the dead-code gate while doing nothing.
		expect(page).toContain("useOperatorMenu()")
		expect(page).toContain("<OperatorMenu")
	})

	it("the page passes every dependency the header-actions factory destructures", () => {
		// The exact failure `posHeaderActions.test.js` documents for the
		// keyboard factory, applied to the two deps this round added: a
		// destructured-but-unpassed ref is `undefined` at click time, which is
		// a TypeError for the cashier, not a build error.
		const factory = readFileSync(
			"src/composables/usePosHeaderActions.js",
			"utf8",
		)
		const required = [
			...factory.matchAll(/^\t(showSyncCenter|showOperatorMenu),$/gm),
		].map((m) => m[1])
		expect(required).toEqual(["showSyncCenter", "showOperatorMenu"])

		for (const name of required) {
			expect(
				page.includes(`\t${name},`),
				`createHeaderActions destructures ${name} and POSSale.vue does not pass it: clicking that header button throws at runtime.`,
			).toBe(true)
		}
	})
})
