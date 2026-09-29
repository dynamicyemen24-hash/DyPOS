/**
 * The settings screen must RENDER, not merely route.
 *
 * `SettingsPage.vue` is the only consumer of the `POSSettings` overlay, and it
 * used to pass `:show` + `@close` while `POSSettings` declares `modelValue` +
 * `update:modelValue`. The prop fell through as `undefined`, the overlay's own
 * `show = ref(props.modelValue)` stayed falsy, and its root `v-if="show"` never
 * rendered — so `/settings` was a blank page reached by the gear button, by the
 * nav entry and by deep link.
 *
 * Nothing caught it: the route existed, the component imported cleanly, and the
 * whole suite was green. A dead contract that still compiles and still mounts is
 * the failure mode AGENTS.md calls out — so the gate here asserts on RENDERED
 * OUTPUT, not on the props being passed.
 */
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref, watch } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"

/**
 * Stand-in for the 2,091-line `POSSettings.vue`.
 *
 * It reproduces exactly the behaviour under test: the root is hidden behind
 * `v-if="show"`, and `show` is seeded from `props.modelValue` — NOT from a
 * `show` prop. If the page passes the wrong prop name, this stub renders
 * nothing, which is precisely how the real component behaves.
 */
vi.mock("@/components/settings/POSSettings.vue", () => ({
	default: {
		name: "POSSettings",
		props: {
			modelValue: Boolean,
			posProfile: String,
			currentWarehouse: String,
		},
		emits: ["update:modelValue"],
		template: `
			<div v-if="show" class="pos-settings-root" data-testid="settings-root">
				<slot />
				<button class="close-btn" data-testid="close" @click="$emit('update:modelValue', false)">إغلاق</button>
			</div>
		`,
		setup(props, { emit }) {
			const show = ref(props.modelValue)
			watch(show, (value) => emit("update:modelValue", value))
			return { show }
		},
	},
}))

const SettingsPage = (await import("@/pages/SettingsPage.vue")).default

// `SettingsPage` uses `useRouter()` (provide/inject), so a real router instance
// is required — a `$router` global mock alone leaves the injection undefined.
const router = createRouter({
	history: createMemoryHistory(),
	routes: [
		{ path: "/", name: "POSSale", component: { template: "<div />" } },
		{ path: "/settings", name: "Settings", component: SettingsPage },
	],
})

const mountPage = () =>
	mount(SettingsPage, {
		global: {
			plugins: [router],
			stubs: { RouterLink: true },
		},
	})

describe("general settings page", () => {
	let wrapper

	beforeEach(() => {
		wrapper = mountPage()
	})

	it("actually renders the settings surface", () => {
		// The assertion that matters: output, not props. A blank page passes every
		// prop-level check and every import-level check.
		expect(wrapper.find('[data-testid="settings-root"]').exists()).toBe(true)
	})

	it("shows the overlay open (the page is the permanent-open case)", () => {
		expect(wrapper.find(".pos-settings-root").isVisible()).toBe(true)
	})

	it("leaves the page when the overlay closes", async () => {
		// `goBack` is deliberately dual-path: `back()` when there is history to
		// pop (jsdom starts at length 1, so it takes the `replace` fallback).
		// Either is correct — what matters is that closing navigates somewhere.
		const back = vi.spyOn(router, "back").mockImplementation(() => {})
		const replace = vi.spyOn(router, "replace").mockImplementation(() => {})
		await wrapper.find('[data-testid="close"]').trigger("click")
		expect(back.mock.calls.length + replace.mock.calls.length).toBeGreaterThan(
			0,
		)
		back.mockRestore()
		replace.mockRestore()
	})

	it("passes `modelValue`, the prop the overlay actually declares", () => {
		const overlay = wrapper.findComponent({ name: "POSSettings" })
		expect(overlay.props("modelValue")).toBe(true)
	})
})
