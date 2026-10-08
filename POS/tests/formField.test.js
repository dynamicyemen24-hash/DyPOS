import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import FormField from "@/components/ui/FormField.vue"

describe("FormField", () => {
	it("connects the visible label and help text to the slotted control", () => {
		const wrapper = mount(FormField, {
			props: { label: "اسم الصنف", description: "اسم ظاهر في الفاتورة" },
			slots: {
				default: ({ fieldId, describedBy }) =>
					`<input id="${fieldId}" aria-describedby="${describedBy}" />`,
			},
		})
		const input = wrapper.find("input")
		expect(wrapper.find("label").attributes("for")).toBe(input.attributes("id"))
		expect(input.attributes("aria-describedby")).toBeTruthy()
		expect(wrapper.text()).toContain("اسم ظاهر في الفاتورة")
	})

	it("announces validation errors and exposes invalid state to the control slot", () => {
		const wrapper = mount(FormField, {
			props: { label: "السعر", error: "القيمة غير صالحة" },
			slots: {
				default: ({ fieldId, describedBy, invalid, errorId }) =>
					`<input id="${fieldId}" aria-describedby="${describedBy}" aria-invalid="${invalid}" data-error-id="${errorId}" />`,
			},
		})
		const input = wrapper.find("input")
		expect(input.attributes("aria-invalid")).toBe("true")
		expect(input.attributes("aria-describedby")).toBe(wrapper.find('[role="alert"]').attributes("id"))
		expect(wrapper.find('[role="alert"]').text()).toBe("القيمة غير صالحة")
	})

	it("supports a caller-provided id without generating a conflicting label target", () => {
		const wrapper = mount(FormField, {
			props: { id: "custom-product-name", label: "اسم المنتج" },
			slots: { default: ({ fieldId }) => `<input id="${fieldId}" />` },
		})
		expect(wrapper.find("label").attributes("for")).toBe("custom-product-name")
		expect(wrapper.find("input").attributes("id")).toBe("custom-product-name")
	})
})
