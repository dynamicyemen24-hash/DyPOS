/** DyPOS Smart Self-Update Composable v2.0.1
 *
 * Update UX is deliberately resilient:
 * - service-worker and version-watchdog signals both surface one interactive notice;
 * - the release feed is fetched only when linkage is enabled;
 * - the feed tells the cashier what changed and why it matters;
 * - the waiting worker is activated only after an explicit user action;
 * - failed update application stays inside the POS instead of forcing a reload.
 */
import { ref } from "vue"
import { logger } from "@/utils/logger"
import { isLinkEnabled } from "@/services/link-consent"

const log = logger.create("AppUpdate")

const updateAvailable = ref(false)
const downloading = ref(false)
const updateError = ref(null)
const release = ref(null)
const currentVersion = ref(null)

/**
 * Automatic update consent — the visible switch behind every automatic
 * version check. Default ON: the shop owner demanded a till that updates
 * itself, and the switch (in the update banner) plus the banner itself
 * mean no check is ever a surprise. Turning it off leaves only the manual
 * "فحص التحديث" button, which is an explicit demand and always allowed.
 */
const AUTO_UPDATE_KEY = "dypos.auto-update"

function readAutoUpdate() {
	try {
		if (typeof localStorage === "undefined") return true
		const raw = localStorage.getItem(AUTO_UPDATE_KEY)
		return raw === null ? true : raw === "1"
	} catch {
		return true
	}
}

/** Pure read for non-Vue callers (the boot watchdog in main.js). */
export function isAutoUpdateEnabled() {
	return readAutoUpdate()
}

const autoUpdate = ref(readAutoUpdate())

function setAutoUpdate(on) {
	const next = on === true || on === "1" || on === 1
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(AUTO_UPDATE_KEY, next ? "1" : "0")
		}
	} catch {
		/* storage full: the session keeps the choice */
	}
	autoUpdate.value = next
	return next
}

const checking = ref(false)
const cacheClearing = ref(false)

try {
	currentVersion.value =
		typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : null
} catch {
	currentVersion.value = null
}

let listenerInstalled = false
let loadedVersion = null

function compareVersions(a, b) {
	// Full semver: every numeric part counts. (An earlier cut split with a
	// limit of 1, so "2.0.12" parsed as [2] and a patch release NEVER looked
	// newer — the update banner could not fire on exactly the releases that
	// carry fixes. The gate below pins all three parts.)
	const parse = (value) =>
		String(value || "")
			.split(".")
			.map((part) => Number.parseInt(part, 10) || 0)
	const aa = parse(a)
	const bb = parse(b)
	for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
		if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0)
	}
	return 0
}

async function loadReleaseFeed(version = currentVersion.value) {
	const requestedVersion = version ? String(version) : null
	if (loadedVersion === requestedVersion && release.value) return release.value

	// Standalone-first: release metadata is optional network enrichment.
	// Never turn the update UX into a boot-time network dependency.
	if (isLinkEnabled() && typeof fetch === "function") {
		try {
			const response = await fetch("/api/updates/latest", {
				method: "GET",
				cache: "no-store",
				credentials: "same-origin",
				headers: { Accept: "application/json" },
			})
			if (response.ok) {
				const payload = await response.json()
				const remote = payload?.release
				if (remote?.version) {
					const remoteVersion = String(remote.version)
					// Never replace a concrete newer version signal with an older
					// server response from a lagging edge cache.
					if (
						!requestedVersion ||
						compareVersions(remoteVersion, requestedVersion) >= 0
					) {
						release.value = {
							version: remoteVersion,
							title: remote.title || "تحديث DyPOS متاح",
							severity: remote.severity || "recommended",
							highlights: Array.isArray(remote.highlights)
								? remote.highlights.slice(0, 20)
								: [],
							minVersion: remote.minVersion || "",
							publishedAt: remote.publishedAt || null,
						}
						loadedVersion = requestedVersion || remoteVersion
						return release.value
					}
				}
			}
		} catch (error) {
			log.debug(
				"Release feed unavailable; using local update notice",
				error?.message,
			)
		}
	}

	if (!requestedVersion) return release.value
	release.value = {
		version: requestedVersion,
		title: "تحديث DyPOS متاح",
		severity: "recommended",
		highlights: [],
	}
	loadedVersion = requestedVersion
	return release.value
}

/**
 * Ask the browser to download the newest worker without activating it.
 */
async function prefetchUpdate() {
	try {
		if (!("serviceWorker" in navigator)) return
		const regs = await navigator.serviceWorker.getRegistrations()
		await Promise.all(
			(regs || []).map(async (reg) => {
				try {
					await reg.update()
				} catch (error) {
					log.debug("Worker prefetch failed", error?.message)
				}
			}),
		)
	} catch (error) {
		log.debug("Update prefetch failed", error?.message)
	}
}

function handleUpdateSignal(event) {
	updateError.value = null
	updateAvailable.value = true
	const hintedVersion =
		event?.detail?.version || event?.detail?.release?.version
	void loadReleaseFeed(hintedVersion || currentVersion.value)
	void prefetchUpdate()
}

function installListener() {
	if (listenerInstalled || typeof window === "undefined") return
	listenerInstalled = true
	window.addEventListener("sw-update-available", handleUpdateSignal)
}

/**
 * Activate a waiting worker and reload only after it actually controls the page.
 * A missing waiting worker is reported honestly instead of blindly reloading.
 */
async function applyUpdate() {
	if (downloading.value) return false
	updateError.value = null
	downloading.value = true
	try {
		if (!("serviceWorker" in navigator)) {
			throw new Error("متصفحك لا يدعم تحديث التطبيق تلقائيًا")
		}

		const registrations = await navigator.serviceWorker.getRegistrations()
		for (const registration of registrations || []) {
			try {
				await registration.update()
			} catch (error) {
				log.debug("Worker update check failed", error?.message)
			}
		}

		let waiting = null
		for (const registration of registrations || []) {
			if (registration.waiting) {
				waiting = registration.waiting
				break
			}
		}

		if (!waiting) {
			await prefetchUpdate()
			const refreshed = await navigator.serviceWorker.getRegistrations()
			waiting =
				refreshed.find((registration) => registration.waiting)?.waiting || null
		}

		if (!waiting) {
			throw new Error("لم يكتمل تنزيل التحديث بعد. أعد المحاولة بعد لحظات.")
		}

		const controllerChanged = new Promise((resolve) => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				navigator.serviceWorker.removeEventListener("controllerchange", finish)
				resolve()
			}
			navigator.serviceWorker.addEventListener("controllerchange", finish, {
				once: true,
			})
			window.setTimeout(finish, 5000)
		})

		waiting.postMessage({ type: "SKIP_WAITING" })
		await controllerChanged
		window.location.reload()
		return true
	} catch (error) {
		updateError.value = error?.message || "تعذر تطبيق التحديث حاليًا"
		log.warn("Update application failed", error)
		return false
	} finally {
		downloading.value = false
	}
}

function dismissUpdate() {
	updateAvailable.value = false
	updateError.value = null
}

/**
 * Compare the running build against the live release stamp.
 * Explicit demand (button press, watchdog tick) — safe to call whenever
 * online; the CALLER owns the consent decision (linkage or auto-update
 * toggle). Never throws: no update found is a normal answer, not an error.
 * @returns {Promise<{updated: boolean, version?: string, reason?: string}>}
 */
async function checkForUpdate() {
	if (checking.value) return { updated: updateAvailable.value }
	checking.value = true
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return { updated: false, reason: "offline" }
		}
		if (typeof fetch !== "function") return { updated: false }
		const response = await fetch("/version.json", {
			method: "GET",
			cache: "no-store",
			credentials: "same-origin",
			headers: { Accept: "application/json" },
		})
		if (!response?.ok) return { updated: false }
		const data = await response.json().catch(() => null)
		const serverVersion = data?.version ? String(data.version) : null
		if (!serverVersion || !currentVersion.value) {
			return { updated: false }
		}
		if (compareVersions(serverVersion, currentVersion.value) > 0) {
			handleUpdateSignal({ detail: { version: serverVersion } })
			return { updated: true, version: serverVersion }
		}
		return { updated: false, version: serverVersion }
	} catch {
		return { updated: false }
	} finally {
		checking.value = false
	}
}

/**
 * Clear every CacheStorage entry, then reload so the worker re-precaches
 * the live shell. CACHES ONLY — IndexedDB (sales, queue, users, stock) is
 * never touched: a stuck screen must never cost a shop its unsynced work.
 * @returns {Promise<boolean>} true when caches were cleared and reload issued.
 */
async function clearAppCaches() {
	if (cacheClearing.value) return false
	cacheClearing.value = true
	try {
		if (!("caches" in globalThis)) {
			throw new Error("التخزين المؤقت غير متاح في هذا المتصفح")
		}
		const keys = (await globalThis.caches.keys()) || []
		await Promise.all(
			keys.map((key) => globalThis.caches.delete(key).catch(() => false)),
		)
		log.info("App caches cleared, reloading", { count: keys.length })
		window.location.reload()
		return true
	} catch (error) {
		updateError.value = error?.message || "تعذر مسح الكاش حاليًا"
		log.warn("Cache clear failed", error)
		return false
	} finally {
		cacheClearing.value = false
	}
}

export function useAppUpdate() {
	installListener()
	return {
		updateAvailable,
		downloading,
		updateError,
		release,
		currentVersion,
		autoUpdate,
		setAutoUpdate,
		checking,
		checkForUpdate,
		cacheClearing,
		clearAppCaches,
		loadReleaseFeed,
		applyUpdate,
		dismissUpdate,
	}
}

export default useAppUpdate
