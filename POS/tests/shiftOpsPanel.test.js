/**
 * Mounting the operational panels — the receipts for the dead-code fix.
 *
 * ## What defect this file exists for
 *
 * `AnnouncementTicker.vue` and `DeviceHealthPanel.vue` were both complete:
 * markup, styles, a composable each, and unit tests for every rule in those
 * composables. What neither had was a CONSUMER. `tests/deadCode.test.js` named
 * them by path — "in POS/src but nothing imports them — they never reach the
 * bundle".
 *
 * The instructive part is WHY the suite stayed green for as long as it did.
 * The unit tests passed because they tested the composables, and the
 * composables passed because they were correct. Both halves were real and the
 * FEATURE was absent — the exact shape of the `WorkForm.vue`,
 * `WorkWizard.vue` and `WorkNotification.vue` defects AGENTS.md documents.
 *
 * ## Why these tests MOUNT instead of reading a composable
 *
 * Reading the composable would prove nothing about the template. Every
 * assertion below is on text that can only appear if the markup really
 * executed, which is the gap the old suite left open.
 */
import { describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"

import ShiftOpsPanel from "@/components/common/ShiftOpsPanel.vue"
import AnnouncementTicker from "@/components/common/AnnouncementTicker.vue"
import DeviceHealthPanel from "@/components/common/DeviceHealthPanel.vue"
import {
	parseAnnouncements,
	ANNOUNCEMENTS_KEY,
} from "@/composables/useShiftOps"

vi.mock("@/utils/translation", () => ({ __: (s) => s, t: (s) => s }))

vi.mock("@/utils/offline/db", () => ({
	getSetting: vi.fn(async () => []),
}))

vi.mock("@/utils/qzTray", () => ({
	getQZStatus: vi.fn(() => ({
		connected: true,
		connecting: false,
		printer: "POS-80",
	})),
}))

const { getQZStatus } = await import("@/utils/qzTray")

describe("AnnouncementTicker renders its text", () => {
	it("shows the notice, not just a container", () => {
		// The assertion is on the NOTICE STRING. A ticker whose template never
		// ran would still satisfy `expect(wrapper.exists()).toBe(true)`.
		const wrapper = mount(AnnouncementTicker, {
			props: {
				announcements: [{ text: "سعر الصرف اليوم 3.75", level: "info" }],
			},
		})
		expect(wrapper.text()).toContain("سعر الصرف اليوم 3.75")
		expect(wrapper.text()).toContain("تعليمات")
	})

	it("renders NOTHING when there is nothing to say", () => {
		// The empty case is the one that matters: no placeholder, no default
		// rate. A fabricated instruction is worse than no instruction.
		const wrapper = mount(AnnouncementTicker, { props: { announcements: [] } })
		expect(wrapper.find(".announce").exists()).toBe(false)
		expect(wrapper.text()).toBe("")
	})

	it("never renders an expired notice", () => {
		// An expired exchange rate still on screen is a real financial error,
		// so expiry is enforced in the data layer and asserted through the UI.
		const wrapper = mount(AnnouncementTicker, {
			props: {
				announcements: [
					{ text: "سعر قديم", expiresAt: "2000-01-01T00:00:00.000Z" },
					{ text: "سعر اليوم", level: "warning" },
				],
			},
		})
		expect(wrapper.text()).toContain("سعر اليوم")
		expect(wrapper.text()).not.toContain("سعر قديم")
	})

	it("counts the extra notices rather than hiding them", () => {
		const wrapper = mount(AnnouncementTicker, {
			props: {
				announcements: [
					{ text: "عاجل: غلق مبكر", level: "critical" },
					{ text: "تعليمات: سياسة الإرجاع" },
					{ text: "تعليمات: مواعيد التسليم" },
				],
			},
		})
		// The most urgent one leads, and the count says two more exist — so the
		// cashier knows the screen is not showing everything.
		expect(wrapper.text()).toContain("عاجل: غلق مبكر")
		expect(wrapper.text()).toContain("+2")
	})
})
describe("DeviceHealthPanel renders its rows", () => {
	it("lists one row per device after an explicit check", async () => {
		const wrapper = mount(DeviceHealthPanel)
		// Nothing is claimed before the button is pressed — no boot probe.
		expect(wrapper.text()).not.toContain("طابعة الفواتير")

		const button = wrapper.find("button")
		expect(button.exists()).toBe(true)
		await button.trigger("click")
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain("طابعة الفواتير")
		})

		expect(wrapper.text()).toContain("الميزان")
		expect(wrapper.text()).toContain("درج النقدية")
		expect(wrapper.text()).toContain("الفوترة الضريبية")
		// The printer name comes from the bridge snapshot, so the panel
		// reports what it actually read rather than a fixed string.
		expect(wrapper.text()).toContain("POS-80")
	})

	it("does NOT report a printer as fine when the bridge is down", async () => {
		getQZStatus.mockReturnValue({
			connected: false,
			connecting: false,
			printer: null,
		})
		const wrapper = mount(DeviceHealthPanel)
		await wrapper.find("button").trigger("click")
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain("خدمة الطباعة")
		})
		// "حالة الأجهزة" must never read as a clean bill of health.
		expect(wrapper.text()).not.toContain("كل الأجهزة سليمة")
		getQZStatus.mockReturnValue({
			connected: true,
			connecting: false,
			printer: "POS-80",
		})
	})
})

describe("ShiftOpsPanel is the consumer both panels were missing", () => {
	it("mounts the ticker and hides the device body until asked", async () => {
		const wrapper = mount(ShiftOpsPanel)
		const toggle = wrapper.find(".shift-ops__toggle")

		expect(toggle.exists()).toBe(true)
		expect(toggle.attributes("aria-expanded")).toBe("false")
		expect(wrapper.find("#shift-ops-body").attributes("style")).toContain(
			"display: none",
		)

		await toggle.trigger("click")

		expect(wrapper.find(".shift-ops__toggle").attributes("aria-expanded")).toBe(
			"true",
		)
		// Asserted on the inline style rather than `isVisible()`: that helper
		// also consults `offsetParent`, which happy-dom does not implement, so
		// it reports `false` for a node the DOM itself shows as displayed.
		// The declaration under test is the `display` toggle, and this is the
		// declaration Vue actually writes.
		expect(wrapper.find("#shift-ops-body").attributes("style")).not.toContain(
			"display: none",
		)
		// The probe still has not run: opening the panel is not a probe.
		expect(wrapper.text()).not.toContain("كل الأجهزة سليمة")
	})

	it("never passes autoCheck, which would probe devices on mount", () => {
		// Invariant 8. Stated as a rendered prop because the failure it
		// prevents is invisible in a passing suite: a panel that opens ports on
		describe("parseAnnouncements refuses to invent a notice", () => {
			it("passes an array through", () => {
				expect(parseAnnouncements([{ text: "أ" }])).toHaveLength(1)
			})

			it("parses a JSON string, because that is what a textarea stores", () => {
				expect(parseAnnouncements('[{"text":"سعر الصرف"}]')).toEqual([
					{ text: "سعر الصرف" },
				])
			})

			it("treats a lone object as one notice", () => {
				expect(parseAnnouncements({ text: "تنبيه" })).toEqual([
					{ text: "تنبيه" },
				])
			})

			it("returns EMPTY for unparseable text rather than showing the JSON", () => {
				// `[{"text":` is a settings mistake. Putting it on the cashier's screen
				// would be worse than showing nothing at all.
				expect(parseAnnouncements('[{"text":')).toEqual([])
				expect(parseAnnouncements("")).toEqual([])
				expect(parseAnnouncements("   ")).toEqual([])
			})

			it("returns EMPTY for a value that is not a list at all", () => {
				expect(parseAnnouncements(null)).toEqual([])
				expect(parseAnnouncements(undefined)).toEqual([])
				expect(parseAnnouncements(42)).toEqual([])
			})

			it("names the settings key the panel reads", () => {
				// A key nothing writes is a feature nobody can configure — the same
				// silent gap as a button that renders and does nothing.
				expect(ANNOUNCEMENTS_KEY).toBe("shift_announcements")
			})
		})
		// every login.
		const wrapper = mount(ShiftOpsPanel)
		const panel = wrapper.findComponent(DeviceHealthPanel)
		expect(panel.exists()).toBe(true)
		expect(panel.props("autoCheck")).toBe(false)
	})
})
