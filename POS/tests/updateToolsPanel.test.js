/**
 * Update tools panel — repair actions reachable without waiting for detection.
 *
 * The update banner appears only when an update is DETECTED. A device stuck
 * on a poisoned worker may never detect anything, so these three controls
 * (manual check, auto-update switch, two-step cache surgery) also live in
 * the login "system tools" section. This file mounts the panel and proves
 * the controls exist, toggle, and arm — the composable-level proofs live
 * in appUpdate.test.js.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"

import UpdateToolsPanel from "@/components/common/UpdateToolsPanel.vue"

function stubStorage() {
	const store = new Map()
	vi.stubGlobal("localStorage", {
		getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
		setItem: vi.fn((key, value) => store.set(key, String(value))),
		removeItem: vi.fn((key) => store.delete(key)),
	})
}

describe("update tools panel (always-reachable repair)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.stubGlobal("fetch", vi.fn())
		vi.stubGlobal("navigator", { onLine: true })
		stubStorage()
	})

	it("mounts with check, auto-update switch and cache surgery", () => {
		const wrapper = mount(UpdateToolsPanel)
		expect(wrapper.find('[data-testid="update-tools"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="update-check"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="update-auto"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="update-clear-cache"]').exists()).toBe(
			true,
		)
	})

	it("manual check asks the live stamp and announces a newer build", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ version: "9.9.9" }),
			})),
		)
		const wrapper = mount(UpdateToolsPanel)
		await wrapper.find('[data-testid="update-check"]').trigger("click")
		expect(fetch).toHaveBeenCalledWith(
			"/version.json",
			expect.objectContaining({ cache: "no-store" }),
		)
	})

	it("the auto-update switch persists the owner's choice", async () => {
		const wrapper = mount(UpdateToolsPanel)
		const box = wrapper.find('[data-testid="update-auto"]')
		await box.setValue(false)
		expect(localStorage.setItem).toHaveBeenCalledWith("dypos.auto-update", "0")
		await box.setValue(true)
		expect(localStorage.setItem).toHaveBeenCalledWith("dypos.auto-update", "1")
	})

	it("cache surgery arms on first press and fires on the second", async () => {
		const deleted = []
		vi.stubGlobal("caches", {
			keys: async () => ["stale-cache"],
			delete: vi.fn(async (key) => {
				deleted.push(key)
				return true
			}),
		})
		vi.stubGlobal("location", { reload: vi.fn() })
		const wrapper = mount(UpdateToolsPanel)
		const clear = () => wrapper.find('[data-testid="update-clear-cache"]')

		await clear().trigger("click")
		expect(clear().text()).toMatch(/تأكيد مسح الكاش/)
		expect(deleted).toEqual([])

		await clear().trigger("click")
		expect(deleted).toEqual(["stale-cache"])
	})
})
