/**
 * Sale notification — the auto-dismiss toast extracted from POSSale.vue.
 *
 * Guards the two behaviours the page relied on: exactly one notification is
 * ever visible, and a second call RESTARTS the dismiss clock instead of
 * stacking a second timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSaleNotification } from "@/composables/useSaleNotification"

describe("createSaleNotification", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("publishes a notification with the default info type", () => {
		const { notification, showNotification } = createSaleNotification()

		expect(notification.value).toBeNull()

		showNotification("تم البيع بنجاح")

		expect(notification.value).toMatchObject({
			message: "تم البيع بنجاح",
			type: "info",
		})
		expect(notification.value.id).toBeTypeOf("number")
	})

	it("auto-dismisses after the TTL", () => {
		const { notification, showNotification } = createSaleNotification()

		showNotification("تحذير المخزون", "warning")
		expect(notification.value).not.toBeNull()

		vi.advanceTimersByTime(3499)
		expect(notification.value).not.toBeNull()

		vi.advanceTimersByTime(1)
		expect(notification.value).toBeNull()
	})

	it("restarts the dismiss clock on every call (never stacks timers)", () => {
		const { notification, showNotification } = createSaleNotification()

		showNotification("الأولى", "success")
		vi.advanceTimersByTime(2000)
		showNotification("الثانية", "error")

		vi.advanceTimersByTime(2000)
		// Only 2000ms since the second call — the first timer must not fire.
		expect(notification.value?.message).toBe("الثانية")

		vi.advanceTimersByTime(1500)
		expect(notification.value).toBeNull()
	})

	it("dispose cancels the pending dismiss without hiding the notification", () => {
		const { notification, showNotification, dispose } = createSaleNotification()

		showNotification("تبقى ظاهرة")
		dispose()

		vi.advanceTimersByTime(10_000)
		expect(notification.value?.message).toBe("تبقى ظاهرة")
	})

	it("clear hides it immediately and cancels the timer", () => {
		const { notification, showNotification, clear } = createSaleNotification()

		showNotification("تختفي فوراً")
		clear()

		expect(notification.value).toBeNull()

		vi.advanceTimersByTime(10_000)
		expect(notification.value).toBeNull()
	})
})
