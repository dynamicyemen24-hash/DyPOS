/**
 * Escape overlay stack — the priority order that used to be an inline cascade
 * in POSSale.vue (six `if (panel) { close(); return }` blocks, untestable).
 */
import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"

import { createOverlayCloser } from "@/composables/useOverlayCloser"

const refEntry = (initial) => {
	const flag = ref(initial)
	const close = vi.fn(() => {
		flag.value = false
	})
	return { flag, entry: [flag, close], close }
}

describe("createOverlayCloser", () => {
	it("closes the highest-priority open overlay and stops there", () => {
		const shortcuts = refEntry(true)
		const payment = refEntry(true)
		const held = refEntry(true)
		const closer = createOverlayCloser([
			shortcuts.entry,
			payment.entry,
			held.entry,
		])

		expect(closer.closeFirstOpen()).toBe(true)
		expect(shortcuts.close).toHaveBeenCalledTimes(1)
		expect(
			payment.close,
			"the payment panel must survive a first Escape",
		).toHaveBeenCalledTimes(0)
		expect(held.close).toHaveBeenCalledTimes(0)
	})

	it("walks down the stack as overlays close", () => {
		const shortcuts = refEntry(true)
		const payment = refEntry(true)
		const closer = createOverlayCloser([shortcuts.entry, payment.entry])

		closer.closeFirstOpen()
		closer.closeFirstOpen()

		expect(payment.close).toHaveBeenCalledTimes(1)
		expect(closer.closeFirstOpen(), "nothing left open").toBe(false)
	})

	it("accepts a getter for non-ref open state (null vs false)", () => {
		const close = vi.fn()
		let editor = { id: 1 }
		const closer = createOverlayCloser([[() => Boolean(editor), close]])

		closer.closeFirstOpen()
		expect(close).toHaveBeenCalledTimes(1)

		editor = null
		expect(closer.closeFirstOpen()).toBe(false)
	})

	it("treats a null ref as closed", () => {
		const close = vi.fn()
		const closer = createOverlayCloser([[ref(null), close]])
		expect(closer.closeFirstOpen()).toBe(false)
		expect(close).toHaveBeenCalledTimes(0)
	})

	it("register() appends and returns a working disposer", () => {
		const base = refEntry(false)
		const runtime = refEntry(true)
		const closer = createOverlayCloser([base.entry])
		const dispose = closer.register(runtime.entry)

		expect(closer.size()).toBe(2)
		closer.closeFirstOpen()
		expect(runtime.close).toHaveBeenCalledTimes(1)

		runtime.flag.value = true
		dispose()
		expect(closer.size()).toBe(1)
		closer.closeFirstOpen()
		expect(
			runtime.close,
			"a disposed entry must not act",
		).toHaveBeenCalledTimes(1)
	})

	it("does not mutate the caller's array", () => {
		const entries = [refEntry(false).entry]
		const closer = createOverlayCloser(entries)
		closer.register(refEntry(false).entry)
		expect(entries).toHaveLength(1)
		expect(closer.size()).toBe(2)
	})

	it("never throws on an empty stack", () => {
		const closer = createOverlayCloser()
		expect(closer.size()).toBe(0)
		expect(closer.closeFirstOpen()).toBe(false)
	})
})
