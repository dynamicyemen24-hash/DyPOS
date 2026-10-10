/**
 * Work-kit extensions gate — the behaviors added in this round, asserted on
 * RENDERED output (S5), not on intentions.
 *
 * What each block pins:
 *  1. FormControl — an error is announced (role=alert) AND wired to the input
 *     (`aria-invalid` + `aria-describedby`); barcode mode gets the mobile
 *     keypad contract and Enter re-emits.
 *  2. Alert — the `actions` slot (recovery buttons) actually renders; `role`
 *     can be demoted to `status` for non-urgent notices.
 *  3. ActionButton — a double click is swallowed (`event.detail >= 2`) before
 *     route/link/emit, and the coarse-pointer 44px floor exists in source.
 *  4. Drawer — focus enters on open, Escape closes, focus RETURNS to trigger.
 *  5. Dialog — `position: "bottom"` renders the bottom-sheet panel class.
 *  6. Combobox — Arabic-diacritic-insensitive filtering, keyboard selection,
 *     clear → null (WAI-ARIA combobox contract).
 *  7. useToast — an error is STICKY (no timer ever hides it) yet can be
 *     displaced by new information; a toast `action` button runs its handler.
 *  8. WorkTable — `loading` renders skeletons (never fake rows), `error`
 *     renders role=alert with a retry that emits, never a confident empty.
 *  9. StatusBadge — verified statuses show the verified Arabic label + icon;
 *     unknown values pass through raw (no invented meaning).
 * 10. WorkMenuStrip — toolbar role, W3C aria-keyshortcuts, real shortcut
 *     dispatch, select emit.
 * 11. WorkStatusStrip — alert/assertive for errors, polite status otherwise,
 *     metrics + last-update provenance.
 * 12. WorkPanel — header/body/footer wiring and density class.
 * 13. WorkFilterField — the select branch is a real Combobox and keeps the
 *     legacy string contract ("" for empty).
 * 14. workNotifications — the dead, renderer-less store stays deleted (S7b).
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

import * as DyPOSUI from "dypos-ui"
import { useToast } from "@/composables/useToast"
import { __ } from "@/utils/translation"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")

const StatusBadge = (await import("@/components/work/StatusBadge.vue")).default
const WorkMenuStrip = (await import("@/components/work/WorkMenuStrip.vue"))
	.default
const WorkStatusStrip = (await import("@/components/work/WorkStatusStrip.vue"))
	.default
const WorkPanel = (await import("@/components/work/WorkPanel.vue")).default
const WorkTable = (await import("@/components/work/WorkTable.vue")).default
const WorkFilterField = (await import("@/components/work/WorkFilterField.vue"))
	.default
const Toast = (await import("@/components/common/Toast.vue")).default

/** تطبيق لا يُقلَّد `__` في الاختبارات: النص العربي الخام يمر كما هو. */
const globalBase = () => ({ mocks: { __ } })

const mounted = []
function mountTracked(component, options) {
	const wrapper = mount(component, options)
	mounted.push(wrapper)
	return wrapper
}

beforeEach(() => {
	document.body.innerHTML = ""
	const { clearAllToasts } = useToast()
	clearAllToasts()
})

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		if (wrapper?.unmount) {
			try {
				wrapper.unmount()
			} catch {
				/* already unmounted */
			}
		}
	}
	document.body.innerHTML = ""
	vi.useRealTimers()
})

describe("FormControl — error is announced and wired to the input", () => {
	it("renders role=alert and points aria-invalid/aria-describedby at it", () => {
		const wrapper = mountTracked(DyPOSUI.FormControl, {
			props: { label: "الاسم", error: "حقل مطلوب", modelValue: "" },
			global: globalBase(),
		})
		const input = wrapper.find("input")
		expect(input.exists()).toBe(true)
		expect(input.attributes("aria-invalid")).toBe("true")
		const described = input.attributes("aria-describedby") || ""
		expect(described).toContain("-error")
		const alert = wrapper.find('[role="alert"]')
		expect(alert.exists()).toBe(true)
		expect(alert.text()).toContain("حقل مطلوب")
	})

	it("barcode mode sets the mobile keypad contract and re-emits enter", async () => {
		const wrapper = mountTracked(DyPOSUI.FormControl, {
			props: { label: "الباركود", barcode: true, modelValue: "" },
			global: globalBase(),
		})
		const input = wrapper.find("input")
		expect(input.attributes("enterkeyhint")).toBe("go")
		expect(input.attributes("autocomplete")).toBe("off")
		await input.trigger("keydown", { key: "Enter" })
		expect(wrapper.emitted("enter")).toBeTruthy()
	})
})

describe("Alert — recovery actions and role", () => {
	it("renders the actions slot and honors the role prop", () => {
		const wrapper = mountTracked(DyPOSUI.Alert, {
			props: { title: "تنبيه", role: "status" },
			slots: {
				default: "نص التنبيه",
				actions: '<button class="alert-retry">إعادة المحاولة</button>',
			},
			global: globalBase(),
		})
		expect(wrapper.find('[role="status"]').exists()).toBe(true)
		const retry = wrapper.find(".alert-retry")
		expect(retry.exists()).toBe(true)
		expect(retry.text()).toContain("إعادة المحاولة")
	})

	it("defaults to role=alert for urgent notices", () => {
		const wrapper = mountTracked(DyPOSUI.Alert, {
			props: { title: "فشل" },
			global: globalBase(),
		})
		expect(wrapper.find('[role="alert"]').exists()).toBe(true)
	})
})

describe("ActionButton — double-click guard + touch floor", () => {
	it("swallows the second click of a double click before it bubbles", () => {
		const wrapper = mountTracked(DyPOSUI.ActionButton, {
			props: { label: "حفظ" },
			attachTo: document.body,
			global: globalBase(),
		})
		const el = wrapper.find("button").element
		const seen = []
		const spy = (event) => seen.push(event.detail)
		document.addEventListener("click", spy)
		try {
			const first = new MouseEvent("click", {
				detail: 1,
				cancelable: true,
				bubbles: true,
			})
			expect(el.dispatchEvent(first)).toBe(true)
			expect(seen).toContain(1)

			const second = new MouseEvent("click", {
				detail: 2,
				cancelable: true,
				bubbles: true,
			})
			// prevented + stopped: neither reaches the document listener again
			expect(el.dispatchEvent(second)).toBe(false)
			expect(seen).toEqual([1])
		} finally {
			document.removeEventListener("click", spy)
		}
	})

	it("carries the coarse-pointer 44px floor in its own stylesheet", () => {
		const source = readFileSync(
			join(
				POS,
				"packages",
				"dypos-ui",
				"src",
				"components",
				"ActionButton.vue",
			),
			"utf8",
		)
		expect(source).toMatch(/@media \(pointer: coarse\)/)
		expect(source).toMatch(/--dy-touch-min/)
	})
})

describe("Drawer — focus management", () => {
	it("moves focus inside on open, Escape closes, focus returns to trigger", async () => {
		const wrapper = mountTracked(
			{
				template: `
					<div>
						<button id="drawer-opener">افتح</button>
						<Drawer v-model="open" title="تفاصيل">
							<button id="drawer-inside">تعديل</button>
						</Drawer>
					</div>`,
				components: { Drawer: DyPOSUI.Drawer },
				data: () => ({ open: false }),
			},
			{ attachTo: document.body, global: globalBase() },
		)

		const opener = document.getElementById("drawer-opener")
		opener.focus()
		expect(document.activeElement).toBe(opener)

		wrapper.vm.open = true
		await nextTick()
		await nextTick()
		const active = document.activeElement
		expect(active).not.toBe(opener)
		expect(active).not.toBe(document.body)
		// focus is inside the drawer panel (first focusable: the close button)
		expect(active.closest(".dy-drawer-panel")).not.toBeNull()

		active.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		)
		await nextTick()
		await nextTick()
		expect(wrapper.vm.open).toBe(false)
		expect(document.activeElement).toBe(opener)
	})
})

describe("Dialog — bottom sheet", () => {
	it("position:bottom renders the bottom-sheet panel class", async () => {
		mountTracked(DyPOSUI.Dialog, {
			props: {
				modelValue: true,
				options: { title: "تنبيه", position: "bottom" },
			},
			attachTo: document.body,
			global: globalBase(),
		})
		await nextTick()
		const panel = document.querySelector(".dy-dialog-panel")
		expect(panel).not.toBeNull()
		expect(panel.classList.contains("dy-dialog-panel--bottom")).toBe(true)
	})

	it("keeps the centered class when no position is requested", async () => {
		mountTracked(DyPOSUI.Dialog, {
			props: { modelValue: true, options: { title: "تنبيه" } },
			attachTo: document.body,
			global: globalBase(),
		})
		await nextTick()
		const panel = document.querySelector(".dy-dialog-panel")
		expect(panel).not.toBeNull()
		expect(panel.classList.contains("dy-dialog-panel--bottom")).toBe(false)
	})
})

describe("Combobox — searchable select", () => {
	const options = [
		{ value: "stores", label: "مخزن المخزون" },
		{ value: "cats", label: "تصنيفات المنتجات" },
	]

	function mountCombo(props = {}) {
		return mountTracked(DyPOSUI.Combobox, {
			props: { options, modelValue: null, ...props },
			attachTo: document.body,
			global: {
				...globalBase(),
				components: { FeatherIcon: DyPOSUI.FeatherIcon },
			},
		})
	}

	it("filters Arabic without diacritics and selects with the keyboard", async () => {
		const wrapper = mountCombo()
		const input = wrapper.find("input")

		// "مخزن" without tashkeel must match "مخزن" written with damma/fatha.
		await input.setValue("مخزَن")
		await nextTick()
		expect(wrapper.findAll('[role="option"]').length).toBe(1)

		await input.trigger("focus")
		expect(input.attributes("aria-expanded")).toBe("true")
		await input.trigger("keydown", { key: "Enter" })
		await nextTick()
		const emitted = wrapper.emitted("update:modelValue")
		expect(emitted).toBeTruthy()
		expect(emitted.at(-1)).toEqual(["stores"])
	})

	it("shows the empty state text instead of a confident blank list", async () => {
		const wrapper = mountCombo()
		await wrapper.find("input").setValue("غير موجود أبدا")
		await nextTick()
		expect(wrapper.find(".dy-combobox__empty").exists()).toBe(true)
		expect(wrapper.find(".dy-combobox__empty").text()).toContain("لا توجد")
	})

	it('clear emits null (the WorkFilterField layer turns that into "")', async () => {
		const wrapper = mountCombo({ modelValue: "stores" })
		await nextTick()
		const clear = wrapper.find(".dy-combobox__clear")
		expect(clear.exists()).toBe(true)
		await clear.trigger("click")
		const emitted = wrapper.emitted("update:modelValue")
		expect(emitted.at(-1)).toEqual([null])
	})
})

describe("useToast — sticky errors and recovery actions", () => {
	it("an error never hides on a timer, but new information displaces it", async () => {
		vi.useFakeTimers()
		const { showError, showSuccess, toastNotification, showToast } = useToast()

		showError("تعذر الاتصال بالخادم")
		await nextTick()
		expect(showToast.value).toBe(true)

		vi.advanceTimersByTime(120_000)
		expect(showToast.value).toBe(true)
		expect(toastNotification.value?.type).toBe("error")

		showSuccess("تم حفظ الفاتورة")
		vi.advanceTimersByTime(1000)
		await nextTick()
		expect(toastNotification.value?.type).toBe("success")
		vi.useRealTimers()
	})

	it("renders the action button on the toast and runs its handler", async () => {
		const handler = vi.fn()
		const { showError } = useToast()
		showError("تعذر حفظ الفاتورة", {
			action: { label: "إعادة المحاولة", handler },
		})
		await nextTick()

		const wrapper = mountTracked(Toast, {
			attachTo: document.body,
			global: {
				...globalBase(),
				components: {
					ActionButton: DyPOSUI.ActionButton,
					FeatherIcon: DyPOSUI.FeatherIcon,
				},
			},
		})
		await nextTick()

		const button = [...document.body.querySelectorAll("button")].find((b) =>
			b.textContent.includes("إعادة المحاولة"),
		)
		expect(button, "toast action button must render").toBeTruthy()
		button.click()
		expect(handler).toHaveBeenCalledTimes(1)
		const { showToast } = useToast()
		expect(showToast.value).toBe(false)
	})
})

describe("WorkTable — honest loading and error states", () => {
	const columns = [{ key: "name", label: "الاسم" }]

	it("loading renders skeleton rows, never an empty state", () => {
		const wrapper = mountTracked(WorkTable, {
			props: { columns, rows: [], loading: true },
			global: globalBase(),
		})
		expect(
			wrapper.findAll(".work-table__row--skeleton").length,
		).toBeGreaterThan(0)
		expect(wrapper.find("table").attributes("aria-busy")).toBe("true")
		expect(wrapper.find(".work-table__empty-row").exists()).toBe(false)
	})

	it("error renders role=alert with a retry that emits", async () => {
		const wrapper = mountTracked(WorkTable, {
			props: { columns, rows: [], error: "تعذر تحميل البيانات" },
			global: globalBase(),
		})
		const alert = wrapper.find('[role="alert"]')
		expect(alert.exists()).toBe(true)
		expect(alert.text()).toContain("تعذر تحميل البيانات")
		const retry = alert.find("button")
		expect(retry.exists()).toBe(true)
		await retry.trigger("click")
		expect(wrapper.emitted("retry")).toBeTruthy()
	})
})

describe("StatusBadge — verified vocabularies only", () => {
	it("a verified status shows the verified Arabic label and an icon", () => {
		const wrapper = mountTracked(StatusBadge, {
			props: { status: "paid" },
			global: globalBase(),
		})
		expect(wrapper.text()).toContain("مدفوعة")
		expect(wrapper.find("svg").exists()).toBe(true)
	})

	it("an unknown value passes through raw instead of inventing a meaning", () => {
		const wrapper = mountTracked(StatusBadge, {
			props: { status: "zz-unknown" },
			global: globalBase(),
		})
		expect(wrapper.text()).toContain("zz-unknown")
	})
})

describe("WorkMenuStrip — toolbar contract", () => {
	const items = [
		{ id: "export", label: "تصدير", shortcut: "ctrl+s" },
		{ id: "print", label: "طباعة" },
	]

	it("is a toolbar with W3C shortcuts, hidden kbd, and emits select", async () => {
		const wrapper = mountTracked(WorkMenuStrip, {
			props: { items },
			global: globalBase(),
		})
		const toolbar = wrapper.find('[role="toolbar"]')
		expect(toolbar.exists()).toBe(true)
		const first = wrapper.findAll("button")[0]
		expect(first.attributes("aria-keyshortcuts")).toBe("Control+S")
		const kbd = wrapper.find("kbd")
		expect(kbd.exists()).toBe(true)
		expect(kbd.attributes("aria-hidden")).toBe("true")

		await first.trigger("click")
		expect(wrapper.emitted("select")?.[0]?.[0]?.id).toBe("export")
	})

	it("dispatches the global shortcut from the document", async () => {
		const wrapper = mountTracked(WorkMenuStrip, {
			props: { items },
			global: globalBase(),
		})
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
		)
		await nextTick()
		expect(wrapper.emitted("select")?.[0]?.[0]?.id).toBe("export")
	})

	it("a disabled action announces its denial with the reason (no silent touch)", async () => {
		const wrapper = mountTracked(WorkMenuStrip, {
			props: {
				items: [
					{ id: "export", label: "تصدير", disabled: true, reason: "لا سجلات" },
				],
			},
			global: globalBase(),
		})
		const button = wrapper.find("button")
		expect(button.attributes("aria-disabled")).toBe("true")
		expect(button.attributes("disabled")).toBeUndefined()
		await button.trigger("click")
		expect(wrapper.emitted("select")).toBeUndefined()
		expect(wrapper.emitted("denied")?.[0]?.[0]).toMatchObject({
			id: "export",
			reason: "لا سجلات",
		})
	})
})

describe("WorkStatusStrip — provenance roles", () => {
	it("error becomes role=alert/assertive, ready stays polite status", () => {
		const errorWrapper = mountTracked(WorkStatusStrip, {
			props: { status: "error" },
			global: globalBase(),
		})
		expect(errorWrapper.find('[role="alert"]').exists()).toBe(true)
		expect(errorWrapper.find('[role="alert"]').attributes("aria-live")).toBe(
			"assertive",
		)

		const okWrapper = mountTracked(WorkStatusStrip, {
			props: { status: "ready" },
			global: globalBase(),
		})
		expect(okWrapper.find('[role="status"]').exists()).toBe(true)
		expect(okWrapper.find('[role="alert"]').exists()).toBe(false)
	})

	it("shows metrics and the last-update provenance", () => {
		const wrapper = mountTracked(WorkStatusStrip, {
			props: {
				status: "ready",
				metrics: [{ label: "سجل", value: 3 }],
				lastUpdate: "12:30",
			},
			global: globalBase(),
		})
		expect(wrapper.text()).toContain("سجل")
		expect(wrapper.text()).toContain("12:30")
	})
})

describe("WorkPanel — header/body/footer wiring", () => {
	it("renders all slots and the density class", () => {
		const wrapper = mountTracked(WorkPanel, {
			props: { title: "المخزون", density: "compact" },
			slots: {
				default: "محتوى الجدول",
				footer: "تذييل",
				actions: '<button class="panel-add">إضافة</button>',
			},
			global: globalBase(),
		})
		expect(wrapper.find(".work-panel--compact").exists()).toBe(true)
		expect(wrapper.text()).toContain("المخزون")
		expect(wrapper.text()).toContain("محتوى الجدول")
		expect(wrapper.text()).toContain("تذييل")
		expect(wrapper.find(".panel-add").exists()).toBe(true)
	})
})

describe("WorkFilterField — select branch is a real combobox", () => {
	it("renders dypos-ui Combobox and keeps the string contract", async () => {
		const wrapper = mountTracked(WorkFilterField, {
			props: {
				field: {
					key: "category",
					label: "التصنيف",
					type: "select",
					placeholder: "كل التصنيفات",
					options: [{ value: "cat-1", label: "مشروبات" }],
				},
				modelValue: "",
			},
			attachTo: document.body,
			global: {
				...globalBase(),
				components: { FeatherIcon: DyPOSUI.FeatherIcon },
			},
		})
		expect(wrapper.find(".dy-combobox").exists()).toBe(true)
		expect(wrapper.find(".work-filter-field__select").exists()).toBe(false)

		const input = wrapper.find(".dy-combobox input")
		await input.trigger("focus")
		await nextTick()
		const option = wrapper.find('[role="option"]')
		expect(option.exists()).toBe(true)
		await option.trigger("mousedown")
		await nextTick()

		const emitted = wrapper.emitted("update:modelValue")
		expect(emitted).toBeTruthy()
		expect(emitted.at(-1)).toEqual(["cat-1"])
	})
})

describe("workNotifications — the renderer-less store stays deleted (S7b)", () => {
	it("the barrel no longer exports it and the file is gone", () => {
		expect(
			existsSync(
				join(POS, "src", "components", "work", "workNotifications.js"),
			),
		).toBe(false)
		const barrel = readFileSync(
			join(POS, "src", "components", "work", "index.js"),
			"utf8",
		)
		// the deletion note in a comment is fine — an export statement is not
		expect(barrel).not.toMatch(/from "\.\/workNotifications\.js"/)
		expect(barrel).not.toMatch(/\bnotifyError\b/)
	})
})
