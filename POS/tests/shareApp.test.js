/**
 * مشاركة النظام — قرارات صادقة بلا شبكة.
 *
 * الإلغاء من المستخدم ليس فشلًا (لا نسخ ولا تنبيه)، والفشل الحقيقي يسقط
 * للنسخ ثم لغير المدعوم — على المتصل إظهار الرابط يدويًا.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { shareSystem } from "@/utils/shareApp"

const realNavigator = globalThis.navigator

afterEach(() => {
	Object.defineProperty(globalThis, "navigator", {
		value: realNavigator,
		configurable: true,
	})
})

function mockNavigator(overrides = {}) {
	Object.defineProperty(globalThis, "navigator", {
		value: { ...overrides },
		configurable: true,
	})
}

const payload = { title: "t", text: "x", url: "https://dypos.smartportssoft.com/account/register" }

describe("مشاركة النظام", () => {
	it("يستخدم واجهة الجهاز عند توفرها", async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		mockNavigator({ share })
		await expect(shareSystem(payload)).resolves.toBe("shared")
		expect(share).toHaveBeenCalledWith(payload)
	})

	it("إلغاء المستخدم صمت — لا نسخ ولا تنبيه", async () => {
		const aborted = new Error("cancelled")
		aborted.name = "AbortError"
		const clipboard = { writeText: vi.fn() }
		mockNavigator({ share: vi.fn().mockRejectedValue(aborted), clipboard })
		await expect(shareSystem(payload)).resolves.toBe("dismissed")
		expect(clipboard.writeText).not.toHaveBeenCalled()
	})

	it("فشل المشاركة يسقط لنسخ الرابط", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		mockNavigator({ share: vi.fn().mockRejectedValue(new Error("nope")), clipboard: { writeText } })
		await expect(shareSystem(payload)).resolves.toBe("copied")
		expect(writeText).toHaveBeenCalledWith(payload.url)
	})

	it("بلا مشاركة ينسخ مباشرة، وبلا حافظة يُعلن عدم الدعم", async () => {
		mockNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
		await expect(shareSystem(payload)).resolves.toBe("copied")
		mockNavigator({})
		await expect(shareSystem(payload)).resolves.toBe("unsupported")
	})
})
