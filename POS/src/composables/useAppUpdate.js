/** DyPOS Smart Self-Update Composable v1.32.0
 *
 * Single brain for "there is an update → what is it → download it":
 * - Listens for the service-worker signal AND the version watchdog
 *   (both dispatch the `sw-update-available` window event).
 * - Fetches the release feed (what changed + merchant benefit) from
 *   `/api/updates/latest`, falling back to the static `release.json`
 *   shipped with the Cloudflare build (works even if the API is down).
 * - `applyUpdate()` activates the waiting worker and reloads once.
 *
 * Never blocks POS rendering; never auto-reloads without the user.
 */
import { ref } from "vue"
import { logger } from "@/utils/logger"

const log = logger.create("AppUpdate")

const FEED_URLS = Object.freeze([
	"/api/updates/latest",
	"/assets/DyPOS/pos/release.json",
])

const updateAvailable = ref(false)
const downloading = ref(false)
const release = ref(null)
const currentVersion = ref(null)

try {
	currentVersion.value =
		typeof __BUILD_VERSION__ !== "undefined" ? String(__BUILD_VERSION__) : null
} catch {
	currentVersion.value = null
}

let listenerInstalled = false
let feedLoaded = false

async function loadReleaseFeed() {
	if (feedLoaded) return release.value
	for (const url of FEED_URLS) {
		try {
			const response = await fetch(url, {
				method: "GET",
				cache: "no-store",
				credentials: "same-origin",
			})
			if (!response.ok) continue
			const data = await response.json()
			// API shape: { release: {...} } — static file shape: {...} directly.
			const feed = data?.release || data
			if (feed?.version) {
				release.value = feed
				feedLoaded = true
				return feed
			}
		} catch (error) {
			log.debug("Release feed fetch failed", { url, error: error?.message })
		}
	}
	return release.value
}

/**
 * Silent background prefetch: start downloading the new worker the moment
 * we learn it exists, so the user's tap applies instantly instead of
 * starting a cold download. Never reloads — activation stays user-driven.
 */
async function prefetchUpdate() {
	try {
		if (!("serviceWorker" in navigator)) return
		const regs = await navigator.serviceWorker.getRegistrations()
		for (const reg of regs || []) {
			try {
				await reg.update()
			} catch (error) {
				log.debug("Worker prefetch failed", error?.message)
			}
		}
	} catch (error) {
		log.debug("Update prefetch failed", error?.message)
	}
}

function handleUpdateSignal() {
	updateAvailable.value = true
	void loadReleaseFeed()
	// Prefetch in background; the dialog button only activates + reloads.
	void prefetchUpdate()
}

function installListener() {
	if (listenerInstalled || typeof window === "undefined") return
	listenerInstalled = true
	window.addEventListener("sw-update-available", handleUpdateSignal)
}

/**
 * Download + activate the update, then reload once.
 * Safe during a sale: the caller (banner) only runs on user tap.
 */
async function applyUpdate() {
	if (downloading.value) return
	downloading.value = true
	try {
		if ("serviceWorker" in navigator) {
			const regs = await navigator.serviceWorker.getRegistrations()
			for (const reg of regs || []) {
				try {
					await reg.update()
				} catch (error) {
					log.debug("Worker update check failed", error?.message)
				}
			}
			if (navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage(
					{ type: "SKIP_WAITING" },
					window.location.origin,
				)
				// Give the new worker a moment to take control.
				await new Promise((resolve) => window.setTimeout(resolve, 600))
			}
		}
	} finally {
		window.location.reload()
	}
}

function dismissUpdate() {
	updateAvailable.value = false
}

export function useAppUpdate() {
	installListener()
	return {
		updateAvailable,
		downloading,
		release,
		currentVersion,
		loadReleaseFeed,
		applyUpdate,
		dismissUpdate,
	}
}

export default useAppUpdate
