import { computed, onBeforeUnmount, onMounted, ref } from "vue"

const deferredPrompt = ref(null)
const installed = ref(false)
const ios = ref(false)
const dismissed = ref(false)

function detectIos() {
	if (typeof navigator === "undefined") return false
	return /iphone|ipad|ipod/i.test(navigator.userAgent || "")
}

function detectStandalone() {
	if (typeof window === "undefined") return false
	return (
		window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
		window.navigator?.standalone === true
	)
}

function onBeforeInstallPrompt(event) {
	event.preventDefault()
	deferredPrompt.value = event
	dismissed.value = false
}

function onInstalled() {
	deferredPrompt.value = null
	installed.value = true
}

export function usePwaInstall() {
	const canInstall = computed(
		() => Boolean(deferredPrompt.value) && !installed.value,
	)
	const showIosGuide = computed(
		() =>
			ios.value &&
			!installed.value &&
			!deferredPrompt.value &&
			!dismissed.value,
	)

	async function install() {
		const promptEvent = deferredPrompt.value
		if (!promptEvent) return { outcome: "unavailable" }
		deferredPrompt.value = null
		try {
			const result = await promptEvent.prompt()
			if (result?.outcome === "accepted") installed.value = true
			return result || { outcome: "unknown" }
		} catch {
			return { outcome: "failed" }
		}
	}

	function dismiss() {
		dismissed.value = true
	}

	onMounted(() => {
		ios.value = detectIos()
		installed.value = detectStandalone()
		window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
		window.addEventListener("appinstalled", onInstalled)
	})

	onBeforeUnmount(() => {
		window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
		window.removeEventListener("appinstalled", onInstalled)
	})

	return {
		canInstall,
		showIosGuide,
		installed,
		install,
		dismiss,
	}
}
