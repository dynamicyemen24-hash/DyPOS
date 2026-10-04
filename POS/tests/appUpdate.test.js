import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAppUpdate } from "@/composables/useAppUpdate"

describe("offline-safe application update notice", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn())
	})

	it("uses the bundled release version without contacting an API", async () => {
		const fetchSpy = vi.mocked(fetch)
		const updater = useAppUpdate()
		const release = await updater.loadReleaseFeed("1.44.8")

		expect(release).toMatchObject({
			title: "تحديث DyPOS متاح",
			severity: "normal",
		})
		expect(release.version).toBe("1.44.8")
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
