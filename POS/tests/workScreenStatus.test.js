import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import WorkScreenStatus from "@/components/work/WorkScreenStatus.vue"

describe("WorkScreenStatus", () => {
	it("shows a real record count and local fallback provenance", () => {
		const wrapper = mount(WorkScreenStatus, {
			props: { count: 24, source: "local", loading: false },
			global: { stubs: { FeatherIcon: true } },
		})
		expect(wrapper.text()).toContain("24")
		expect(wrapper.text()).toContain("نسخة محلية")
		expect(wrapper.find('[data-state="local"]').exists()).toBe(true)
	})

	it("marks an unavailable source without claiming the dataset is empty", () => {
		const wrapper = mount(WorkScreenStatus, {
			props: { count: 0, source: "unavailable" },
			global: { stubs: { FeatherIcon: true } },
		})
		expect(wrapper.text()).toContain("المصدر غير متاح")
		expect(wrapper.find('[data-state="unavailable"]').exists()).toBe(true)
		expect(wrapper.text()).not.toContain("لا توجد بيانات")
	})

	it("does not invent a last-loaded timestamp when no successful load exists", () => {
		const wrapper = mount(WorkScreenStatus, {
			props: { count: 0, source: "", updatedAt: null },
			global: { stubs: { FeatherIcon: true } },
		})
		expect(wrapper.text()).not.toContain("آخر تحميل")
	})
})
