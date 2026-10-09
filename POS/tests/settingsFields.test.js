import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import NumberField from "@/components/settings/NumberField.vue"
import SelectField from "@/components/settings/SelectField.vue"

describe("shared settings fields", () => {
	it("exposes numeric validation errors to assistive technology and honors disabled/required", () => {
		const wrapper = mount(NumberField, {
			props: {
				label: "السعر",
				modelValue: 12,
				error: "السعر مطلوب",
				required: true,
				disabled: true,
			},
		})
		const input = wrapper.get('input[type="number"]')
		expect(input.attributes("aria-invalid")).toBe("true")
		expect(input.attributes("aria-describedby")).toBe(wrapper.get('[role="alert"]').attributes("id"))
		expect(input.attributes("required")).toBeDefined()
		expect(input.attributes("disabled")).toBeDefined()
		expect(wrapper.text()).toContain("السعر مطلوب")
	})

	it("exposes select validation errors and keeps option values", async () => {
		const wrapper = mount(SelectField, {
			props: {
				label: "المستودع",
				modelValue: "main",
				error: "اختر مستودعاً",
				options: [
					{ value: "main", label: "الرئيسي" },
					{ value: "secondary", label: "الفرعي" },
				],
			},
		})
		const select = wrapper.get("select")
		expect(select.attributes("aria-invalid")).toBe("true")
		expect(select.attributes("aria-describedby")).toBe(wrapper.get('[role="alert"]').attributes("id"))
		expect(select.element.value).toBe("main")
		await select.setValue("secondary")
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["secondary"])
	})
})
