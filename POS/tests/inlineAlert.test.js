import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import InlineAlert from "@/components/common/InlineAlert.vue"

describe("InlineAlert", () => {
	it.each([
		["info", "status", "polite"],
		["success", "status", "polite"],
		["warning", "status", "polite"],
		["error", "alert", "assertive"],
	])("uses the appropriate live-region semantics for %s", (variant, role, live) => {
		const wrapper = mount(InlineAlert, {
			props: { variant, title: "حالة الاتصال", message: "تعذر الاتصال بالخادم" },
		})
		expect(wrapper.attributes("role")).toBe(role)
		expect(wrapper.attributes("aria-live")).toBe(live)
		expect(wrapper.classes()).toContain(`dy-inline-alert--${variant}`)
		expect(wrapper.text()).toContain("حالة الاتصال")
		expect(wrapper.text()).toContain("تعذر الاتصال بالخادم")
	})

	it("emits dismiss only when the accessible dismiss action is activated", async () => {
		const wrapper = mount(InlineAlert, {
			props: { dismissible: true, dismissLabel: "إغلاق التنبيه" },
		})
		const button = wrapper.get('button[aria-label="إغلاق التنبيه"]')
		await button.trigger("click")
		expect(wrapper.emitted("dismiss")).toHaveLength(1)
	})

	it("does not render a dismiss action unless requested", () => {
		const wrapper = mount(InlineAlert)
		expect(wrapper.find("button").exists()).toBe(false)
	})
})
