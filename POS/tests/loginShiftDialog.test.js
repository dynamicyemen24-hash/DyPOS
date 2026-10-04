import { describe, expect, it, vi } from "vitest"

import { useLoginShiftDialog } from "@/composables/useLoginShiftDialog"

describe("useLoginShiftDialog", () => {
	it("يفتح الحوار عند طلب الوردية", () => {
		const { shiftDialogOpen, shiftOpening, openShiftDialog } =
			useLoginShiftDialog({})
		expect(shiftDialogOpen.value).toBe(false)
		openShiftDialog()
		expect(shiftDialogOpen.value).toBe(true)
		expect(shiftOpening.value).toBe(false)
	})

	it("يغلق الحوار ويبث الجاهزية عند فتح الوردية", () => {
		const emit = vi.fn()
		const { shiftDialogOpen, openShiftDialog, onShiftOpened } =
			useLoginShiftDialog({ emit, isRuntimeReady: { value: true } })
		openShiftDialog()
		onShiftOpened()
		expect(shiftDialogOpen.value).toBe(false)
		expect(emit).toHaveBeenCalledWith(
			"ready",
			expect.objectContaining({ authenticated: true }),
		)
	})

	it("يغلق الحوار دون بث عند الإلغاء", () => {
		const emit = vi.fn()
		const { shiftDialogOpen, openShiftDialog, onShiftDialogClosed } =
			useLoginShiftDialog({ emit })
		openShiftDialog()
		onShiftDialogClosed()
		expect(shiftDialogOpen.value).toBe(false)
		expect(emit).not.toHaveBeenCalled()
	})

	it("لا يكسر الإغلاق عند فشل البث", () => {
		const emit = () => {
			throw new Error("boom")
		}
		const { shiftDialogOpen, openShiftDialog, onShiftOpened } =
			useLoginShiftDialog({ emit })
		openShiftDialog()
		expect(() => onShiftOpened()).not.toThrow()
		expect(shiftDialogOpen.value).toBe(false)
	})
})
