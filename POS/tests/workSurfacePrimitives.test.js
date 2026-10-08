import { afterEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import WorkMenuStrip from "@/components/work/WorkMenuStrip.vue"
import WorkStatusStrip from "@/components/work/WorkStatusStrip.vue"
import WorkPanel from "@/components/work/WorkPanel.vue"

const stubs = { FeatherIcon: true }

describe("standard work-surface primitives", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("runs only an explicit modified shortcut outside text-entry controls", async () => {
    const refresh = vi.fn()
    const wrapper = mount(WorkMenuStrip, {
      props: { items: [{ id: "refresh", label: "تحديث", shortcut: "Alt+R", handler: refresh }] },
      attachTo: document.body,
      global: { stubs },
    })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", altKey: true, bubbles: true }))
    expect(refresh).toHaveBeenCalledOnce()
    const input = document.createElement("input")
    document.body.append(input)
    input.focus()
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", altKey: true, bubbles: true }))
    expect(refresh).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it("emits action identifiers and disables unavailable actions", async () => {
    const wrapper = mount(WorkMenuStrip, {
      props: { items: [
        { id: "refresh", label: "تحديث" },
        { id: "blocked", label: "غير متاح", disabled: true },
      ] },
      global: { stubs },
    })
    await wrapper.findAll("button").find(button => button.text().includes("تحديث")).trigger("click")
    expect(wrapper.emitted("action")?.[0]).toEqual(["refresh"])
    expect(wrapper.findAll("button").find(button => button.text().includes("غير متاح")).attributes("disabled")).toBeDefined()
    wrapper.unmount()
  })

  it("communicates operational state and formats a supplied timestamp", () => {
    const wrapper = mount(WorkStatusStrip, {
      props: { state: "saved", message: "تم الحفظ", updatedAt: "2026-10-09T10:30:00Z", items: [{ id: "rows", label: "السجلات", value: 12 }] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain("تم الحفظ")
    expect(wrapper.text()).toContain("السجلات")
    expect(wrapper.text()).toContain("12")
    expect(wrapper.find("footer").attributes("aria-live")).toBe("polite")
  })

  it("provides semantic panel regions and flush layout", () => {
    const wrapper = mount(WorkPanel, {
      props: { as: "section", label: "تفاصيل السجل", flush: true, scrollable: true },
      slots: { header: "العنوان", default: "المحتوى", footer: "الإجراءات" },
    })
    expect(wrapper.element.tagName).toBe("SECTION")
    expect(wrapper.attributes("aria-label")).toBe("تفاصيل السجل")
    expect(wrapper.find(".work-panel__header").text()).toBe("العنوان")
    expect(wrapper.find(".work-panel__body").text()).toBe("المحتوى")
    expect(wrapper.find(".work-panel__footer").text()).toBe("الإجراءات")
    expect(wrapper.classes()).toContain("work-panel--flush")
  })
})
