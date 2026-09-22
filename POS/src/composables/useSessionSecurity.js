/**
 * useSessionSecurity.js
 * حماية الجلسة المتقدمة لـ DyPOS
 */
import { ref, onMounted, onBeforeUnmount } from "vue"
import { logger } from "@/utils/logger"

const DEFAULT_CONFIG = {
	idleTimeoutMs: 15 * 60 * 1000,
	warningBeforeMs: 2 * 60 * 1000,
	absoluteTimeoutMs: 8 * 60 * 60 * 1000,
}

const config = ref({ ...DEFAULT_CONFIG })
const isSessionSecure = ref(true)
const lastActivityAt = ref(Date.now())
const idleTimeRemaining = ref(config.value.idleTimeoutMs)
const absoluteTimeRemaining = ref(config.value.absoluteTimeoutMs)
const sessionWarnings = ref([])
const sessionStartedAt = ref(null)

let inactivityTimer = null
let warningTimer = null
let absoluteTimer = null

function logSecurityEvent(event, details = {}) {
	sessionWarnings.value.push({ timestamp: Date.now(), event, ...details })
	if (sessionWarnings.value.length > 50) {
		sessionWarnings.value = sessionWarnings.value.slice(-50)
	}
	logger?.info?.(`[Security] ${event}`, details)
}

function touch() {
	lastActivityAt.value = Date.now()
	resetTimers()
}

function resetTimers() {
	if (inactivityTimer) clearTimeout(inactivityTimer)
	if (warningTimer) clearTimeout(warningTimer)
	if (absoluteTimer) clearTimeout(absoluteTimer)

	const idleRemaining = Math.max(
		0,
		config.value.idleTimeoutMs - (Date.now() - lastActivityAt.value),
	)
	idleTimeRemaining.value = idleRemaining

	const absoluteRemaining = Math.max(
		0,
		config.value.absoluteTimeoutMs -
			(Date.now() - (sessionStartedAt.value || Date.now())),
	)
	absoluteTimeRemaining.value = absoluteRemaining

	if (idleRemaining > 0) {
		inactivityTimer = setTimeout(() => {
			logSecurityEvent("IDLE_TIMEOUT")
			triggerIdleLogout()
		}, idleRemaining)
	}

	if (
		idleRemaining > config.value.warningBeforeMs &&
		idleRemaining - config.value.warningBeforeMs > 0
	) {
		const warningDelay = idleRemaining - config.value.warningBeforeMs
		warningTimer = setTimeout(() => {
			sessionWarnings.value.push({
				type: "IDLE_WARNING",
				message: "ستتم إغلاق الجلسة تلقائيًا بسبب عدم النشاط",
				remainingMs: config.value.warningBeforeMs,
				timestamp: Date.now(),
			})
		}, warningDelay)
	}

	if (absoluteRemaining > 0) {
		absoluteTimer = setTimeout(() => {
			logSecurityEvent("ABSOLUTE_TIMEOUT")
			triggerAbsoluteLogout()
		}, absoluteRemaining)
	}
}

function triggerIdleLogout() {
	isSessionSecure.value = false
	sessionWarnings.value.push({
		type: "IDLE_LOGOUT",
		message: "تم إغلاق الجلسة تلقائيًا بسبب عدم النشاط",
		timestamp: Date.now(),
	})
	logSecurityEvent("SESSION_LOGOUT_IDLE")
}

function triggerAbsoluteLogout() {
	isSessionSecure.value = false
	sessionWarnings.value.push({
		type: "ABSOLUTE_LOGOUT",
		message: "انتهت صلاحية الجلسة (الحد الأقصى المسموح به)",
		timestamp: Date.now(),
	})
	logSecurityEvent("SESSION_LOGOUT_ABSOLUTE")
}

function startSessionMonitoring() {
	sessionStartedAt.value = Date.now()
	touch()
	logSecurityEvent("SESSION_START")
}

function stopSessionMonitoring() {
	if (inactivityTimer) clearTimeout(inactivityTimer)
	if (warningTimer) clearTimeout(warningTimer)
	if (absoluteTimer) clearTimeout(absoluteTimer)
	isSessionSecure.value = true
	sessionWarnings.value = []
	logSecurityEvent("SESSION_STOP")
}

function shouldRotateSession() {
	if (!config.value.sessionRotationEnabled) return false
	const elapsed = Date.now() - (sessionStartedAt.value || Date.now())
	return elapsed > 30 * 60 * 1000
}

function checkSessionHealth() {
	const issues = []
	if (!sessionStartedAt.value) issues.push("세션 غير مبدءة")
	const idleDuration = Date.now() - lastActivityAt.value
	if (idleDuration > config.value.idleTimeoutMs)
		issues.push("الجلسة منتهية بسبب عدم النشاط")
	const absoluteDuration = Date.now() - (sessionStartedAt.value || Date.now())
	if (absoluteDuration > config.value.absoluteTimeoutMs)
		issues.push("الجلسة تجاوزت الحد الأقصى")
	if (typeof window !== "undefined" && document.visibilityState === "hidden") {
		issues.push("الصفحة غير مرئية (قد يكون مستخدم آخر)")
	}
	return {
		healthy: issues.length === 0,
		issues,
		lastActivity: lastActivityAt.value,
		idleDuration,
		absoluteDuration,
	}
}

function updateConfig(partialConfig) {
	config.value = { ...config.value, ...partialConfig }
	resetTimers()
	logSecurityEvent("CONFIG_UPDATE", partialConfig)
}

onMounted(() => {
	logSecurityEvent("MODULE_MOUNT")
})
onBeforeUnmount(() => {
	if (inactivityTimer) clearTimeout(inactivityTimer)
	if (warningTimer) clearTimeout(warningTimer)
	if (absoluteTimer) clearTimeout(absoluteTimer)
	logSecurityEvent("MODULE_UNMOUNT")
})

export {
	config,
	isSessionSecure,
	lastActivityAt,
	idleTimeRemaining,
	absoluteTimeRemaining,
	sessionWarnings,
	sessionStartedAt,
	touch,
	startSessionMonitoring,
	stopSessionMonitoring,
	shouldRotateSession,
	checkSessionHealth,
	updateConfig,
	logSecurityEvent,
	DEFAULT_CONFIG,
}
