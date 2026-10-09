import { afterEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import WorkQuickFilters from "@/components/work/WorkQuickFilters.vue"
import WorkSearch from "@/components/work/WorkSearch.vue"

describe("WorkQuickFilters", () => {
	it("shows counts and emits selected values, including reset to all", async () => {
		const wrapper = mount(WorkQuickFilters, {
			props: {
				label: "حالة الفاتورة",
				total: 8,
				options: [
					{ value: "Paid", label: "Paid", count: 5 },
					{ value: "Unpaid", label: "Unpaid", count: 3 },
				],
			},
		})
		const buttons = wrapper.findAll("button")
		expect(buttons).toHaveLength(3)
		expect(wrapper.text()).toContain("8")
		expect(wrapper.text()).toContain("5")
		await buttons[1].trigger("click")
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["Paid"])
		await wrapper.setProps({ modelValue: "Paid" })
		await buttons[1].trigger("click")
		expect(wrapper.emitted("update:modelValue")?.[1]).toEqual([""])
	})
})

describe("WorkSearch", () => {
	afterEach(() => vi.useRealTimers())

	it("debounces search events and respects the clearable option", async () => {
		vi.useFakeTimers()
		const wrapper = mount(WorkSearch, {
			props: { label: "بحث", modelValue: "", debounce: 250, clearable: false },
			global: { stubs: { FeatherIcon: true } },
		})
		const input = wrapper.get("input")
		await input.setValue("فاتورة")
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["فاتورة"])
		expect(wrapper.emitted("search")).toBeUndefined()
		await vi.advanceTimersByTimeAsync(249)
		expect(wrapper.emitted("search")).toBeUndefined()
		await vi.advanceTimersByTimeAsync(1)
		expect(wrapper.emitted("search")?.[0]).toEqual(["فاتورة"])
		expect(wrapper.find(".work-search__clear").exists()).toBe(false)
		wrapper.unmount()
	})
})
