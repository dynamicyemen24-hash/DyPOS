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

describe("self-update: version-driven detection, consent and cache surgery", () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.stubGlobal("fetch", vi.fn())
		vi.stubGlobal("navigator", { onLine: true })
		vi.stubGlobal(
			"localStorage",
			(() => {
				const store = new Map()
				return {
					getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
					setItem: vi.fn((key, value) => store.set(key, String(value))),
					removeItem: vi.fn((key) => store.delete(key)),
				}
			})(),
		)
	})

	it("compares full semver: a patch release reads as newer", async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: async () => ({ version: "2.0.13" }),
		})
		const updater = useAppUpdate()
		updater.currentVersion.value = "2.0.12"
		const result = await updater.checkForUpdate()
		expect(fetch).toHaveBeenCalledWith(
			"/version.json",
			expect.objectContaining({ cache: "no-store" }),
		)
		expect(result).toMatchObject({ updated: true, version: "2.0.13" })
		expect(updater.updateAvailable.value).toBe(true)
		expect(updater.release.value?.version).toBe("2.0.13")
	})

	it("stays silent on the same version (no banner, no noise)", async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: async () => ({ version: "2.0.12" }),
		})
		const updater = useAppUpdate()
		updater.currentVersion.value = "2.0.12"
		updater.dismissUpdate()
		const result = await updater.checkForUpdate()
		expect(result.updated).toBe(false)
		expect(updater.updateAvailable.value).toBe(false)
	})

	it("never fetches while offline", async () => {
		vi.stubGlobal("navigator", { onLine: false })
		const updater = useAppUpdate()
		updater.currentVersion.value = "2.0.12"
		const result = await updater.checkForUpdate()
		expect(result).toMatchObject({ updated: false, reason: "offline" })
		expect(fetch).not.toHaveBeenCalled()
	})

	it("auto-update is on by default and persists the owner's choice", async () => {
		const { isAutoUpdateEnabled } = await import("@/composables/useAppUpdate")
		const updater = useAppUpdate()
		expect(updater.autoUpdate.value).toBe(true)
		expect(isAutoUpdateEnabled()).toBe(true)
		updater.setAutoUpdate(false)
		expect(updater.autoUpdate.value).toBe(false)
		expect(isAutoUpdateEnabled()).toBe(false)
		expect(localStorage.setItem).toHaveBeenCalledWith("dypos.auto-update", "0")
		updater.setAutoUpdate(true)
		expect(isAutoUpdateEnabled()).toBe(true)
	})

	it("cache surgery deletes caches, never storage, then reloads", async () => {
		const deleted = []
		vi.stubGlobal("caches", {
			keys: async () => ["workbox-precache", "runtime-1"],
			delete: vi.fn(async (key) => {
				deleted.push(key)
				return true
			}),
		})
		const reload = vi.fn()
		vi.stubGlobal("location", { reload })
		const updater = useAppUpdate()
		await expect(updater.clearAppCaches()).resolves.toBe(true)
		expect(deleted.sort()).toEqual(["runtime-1", "workbox-precache"])
		expect(reload).toHaveBeenCalledTimes(1)
	})
})
