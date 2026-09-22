/**
 * Network quality indicator composable.
 *
 * Provides real-time network quality detection and display.
 * Uses Network Information API when available, with fallback
 * to latency-based detection.
 */

import { ref, onMounted, onUnmounted, computed } from "vue"
import { offlineState } from "@/utils/offline/offlineState"
import { logger } from "@/utils/logger"

const log = logger.create("NetworkIndicator")

/**
 * Detect network quality using the Network Information API.
 * @returns {Object|null} Network info object or null
 */
function getNetworkInfo() {
	if (typeof navigator === "undefined") return null
	const conn =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection
	if (!conn) return null
	return {
		effectiveType: conn.effectiveType || "unknown", // 4g, 3g, 2g, slow-2g
		downlink: conn.downlink || 0, // Mbps
		rtt: conn.rtt || 0, // ms
		saveData: conn.saveData || false,
		type: conn.type || "unknown", // wifi, cellular, ethernet
	}
}

/**
 * Get quality level from network info.
 * @returns {string} 'excellent' | 'good' | 'fair' | 'poor' | 'offline'
 */
function getQualityLevel(info) {
	if (!info) return "unknown"
	if (info.effectiveType === "4g" && (info.downlink || 0) >= 5)
		return "excellent"
	if (info.effectiveType === "4g" || info.effectiveType === "3g") return "good"
	if (info.effectiveType === "2g" || info.effectiveType === "slow-2g")
		return "poor"
	return "fair"
}

/**
 * Map quality to Arabic label and color.
 */
const QUALITY_CONFIG = {
	excellent: { label: "ممتاز", color: "text-green-600", icon: "check-circle" },
	good: { label: "جيد", color: "text-blue-600", icon: "wifi" },
	fair: { label: "متوسط", color: "text-yellow-600", icon: "alert-circle" },
	poor: { label: "ضعيف", color: "text-red-600", icon: "wifi-off" },
	offline: { label: "غير متصل", color: "text-crimson-600", icon: "x-circle" },
	unknown: { label: "جاري الكشف", color: "text-gray-500", icon: "loader" },
}

export function useNetworkIndicator() {
	const quality = ref(getQualityLevel(getNetworkInfo()))
	const isOnline = ref(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	)
	const latency = ref(0)
	const networkInfo = ref(getNetworkInfo())
	const interval = null
	let pingInterval = null
	let offlineUnsubscribe = null

	const config = computed(
		() => QUALITY_CONFIG[quality.value] || QUALITY_CONFIG.unknown,
	)

	function updateNetworkState() {
		const wasOffline = !isOnline.value
		isOnline.value = navigator.onLine
		networkInfo.value = getNetworkInfo()
		quality.value = getQualityLevel(networkInfo.value)

		if (wasOffline && isOnline.value) {
			logger?.debug?.("[Network] Connection restored")
		}
	}

	function startLatencyCheck() {
		if (typeof fetch === "undefined") return

		pingInterval = setInterval(async () => {
			if (!isOnline.value) {
				latency.value = 0
				return
			}

			const start = Date.now()
			try {
				const controller = new AbortController()
				const timeout = setTimeout(() => controller.abort(), 5000)
				await fetch("/api/method/DyPOS.api.utilities.ping", {
					method: "GET",
					cache: "no-store",
					credentials: "include",
					signal: controller.signal,
				})
				clearTimeout(timeout)
				latency.value = Date.now() - start
			} catch {
				latency.value = -1
			}
		}, 15000)
	}

	function startMonitoring() {
		window.addEventListener("online", updateNetworkState)
		window.addEventListener("offline", updateNetworkState)

		try {
			offlineUnsubscribe = offlineState.subscribe((state) => {
				isOnline.value = !state.isOffline
				quality.value = state.isOffline
					? "offline"
					: getQualityLevel(getNetworkInfo())
			})
		} catch (e) {
			log.warn("[Network] Failed to subscribe to offlineState", e)
		}

		startLatencyCheck()
	}

	function stopMonitoring() {
		window.removeEventListener("online", updateNetworkState)
		window.removeEventListener("offline", updateNetworkState)
		if (pingInterval) {
			clearInterval(pingInterval)
			pingInterval = null
		}
		if (offlineUnsubscribe) {
			offlineUnsubscribe()
			offlineUnsubscribe = null
		}
	}

	onMounted(startMonitoring)
	onUnmounted(stopMonitoring)

	return {
		quality,
		isOnline,
		latency,
		networkInfo,
		config,
		startMonitoring,
		stopMonitoring,
	}
}

/**
 * Standalone network quality display component state.
 * For use in dashboard headers and login panels.
 */
export function createNetworkStatus() {
	const state = {
		quality: ref("unknown"),
		isOnline: ref(true),
		latency: ref(0),
	}

	function update() {
		state.isOnline.value = navigator.onLine
		const info = getNetworkInfo()
		state.quality.value = getQualityLevel(info)
	}

	return {
		...state,
		config: computed(
			() => QUALITY_CONFIG[state.quality.value] || QUALITY_CONFIG.unknown,
		),
		update,
		isOnline: computed(() => state.isOnline.value),
	}
}

export default {
	useNetworkIndicator,
	createNetworkStatus,
	getQualityLevel,
	QUALITY_CONFIG,
}
