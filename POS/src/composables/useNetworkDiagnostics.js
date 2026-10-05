import { ref, computed } from "vue"
import { __ } from "@/utils/translation"
import { logger } from "@/utils/logger"
import { endpoints } from "@/utils/apiEndpoints"

const log = logger.create("NetworkDiagnostics")

/**
 * Network Diagnostics — connectivity and endpoint health (Odoo-like network tools).
 *
 * Provides:
 * - Connectivity check (online/offline)
 * - Latency measurement to backend
 * - Endpoint health checks (REST + method API)
 * - DNS resolution test
 * - Sync status
 */

const testing = ref(false)
const results = ref({})
const error = ref("")

const API_BASE = "/api"
const ENDPOINTS_TO_TEST = [
	{ key: "health", url: endpoints.health, label: __("نقطة نهاية الصحة") },
	{
		key: "method",
		url: `${API_BASE}/method/DyPOS.Ping`,
		label: __("API الطرق"),
	},
	{ key: "sync", url: endpoints.sync.push, label: __("نقطة نهاية المزامنة") },
]

/** Measure latency to a URL using fetch with timeout. */
async function measureLatency(url, timeoutMs = 5000) {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

	const start = performance.now()
	try {
		const response = await fetch(url, {
			method: "HEAD",
			cache: "no-cache",
			signal: controller.signal,
			headers: {
				Accept: "application/json",
			},
		})
		const latency = Math.round(performance.now() - start)
		clearTimeout(timeoutId)
		return { ok: response.ok, latency, status: response.status }
	} catch (e) {
		clearTimeout(timeoutId)
		if (e.name === "AbortError") {
			return { ok: false, latency: timeoutMs, error: "timeout" }
		}
		return {
			ok: false,
			latency: Math.round(performance.now() - start),
			error: e.message,
		}
	}
}

/** Test all endpoints. */
async function testEndpoints() {
	error.value = ""
	testing.value = true
	results.value = {}

	try {
		const endpointResults = await Promise.all(
			ENDPOINTS_TO_TEST.map(async (ep) => {
				const result = await measureLatency(ep.url)
				return {
					...ep,
					...result,
					timestamp: new Date().toISOString(),
				}
			}),
		)

		endpointResults.forEach((r) => {
			results.value[r.key] = r
		})

		// Overall status
		const allOk = endpointResults.every((r) => r.ok)
		results.value.overall = {
			ok: allOk,
			message: allOk
				? __("جميع نقاط النهاية تستجيب بشكل طبيعي")
				: __("بعض نقاط النهاية لا تستجيب"),
		}

		return results.value
	} catch (e) {
		log.warn("Network endpoint test failed", e)
		const msg = __("فشل اختبار الشبكة: {0}", { 0: e?.message || String(e) })
		error.value = msg
		results.value.overall = { ok: false, message: msg }
		return results.value
	} finally {
		testing.value = false
	}
}

/** Test DNS resolution for the backend domain. */
async function testDNS() {
	try {
		const url = new URL(endpoints.health)
		const hostname = url.hostname

		// Use fetch to a known endpoint to indirectly test DNS
		const start = performance.now()
		await fetch(`https://${hostname}/favicon.ico`, {
			method: "HEAD",
			cache: "no-cache",
		})
		const latency = Math.round(performance.now() - start)

		results.value.dns = {
			ok: true,
			hostname,
			latency,
			message: __("تحليل DNS ناجح لـ {0} ({1}ms)", { 0: hostname, 1: latency }),
		}
		return results.value.dns
	} catch (e) {
		const msg = __("فشل تحليل DNS: {0}", { 0: e?.message || String(e) })
		results.value.dns = { ok: false, message: msg }
		return results.value.dns
	}
}

/** Test WebSocket/SSE connectivity for real-time features. */
async function testRealtime() {
	try {
		if (!("EventSource" in window)) {
			results.value.realtime = {
				ok: false,
				message: __("EventSource غير مدعوم في هذا المتصفح"),
			}
			return results.value.realtime
		}

		// Try to connect to the realtime endpoint
		const url =
			endpoints.realtime || endpoints.health.replace("/health", "/realtime")
		const es = new EventSource(url)
		const promise = new Promise((resolve) => {
			const timeout = setTimeout(() => {
				es.close()
				resolve({ ok: false, message: __("انتهت مهلة الاتصال المباشر") })
			}, 3000)

			es.onopen = () => {
				clearTimeout(timeout)
				es.close()
				resolve({ ok: true, message: __("الاتصال المباشر (SSE) يعمل") })
			}
			es.onerror = () => {
				clearTimeout(timeout)
				es.close()
				resolve({ ok: false, message: __("فشل الاتصال المباشر") })
			}
		})

		const result = await promise
		results.value.realtime = result
		return result
	} catch (e) {
		const msg = __("فشل اختبار الوقت المباشر: {0}", {
			0: e?.message || String(e),
		})
		results.value.realtime = { ok: false, message: msg }
		return results.value.realtime
	}
}

/** Test sync connectivity (bidirectional). */
async function testSync() {
	try {
		const url = endpoints.sync
		const start = performance.now()
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "ping" }),
		})
		const latency = Math.round(performance.now() - start)

		results.value.sync = {
			ok: response.ok,
			latency,
			status: response.status,
			message: response.ok
				? __("المزامنة متاحة ({0}ms)", { 0: latency })
				: __("المزامنة غير متاحة: HTTP {0}", { 0: response.status }),
		}
		return results.value.sync
	} catch (e) {
		const msg = __("فشل اختبار المزامنة: {0}", { 0: e?.message || String(e) })
		results.value.sync = { ok: false, message: msg }
		return results.value.sync
	}
}

/** Run all network tests. */
async function runAllTests() {
	await Promise.all([testEndpoints(), testDNS(), testRealtime(), testSync()])
	return results.value
}

/** Clear all results. */
function clearResults() {
	results.value = {}
	error.value = ""
}

const summary = computed(() => {
	const checks = Object.values(results.value).filter(
		(r) => r && typeof r.ok === "boolean",
	)
	const passed = checks.filter((r) => r.ok).length
	const total = checks.length
	return {
		passed,
		total,
		percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
		allOk: passed === total && total > 0,
	}
})

export function useNetworkDiagnostics() {
	return {
		testing,
		results,
		error,
		testEndpoints,
		testDNS,
		testRealtime,
		testSync,
		runAllTests,
		clearResults,
		summary,
	}
}
