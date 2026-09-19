/**
 * Device adaptation composable — explores the actual device (phone / tablet /
 * desktop) and its live specs, adapts the POS shell, and warns the cashier
 * when something blocks performance.
 *
 * Layers (cheapest reliable signal wins):
 *  1. Viewport + touch points (catches iPads reporting a desktop Mac UA).
 *  2. UA class from GET /api/device (server mirrors this vocabulary).
 *  3. Hardware budget: CPU cores, device memory, save-data, connection type.
 *
 * Fail-soft by design: every probe is guarded, init is idempotent, and a
 * throw inside adaptation never blocks POS rendering (see main.js wiring).
 */

import { ref, computed } from "vue"

import { useToast } from "./useToast"
import { isSaveDataMode, isLowEndDevice } from "@/utils/performance"

const BODY_PREFIX = "dypos-device-"
const INIT_FLAG = "__DYPOS_DEVICE_INIT__"

const viewportWidth = ref(
	typeof window !== "undefined" ? window.innerWidth : 1280,
)
const viewportHeight = ref(
	typeof window !== "undefined" ? window.innerHeight : 800,
)
const touchPoints = ref(
	typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0,
)
const serverClass = ref(null)
const serverWarnings = ref([])
let resizeAttached = false

export function classifyViewport(width, touch) {
	// Touch-first tablets (incl. iPad-as-Mac): wide but touch-capable.
	if (touch > 2 && width >= 768 && width < 1280) return "tablet"
	if (width < 640) return "mobile"
	if (width < 1024) return "tablet"
	return "desktop"
}

function readHardwareBudget() {
	if (typeof navigator === "undefined") {
		return { cores: 0, memoryGB: 0, saveData: false, effectiveType: "unknown" }
	}
	const conn =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection ||
		{}
	return {
		cores: Number(navigator.hardwareConcurrency) || 0,
		memoryGB: Number(navigator.deviceMemory) || 0,
		saveData: isSaveDataMode(),
		effectiveType: String(conn.effectiveType || "unknown"),
	}
}

function applyBodyClasses(deviceType, lowSpec) {
	if (typeof document === "undefined") return
	const body = document.body
	for (const t of ["mobile", "tablet", "desktop"]) {
		body.classList.remove(`${BODY_PREFIX}${t}`)
	}
	body.classList.remove(`${BODY_PREFIX}low-spec`)
	body.classList.add(`${BODY_PREFIX}${deviceType}`)
	if (lowSpec) body.classList.add(`${BODY_PREFIX}low-spec`)
}

function trackViewport() {
	if (typeof window === "undefined" || resizeAttached) return
	resizeAttached = true
	const onResize = () => {
		viewportWidth.value = window.innerWidth
		viewportHeight.value = window.innerHeight
		applyBodyClasses(
			serverClass.value ||
				classifyViewport(window.innerWidth, touchPoints.value),
			isLowSpec.value,
		)
	}
	window.addEventListener("resize", onResize, { passive: true })
}

export const deviceType = computed(() =>
	serverClass.value && serverClass.value !== "unknown"
		? serverClass.value
		: classifyViewport(viewportWidth.value, touchPoints.value),
)

export const isMobileDevice = computed(() => deviceType.value === "mobile")
export const isTabletDevice = computed(() => deviceType.value === "tablet")
export const isTouchDevice = computed(
	() => touchPoints.value > 0 || isMobileDevice.value || isTabletDevice.value,
)
export const isLowSpec = computed(() => {
	const hw = readHardwareBudget()
	return (
		isLowEndDevice() ||
		hw.saveData ||
		(hw.cores > 0 && hw.cores <= 2) ||
		(hw.memoryGB > 0 && hw.memoryGB <= 2) ||
		hw.effectiveType === "slow-2g" ||
		hw.effectiveType === "2g"
	)
})

/**
 * One-shot boot adaptation. Idempotent, fail-soft, safe to call twice
 * (HMR / micro-frontend embedding call it again harmlessly).
 *
 * @param {{ notify?: boolean }} options - notify=false for silent callers
 * @returns {{ deviceType: string, warnings: Array }} summary (never throws)
 */
export async function initDeviceAdaptation(options = {}) {
	const { notify = true } = options
	const summary = { deviceType: "desktop", warnings: [] }
	try {
		if (typeof window === "undefined") return summary
		if (window[INIT_FLAG]) {
			summary.deviceType = deviceType.value
			summary.warnings = [...serverWarnings.value]
			return summary
		}
		window[INIT_FLAG] = true

		trackViewport()

		// Server view of this UA (cheap, same-origin, cached per session reload).
		try {
			const res = await fetch("/api/device", {
				method: "GET",
				cache: "no-store",
				credentials: "same-origin",
				headers: { Accept: "application/json" },
			})
			if (res.ok) {
				const data = await res.json()
				if (data?.device?.type && data.device.type !== "unknown") {
					serverClass.value = data.device.type
				}
				if (Array.isArray(data?.warnings)) {
					serverWarnings.value = data.warnings
					summary.warnings.push(...data.warnings)
				}
			}
		} catch {
			// Offline / origin unreachable: local signals alone still adapt.
		}

		summary.deviceType = deviceType.value
		applyBodyClasses(summary.deviceType, isLowSpec.value)

		// Warn the cashier only about things that actually block selling.
		if (notify) {
			const { showWarning } = useToast()
			const seen = new Set()
			const push = (message) => {
				if (!message || seen.has(message)) return
				seen.add(message)
				showWarning(message)
			}
			for (const w of serverWarnings.value) {
				if (w.level === "critical") push(w.message)
			}
			if (isLowSpec.value) {
				const hw = readHardwareBudget()
				push(
					hw.saveData ||
						hw.effectiveType === "slow-2g" ||
						hw.effectiveType === "2g"
						? "الشبكة بطيئة — تم تقليل الجلب المسبق. البيع يعمل طبيعيًا."
						: "مواصفات الجهاز منخفضة — تم تفعيل الوضع الخفيف تلقائيًا.",
				)
			}
		}
	} catch {
		// Adaptation must never break POS boot.
	}
	return summary
}

export function useDevice() {
	return {
		deviceType,
		isMobileDevice,
		isTabletDevice,
		isTouchDevice,
		isLowSpec,
		viewportWidth,
		viewportHeight,
		serverWarnings,
		initDeviceAdaptation,
	}
}
