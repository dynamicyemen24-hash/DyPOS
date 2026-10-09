import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import SyncRecoveryPanel from "@/components/work/SyncRecoveryPanel.vue"

const stubs = {
  FeatherIcon: true,
  ActionButton: {
    props: ["disabled", "variant", "size"],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    emits: ["click"],
  },
}

describe("operator sync recovery panel", () => {
  it("shows missing fields and emits a repair action for only the selected record", async () => {
    const item = {
      id: "product-42",
      status: "FAILED",
      error: "بيانات صنف ناقصة",
      recovery: {
        code: "REQUIRED_FIELDS",
        title: "أكمل بيانات الصنف",
        message: "أكمل الحقول ثم أعد الإرسال.",
        missingFields: [{ field: "code", label: "رمز الصنف" }],
        nextAction: "EDIT_PAYLOAD_AND_RETRY",
        retryable: false,
      },
    }
    const wrapper = mount(SyncRecoveryPanel, { props: { items: [item] }, global: { stubs } })
    expect(wrapper.text()).toContain("أكمل بيانات الصنف")
    expect(wrapper.text()).toContain("رمز الصنف")
    const button = wrapper.findAll("button").find(el => el.text().includes("استكمال ثم إعادة الإرسال"))
    expect(button).toBeTruthy()
    await button.trigger("click")
    expect(wrapper.emitted("repair")?.[0][0]).toMatchObject({ id: "product-42", item, recovery: item.recovery })
  })

  it("routes unsupported invoice sync to the safe invoice flow, not blind retry", async () => {
    const item = {
      id: "invoice-42",
      status: "FAILED",
      recovery: {
        code: "INVOICE_SYNC_UNSUPPORTED",
        title: "أكمل البيع عبر مسار الفواتير",
        message: "احتفظ بمسودة البيع.",
        nextAction: "OPEN_ONLINE_INVOICE_FLOW",
        endpoint: "/api/invoices",
        preserveDraft: true,
        retryable: false,
      },
    }
    const wrapper = mount(SyncRecoveryPanel, { props: { items: [item] }, global: { stubs } })
    await wrapper.findAll("button")[0].trigger("click")
    expect(wrapper.emitted("open-resource")?.[0][0].id).toBe("invoice-42")
    expect(wrapper.emitted("retry")).toBeUndefined()
  })


  it("opens review for a non-retryable unsupported operation instead of retrying it", async () => {
    const item = {
      id: "unknown-42",
      status: "FAILED",
      recovery: {
        code: "UNSUPPORTED_OR_INVALID_OPERATION",
        title: "راجع العملية",
        message: "نوع العملية غير مدعوم.",
        nextAction: "REVIEW_AND_RETRY",
        retryable: false,
      },
    }
    const wrapper = mount(SyncRecoveryPanel, { props: { items: [item] }, global: { stubs } })
    const button = wrapper.findAll("button").find(el => el.text().includes("مراجعة العملية"))
    expect(button).toBeTruthy()
    await button.trigger("click")
    expect(wrapper.emitted("review")?.[0][0].id).toBe("unknown-42")
    expect(wrapper.emitted("retry")).toBeUndefined()
  })


  it("announces host-side recovery errors beside the affected record", () => {
    const wrapper = mount(SyncRecoveryPanel, {
      props: {
        items: [{ id: "p-error", status: "FAILED", recovery: { retryable: true } }],
        actionErrors: { "p-error": "تعذّر الاتصال؛ بقي السجل محفوظًا." },
      },
      global: { stubs },
    })
    expect(wrapper.find('[role="alert"]').text()).toContain("بقي السجل محفوظًا")
  })

  it("provides a clear empty state when there are no failed operations", () => {
    const wrapper = mount(SyncRecoveryPanel, { props: { items: [{ id: "ok", status: "SYNCED" }] }, global: { stubs } })
    expect(wrapper.text()).toContain("لا توجد عمليات معلّقة للمعالجة")
    expect(wrapper.find("ol").exists()).toBe(false)
  })
})
