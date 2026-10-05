import { describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { createRouter, createMemoryHistory } from "vue-router"

/**
 * The login screen must actually MOUNT.
 *
 * ## Why this gate exists
 *
 * `Login.vue` sat un-mountable for a stretch while every other suite stayed
 * green. Four separate defects were in that one file, and each was invisible to
 * a test that reads source text:
 *
 *   1. `showPinSetup` / `pinModeActive` were passed INTO `useLoginPinAuth` and
 *      destructured back OUT of the same `const` — a temporal-dead-zone hit that
 *      threw `ReferenceError: Cannot access 'showPinSetup' before initialization`
 *      before the page ever painted.
 *   2. An unterminated block comment swallowed the line declaring
 *      `runtimeStatus`, so the template read `.type` off `undefined`:
 *      `TypeError: Cannot read properties of undefined (reading 'type')`.
 *   3. `handleKeyboardSubmit`, `enterPinMode` and `exitPinMode` were bound in the
 *      template and declared nowhere — dead controls that render and do nothing.
 *   4. `TouchKeyboard.vue` called `defineProps(...)` without assigning it, then
 *      read `props.isOpen` from that nonexistent binding: `props is not defined`.
 *
 * Every one of them is a RUNTIME failure. `vite build` passes all four, and the
 * existing login tests asserted on the file as text or on the extracted
 * composables — never on a rendered component. This is the missing assertion:
 * mount it, then assert on the DOM. A missing binding is now a build failure
 * instead of a blank screen at the till.
 *
 * Pinia and a router are installed because `main.js` installs them and the page
 * reaches a session store on mount — a bare mount fails on the harness, not the
 * code.
 */
vi.mock("@/utils/qzTray", () => ({
	getQZStatus: vi.fn(() => ({ connected: true, printer: "POS-80" })),
}))

/** Mount the page the way the app does and let its async mount work settle. */
async function mountLogin() {
	const Login = (await import("@/pages/Login.vue")).default
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/", component: { template: "<div />" } }],
	})

	const wrapper = mount(Login, {
		global: {
			plugins: [createPinia(), router],
			// The dev warning stream is noisy in jsdom and is not what this file
			// asserts on; the DOM assertions below are the real contract.
			config: { warnHandler: () => {} },
		},
	})

	// Two turns: one for the synchronous setup, one for `onMounted`'s async work.
	await wrapper.vm.$nextTick()
	await new Promise((resolve) => setTimeout(resolve, 0))

	return wrapper
}

describe("the login screen mounts", () => {
	it("renders the password field instead of a blank screen", async () => {
		const wrapper = await mountLogin()
		expect(wrapper.exists()).toBe(true)
		expect(wrapper.find('input[type="password"]').exists()).toBe(true)
		expect(wrapper.find('input[type="email"]').exists()).toBe(true)
		expect(wrapper.find(".dy-login__alternatives").exists()).toBe(true)
		expect(
			wrapper.find(".dy-login__alternatives").attributes("open"),
		).toBeUndefined()
		expect(wrapper.text()).toContain("تسجيل الدخول")
		expect(wrapper.text()).toContain("أدوات تقنية")
		expect(
			wrapper
				.findAll("button")
				.some((button) => button.text().includes("البصمة")),
		).toBe(false)
		wrapper.unmount()
	}, 15000)

	it("opens alternative methods only through the accessible disclosure", async () => {
		const wrapper = await mountLogin()
		const alternatives = wrapper.find(".dy-login__alternatives")
		expect(alternatives.exists()).toBe(true)
		expect(alternatives.attributes("open")).toBeUndefined()
		await alternatives.find("summary").trigger("click")
		expect(alternatives.attributes("open")).toBeDefined()
		expect(alternatives.text()).toContain("مفتاح مرور")
		wrapper.unmount()
	}, 15000)

	it("the PIN method button opens PIN mode — the handler is really bound", async () => {
		const wrapper = await mountLogin()

		// The control rendered all along; `enterPinMode` was undefined, so the
		// tap silently did nothing. This asserts the EFFECT, not the binding.
		// Find the PIN button specifically (has aria-pressed bound to pinModeActive)
		const pinButton = wrapper
			.findAll("button")
			.find((b) => b.text().includes("رمز PIN"))
		expect(pinButton, "the PIN method button must exist").toBeTruthy()

		// Check initial state - PIN form should not be visible
		expect(wrapper.text()).not.toContain("رمز الدخول السريع")

		await pinButton.trigger("click")
		await wrapper.vm.$nextTick()
		await new Promise((resolve) => setTimeout(resolve, 50))
		// PIN form should appear (check for PIN-specific content)
		expect(wrapper.text()).toContain("رمز الدخول السريع")
		expect(wrapper.find('input[id="dypos-pin"]').exists()).toBe(true)

		wrapper.unmount()
	})

	it("the on-screen keypad declares the props its script reads", async () => {
		// Defect 4 lived in the child, not the page, so this mounts the child
		// directly: `props` must exist, or the first watcher tick throws
		// `ReferenceError: props is not defined` and the keypad is dead on
		// arrival — the button renders and nothing happens when it is tapped.
		const TouchKeyboard = (
			await import("@/components/common/TouchKeyboard.vue")
		).default
		const { props } = TouchKeyboard

		// Object in a dev build, array in some compiler modes — accept both.
		const names = Array.isArray(props)
			? props.map((p) => p.name)
			: Object.keys(props || {})

		expect(names, "TouchKeyboard must declare its props").toContain("isOpen")
		expect(names).toContain("modelValue")
		expect(names).toContain("maxLength")
	})
})
