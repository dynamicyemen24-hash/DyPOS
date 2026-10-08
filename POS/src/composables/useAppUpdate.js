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

try {
	currentVersion.value =
		typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : null
} catch {
	currentVersion.value = null
}

let listenerInstalled = false
let loadedVersion = null

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
						remoteVersion === requestedVersion ||
						remoteVersion !== String(currentVersion.value)
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
			log.debug("Release feed unavailable; using local update notice", error?.message)
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
	const hintedVersion = event?.detail?.version || event?.detail?.release?.version
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
			waiting = refreshed.find((registration) => registration.waiting)?.waiting || null
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
			navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true })
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

export function useAppUpdate() {
	installListener()
	return {
		updateAvailable,
		downloading,
		updateError,
		release,
		currentVersion,
		loadReleaseFeed,
		applyUpdate,
		dismissUpdate,
	}
}

export default useAppUpdate
