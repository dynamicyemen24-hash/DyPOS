/**
 * Realtime awareness store (v1.35.0).
 *
 * Wraps the SSE client (realtimeClient.js) into a Pinia store that:
 *  - mirrors the connection state + last received event id for the status UI
 *  - keeps a bounded in-memory event log (newest first, EVENT_LOG_LIMIT)
 *  - exposes monotonic per-domain "invalidation" counters so data grids can
 *    re-fetch cheaply when a remote change lands for THEIR module
 *
 * registerRealtimeSync(options) is the app-orchestrated entry point: call it
 * once from main.tsx after Pinia install; it wires the client to the store and
 * returns a teardown. Status labels are Arabic to match the UI language.
 */
import { reactive, ref } from "vue"
import { defineStore } from "pinia"
import { logger } from "@/utils/logger"
import { RealtimeClient } from "@/sync/realtimeClient"
import { syncState, runSyncCycleSilently } from "@/services/sync-manager"
import { getEffectiveToken } from "@/services/sync-auth"

export const EVENT_LOG_LIMIT = 100

export const STATUS_LABELS = {
	idle: "متصل",
	connected: "مباشر",
	reconnecting: "إعادة اتصال",
	error: "خطأ اتصال",
	offline: "غير متصل",
	disabled: "معطّل",
}

/** Realtime topics → the domain they invalidate. */
export const TOPIC_SCOPES = {
	"invoice.created": "invoices",
	"invoice.paid": "invoices",
	"invoice.returned": "invoices",
	"stock.changed": "stock",
	"stock.adjusted": "stock",
}

/** Resolve any topic (incl. prefix like `product.*`) to a scope domain. */
export function resolveScope(topic) {
	if (TOPIC_SCOPES[topic]) return TOPIC_SCOPES[topic]
	if (topic.startsWith("product.")) return "products"
	if (topic.startsWith("customer.")) return "customers"
	return null
}

let syncStarted = false

export const useRealtimeStore = defineStore("realtime", () => {
	const log = logger.create("RealtimeStore")

	const connectionState = ref("idle")
	const lastEventId = ref(null)
	const connectedAt = ref(null)
	const eventLog = ref([])
	const invalidators = reactive({
		stock: 0,
		products: 0,
		invoices: 0,
		customers: 0,
	})

	function _logEvent(event) {
		eventLog.value.unshift({
			id: event.id,
			topic: event.topic,
			at: event.at,
			payload: event.payload,
		})
		if (eventLog.value.length > EVENT_LOG_LIMIT) {
			eventLog.value.splice(EVENT_LOG_LIMIT)
		}
	}

	function _bump(topic) {
		const scope = resolveScope(topic)
		if (scope && scope in invalidators) invalidators[scope] += 1
	}

	/**
	 * Attach an already-created RealtimeClient to this store. Status mirrors
	 * live; every incoming event is logged (capped) and bumps its domain's
	 * invalidation counter.
	 */
	function attach(client) {
		if (!(client instanceof RealtimeClient)) {
			log.warn("attach() expects a RealtimeClient")
			return () => {}
		}
		const offStatus = client.onStatus((status) => {
			connectionState.value = status
			if (status === "connected") {
				connectedAt.value = new Date().toISOString()
				// A freshly-connected stream means we may have missed pushes while
				// offline — let the reconciliation pass catch up quietly.
				if (syncState.isOnline) {
					runSyncCycleSilently().catch(() =>
						log.warn("post-reconnect sync cycle failed"),
					)
				}
			} else if (status === "error" || status === "offline") {
				connectedAt.value = null
			}
		})
		const offMessage = client.onChange("*", (_payload, event) => {
			if (!event || typeof event.id !== "number") return
			lastEventId.value = event.id
			_bump(event.topic)
			_logEvent(event)
		})
		return () => {
			offStatus()
			offMessage()
		}
	}

	/**
	 * Version counter for a scope domain. Elements that `watch` this value know
	 * a remote change happened for their module and should re-fetch.
	 * @returns {{ [scope: string]: number }}
	 */
	function getInvalidation(scope) {
		return { [scope]: invalidators[scope] ?? 0 }
	}

	/** Reset volatile runtime state (no-op on connection). */
	function wipe() {
		eventLog.value = []
		lastEventId.value = null
		connectedAt.value = null
		for (const key of Object.keys(invalidators)) invalidators[key] = 0
	}

	return {
		connectionState,
		lastEventId,
		connectedAt,
		eventLog,
		invalidators,
		attach,
		getInvalidation,
		wipe,
	}
})

let activeClient = null

/**
 * App entry point: build the SSE client, connect, and wire it into the store.
 * Safe to call at app boot (after `app.use(createPinia())`); returns a teardown
 * that disconnects and unregisters. Calling twice returns the prior teardown.
 *
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {boolean} [options.enabled=true] pass false to keep the store pristine
 * @param {string} [options.tenantId] active tenant/session id (reported on the
 *   client for observability; EventSource cannot set headers, so the server
 *   re-resolves the tenant from the session JWT/cookie)
 * @returns {() => void}
 */
export function registerRealtimeSync(options = {}) {
	const enabled = options.enabled !== false
	if (!enabled) {
		return () => {}
	}
	if (syncStarted) {
		return () => disconnectActive()
	}
	syncStarted = true
	const store = useRealtimeStore()
	store.connectionState = "idle"

	const client = new RealtimeClient({
		url: options.url,
		getToken: getEffectiveToken,
		EventSourceCtor: options.EventSourceCtor,
		tenantId: options.tenantId,
	})
	activeClient = client
	store.attach(client)
	client.connect()

	return () => disconnectActive()
}

function disconnectActive() {
	syncStarted = false
	if (activeClient) {
		activeClient.dispose()
		activeClient = null
	}
}

/** Test / hot-reload hook: tear down the active client and allow a fresh
 *  registerRealtimeSync() call. No-op when nothing is registered. */
export function resetRealtimeSync() {
	disconnectActive()
}
