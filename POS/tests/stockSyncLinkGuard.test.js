import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

vi.mock("@/services/link-consent", () => ({
	isLinkEnabled: vi.fn(),
}))

import { isLinkEnabled } from "@/services/link-consent"
import { ensureStockSyncAllowed } from "@/composables/useStockSyncLinkGuard"

describe("ensureStockSyncAllowed", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("يمنع المزامنة التلقائية دون ربط ويذكر التعافي", async () => {
		vi.mocked(isLinkEnabled).mockReturnValue(false)
		const enabledRef = ref(true)
		const statusRef = ref({ enabled: true })
		const worker = { stopStockSync: vi.fn().mockResolvedValue() }
		const save = vi.fn()
		const notifyError = vi.fn()
		const allowed = await ensureStockSyncAllowed({
			enabledRef,
			statusRef,
			worker,
			save,
			notifyError,
		})
		expect(allowed).toBe(false)
		expect(worker.stopStockSync).toHaveBeenCalled()
		expect(statusRef.value.enabled).toBe(false)
		expect(statusRef.value.linkRequired).toBe(true)
		expect(notifyError).toHaveBeenCalledWith(expect.stringContaining("الربط"))
		expect(save).toHaveBeenCalled()
	})

	it("يسمح بالمزامنة عند تفعيل الربط", async () => {
		vi.mocked(isLinkEnabled).mockReturnValue(true)
		const allowed = await ensureStockSyncAllowed({
			enabledRef: ref(true),
			statusRef: ref({}),
			worker: { stopStockSync: vi.fn() },
			save: vi.fn(),
			notifyError: vi.fn(),
		})
		expect(allowed).toBe(true)
	})

	it("يسمح بإيقاف المزامنة دون ربط", async () => {
		vi.mocked(isLinkEnabled).mockReturnValue(false)
		const allowed = await ensureStockSyncAllowed({
			enabledRef: ref(false),
			statusRef: ref({}),
			worker: { stopStockSync: vi.fn() },
			save: vi.fn(),
			notifyError: vi.fn(),
		})
		expect(allowed).toBe(true)
	})
})
