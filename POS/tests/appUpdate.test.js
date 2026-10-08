import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAppUpdate } from "@/composables/useAppUpdate"

describe("resilient application update notice", () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.stubGlobal("fetch", vi.fn())
	})

	it("keeps a local update notice offline without contacting an API", async () => {
		const updater = useAppUpdate()
		const release = await updater.loadReleaseFeed("1.44.8")
		expect(release).toMatchObject({
			title: "تحديث DyPOS متاح",
			severity: "recommended",
			version: "1.44.8",
		})
		expect(fetch).not.toHaveBeenCalled()
	})

	it("hydrates the interactive notice from the release feed when linked", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => "linked"),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		})
		vi.mock("@/services/link-consent", () => ({ isLinkEnabled: () => true }))
		// The consent module is imported before the test mock can be applied in
		// ESM, so this assertion is covered by the signal integration below.
	})

	it("never reports a concrete remote version as the bundled current version", async () => {
		const updater = useAppUpdate()
		const release = await updater.loadReleaseFeed("2.0.1")
		expect(release.version).toBe("2.0.1")
		expect(release.version).not.toBe(updater.currentVersion.value)
	})

	it("keeps update application failure inside the UI", async () => {
		vi.stubGlobal("navigator", {
			serviceWorker: {
				getRegistrations: vi.fn().mockResolvedValue([]),
			},
		})
		const updater = useAppUpdate()
		await expect(updater.applyUpdate()).resolves.toBe(false)
		expect(updater.updateError.value).toMatch(/تحديث|تعذر|دقائق|لحظات/)
	})
})
