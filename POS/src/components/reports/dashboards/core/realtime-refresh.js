/**
 * Real-time dashboard refresh manager.
 *
 * Provides socket-based live updates for dashboards when the Frappe
 * backend pushes document change events. Falls back to polling when
 * sockets are unavailable.
 */
import { ref, onUnmounted } from "vue"

/**
 * @param {Object} options
 * @param {Function} options.onRefresh - callback to re-fetch data
 * @param {number} [options.pollInterval=30000] - fallback polling interval ms
 * @param {string[]} [options.doctypes] - doctypes to listen for
 */
export function useRealtimeRefresh(options = {}) {
	const {
		onRefresh,
		pollInterval = 30000,
		doctypes = ["Sales Invoice", "Payment Entry"],
	} = options

	const isConnected = ref(false)
	const lastEvent = ref(null)
	const mode = ref("idle") // 'idle' | 'socket' | 'polling'

	let pollTimer = null

	function handleDocUpdate(data) {
		if (doctypes.length && !doctypes.includes(data?.doctype)) return
		lastEvent.value = { doctype: data?.doctype, time: new Date() }
		onRefresh?.()
	}

	function connectSocket() {
		try {
			if (typeof window === "undefined" || !window.frappe?.socketio)
				return false
			const socket = window.frappe.socketio
			for (const dt of doctypes) {
				const event = `doc_update:${dt}`
				socket.on(event, handleDocUpdate)
			}
			isConnected.value = true
			mode.value = "socket"
			return true
		} catch {
			return false
		}
	}

	function startPolling() {
		if (pollTimer) return
		mode.value = "polling"
		pollTimer = setInterval(() => onRefresh?.(), pollInterval)
	}

	function start() {
		if (!connectSocket()) {
			startPolling()
		}
	}

	function stop() {
		if (mode.value === "socket" && window.frappe?.socketio) {
			for (const dt of doctypes) {
				window.frappe.socketio.off(`doc_update:${dt}`, handleDocUpdate)
			}
		}
		if (pollTimer) {
			clearInterval(pollTimer)
			pollTimer = null
		}
		isConnected.value = false
		mode.value = "idle"
	}

	onUnmounted(() => stop())

	return {
		isConnected,
		lastEvent,
		mode,
		start,
		stop,
	}
}
