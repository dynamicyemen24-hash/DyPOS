/**
 * WorkNotification store — state + imperative API (module, not `<script setup>`).
 *
 * Why this file exists: the notification queue shipped inside
 * `WorkNotification.vue`'s `<script setup>`, which cannot contain ES module
 * exports — the compiler rejects the file outright ("`<script setup>` cannot
 * contain ES module exports"). It was invisible while the kit was unreachable.
 * Splitting the state out is the supported shape: a plain module owns the
 * reactive queue and the `notify*` API, and the component renders it.
 *
 * Auto-dismiss pauses on hover/focus and survives a locale switch; every timer
 * is cleared on dismiss so a removed notification cannot resurrect.
 */
import { reactive, ref } from "vue"

/** @type {import("vue").Ref<Array<object>>} */
const notifications = ref([])
const timers = reactive({})
const progressTimers = reactive({})

function generateId() {
	return `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function find(id) {
	return notifications.value.find((n) => n.id === id)
}

function clearTimer(id) {
	if (timers[id]) {
		clearTimeout(timers[id])
		delete timers[id]
	}
}

function clearProgress(id) {
	if (progressTimers[id]) {
		cancelAnimationFrame(progressTimers[id])
		delete progressTimers[id]
	}
}

function startTimer(id, duration) {
	clearTimer(id)
	timers[id] = setTimeout(() => remove(id), duration)
}

function startProgress(id, duration) {
	clearProgress(id)
	const notif = find(id)
	if (!notif) return
	const start = Date.now()
	notif._start = start
	const tick = () => {
		if (notif._paused) {
			progressTimers[id] = requestAnimationFrame(tick)
			return
		}
		const elapsed = Date.now() - start + (notif._elapsed || 0)
		notif._elapsed = elapsed
		if (elapsed < duration) progressTimers[id] = requestAnimationFrame(tick)
	}
	progressTimers[id] = requestAnimationFrame(tick)
}

/**
 * Show a notification.
 * @param {{type?:string,title?:string,message?:string,duration?:number,action?:object,closable?:boolean}} options
 * @returns {string} notification id
 */
export function notify(options = {}) {
	const id = generateId()
	const duration = options.duration ?? 5000
	notifications.value.push({
		id,
		type: options.type || "info",
		title: options.title || "",
		message: options.message || "",
		duration,
		action: options.action || null,
		closable: options.closable !== false,
		_start: Date.now(),
		_elapsed: 0,
		_paused: false,
	})
	if (duration > 0) {
		startTimer(id, duration)
		startProgress(id, duration)
	}
	return id
}

export const notifySuccess = (title, message, options = {}) =>
	notify({ type: "success", title, message, ...options })

export const notifyError = (title, message, options = {}) =>
	notify({ type: "error", title, message, duration: 0, ...options })

export const notifyWarning = (title, message, options = {}) =>
	notify({ type: "warning", title, message, ...options })

export const notifyInfo = (title, message, options = {}) =>
	notify({ type: "info", title, message, ...options })

export function pause(id) {
	const notif = find(id)
	if (notif) {
		notif._paused = true
		clearTimer(id)
	}
}

export function resume(id) {
	const notif = find(id)
	if (notif && notif.duration > 0) {
		notif._paused = false
		notif._start = Date.now()
		startTimer(id, notif.duration - (notif._elapsed || 0))
		startProgress(id, notif.duration)
	}
}

export function remove(id) {
	clearTimer(id)
	clearProgress(id)
	const idx = notifications.value.findIndex((n) => n.id === id)
	if (idx >= 0) notifications.value.splice(idx, 1)
}

export function dismissAll() {
	for (const id of Object.keys(timers)) clearTimer(id)
	for (const id of Object.keys(progressTimers)) clearProgress(id)
	notifications.value = []
}

export function executeAction(notification) {
	notification?.action?.handler?.()
	if (notification?.action?.dismiss !== false) remove(notification.id)
}

export { notifications }

/** Imperative facade, for `const { notify } = useWorkNotifications()`. */
export const workNotifications = {
	notify,
	notifySuccess,
	notifyError,
	notifyWarning,
	notifyInfo,
	pause,
	resume,
	remove,
	dismissAll,
}
