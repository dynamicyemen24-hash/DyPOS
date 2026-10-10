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
			getItem: vi.fn((key) =>
				key === "DyPOS_link_consent"
					? JSON.stringify({ mode: "linked" })
					: null,
			),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		})
		fetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				release: {
					version: "2.0.1",
					title: "تحسينات الاستقرار",
					severity: "recommended",
					highlights: [{ title: "الكاش", benefit: "استرجاع أسرع" }],
				},
			}),
		})
		const updater = useAppUpdate()
		const release = await updater.loadReleaseFeed("2.0.1")
		expect(fetch).toHaveBeenCalledWith(
			"/api/updates/latest",
			expect.objectContaining({ cache: "no-store" }),
		)
		expect(release).toMatchObject({
			version: "2.0.1",
			title: "تحسينات الاستقرار",
			highlights: [{ title: "الكاش", benefit: "استرجاع أسرع" }],
		})
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
