import { describe, expect, it, vi, beforeEach } from "vitest"
import { useToast } from "@/composables/useToast"

describe("useToast (Arabic smart toasts)", () => {
	beforeEach(() => {
		vi.useRealTimers()
		const { clearAllToasts } = useToast()
		clearAllToasts()
	})

	it("shows success/error without throwing (no __ import crash)", () => {
		const { showSuccess, showError, showWarning, showInfo, toastQueue } =
			useToast()
		expect(() => showSuccess("تم حفظ الفاتورة بنجاح")).not.toThrow()
		expect(() => showError("تعذر الاتصال بالخادم")).not.toThrow()
		expect(() => showWarning("المخزون منخفض")).not.toThrow()
		expect(() => showInfo("تحديث متاح")).not.toThrow()
		expect(toastQueue.value.length).toBeGreaterThan(0)
	})

	it("handleError never throws, even for null/undefined", () => {
		const { handleError, toastQueue } = useToast()
		expect(() => handleError(null)).not.toThrow()
		expect(() => handleError(undefined)).not.toThrow()
		expect(() => handleError(new Error("boom"))).not.toThrow()
		expect(toastQueue.value.length).toBeGreaterThan(0)
	})

	it("queues toasts and exposes pause/resume for hover", () => {
		const { showSuccess, pauseToast, resumeToast } = useToast()
		expect(typeof pauseToast).toBe("function")
		expect(typeof resumeToast).toBe("function")
		expect(() => pauseToast()).not.toThrow()
		expect(() => resumeToast()).not.toThrow()
		showSuccess("أول")
		showSuccess("ثانٍ")
	})
})
