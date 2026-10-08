import { describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import WorkToolbar from "@/components/work/WorkToolbar.vue"

describe("WorkToolbar overflow", () => {
	it("closes on Escape and restores focus to the trigger", async () => {
		const wrapper = mount(WorkToolbar, {
			props: {
				overflowActions: [{ id: "refresh", label: "إعادة التحديث", handler: vi.fn() }],
			},
			attachTo: document.body,
			global: { stubs: { FeatherIcon: true } },
		})
		const trigger = wrapper.get(".work-toolbar__overflow-btn")
		await trigger.trigger("click")
		const item = wrapper.get('[role="menuitem"]')
		item.element.focus()
		expect(document.activeElement).toBe(item.element)

		await item.trigger("keydown", { key: "Escape" })
		expect(wrapper.find('[role="menu"]').exists()).toBe(false)
		expect(document.activeElement).toBe(trigger.element)
	})

	it("executes enabled actions and closes the menu", async () => {
		const handler = vi.fn()
		const wrapper = mount(WorkToolbar, {
			props: { overflowActions: [{ id: "refresh", label: "إعادة التحديث", handler }] },
			global: { stubs: { FeatherIcon: true } },
		})
		await wrapper.get(".work-toolbar__overflow-btn").trigger("click")
		await wrapper.get('[role="menuitem"]').trigger("click")
		expect(handler).toHaveBeenCalledOnce()
		expect(wrapper.find('[role="menu"]').exists()).toBe(false)
	})

	it("does not execute disabled actions", async () => {
		const handler = vi.fn()
		const wrapper = mount(WorkToolbar, {
			props: { overflowActions: [{ id: "refresh", label: "إعادة التحديث", disabled: true, handler }] },
			global: { stubs: { FeatherIcon: true } },
		})
		await wrapper.get(".work-toolbar__overflow-btn").trigger("click")
		expect(wrapper.get('[role="menuitem"]').attributes("disabled")).toBeDefined()
		await wrapper.get('[role="menuitem"]').trigger("click")
		expect(handler).not.toHaveBeenCalled()
	})
})
