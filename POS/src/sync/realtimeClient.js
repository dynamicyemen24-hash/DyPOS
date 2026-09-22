/**
 * DyPOS realtime SSE client (v1.35.0).
 *
 * Thin EventSource wrapper behind a tiny state machine so the same client is
 * testable with a fake EventSource and usable in offline kiosks:
 *
 *   disabled    - the browser/runtime has no EventSource (no-op connection)
 *   offline     - navigator is offline (no connection attempt)
 *   idle        - constructed, nothing opened yet
 *   connected   - stream open
 *   reconnecting- stream dropped, exponential backoff active
 *   error       - a retry just failed / fatal auth refusal
 *
 * Reconnect strategy
 * ------------------
 * The browser's native EventSource auto-reconnect re-sends `Last-Event-ID`
 * itself ONLY for its own internal reconnect loop; the moment we manually
 * `close()` we lose that header. So we track `lastEventId` from received
 * frames and pass it back as an explicit `lastEventId` query param on every
 * rebuild, letting the server (lib/realtime.js) replay buffered events.
 *
 * Exports: backoffDelay(), RealtimeClient, createRealtimeClient()
 */
import { logger } from "@/utils/logger"

export const RT_MAX_RECONNECT_MS = 60_000

/** Exponential backoff, capped. attempt is 1-based. */
export function backoffDelay(
	attempt,
	initialMs = 1000,
	maxMs = RT_MAX_RECONNECT_MS,
) {
	if (!Number.isFinite(attempt) || attempt < 1) return initialMs
	const raw = initialMs * 2 ** (attempt - 1)
	return Math.min(Math.max(raw, initialMs), maxMs)
}

export const RT_STATE_IDLE = "idle"
export const RT_STATE_CONNECTED = "connected"
export const RT_STATE_RECONNECTING = "reconnecting"
export const RT_STATE_ERROR = "error"
export const RT_STATE_OFFLINE = "offline"
export const RT_STATE_DISABLED = "disabled"

export class RealtimeClient {
	/**
* @param {object} options
 * @param {string} [options.url] SSE endpoint (built from window origin by default)
 * @param {() => (string | null)} [options.getToken] returns the auth token
 * @param {typeof EventSource} [options.EventSourceCtor] injectable for tests;
 *   `null` forces the disabled state
 * @param {() => boolean} [options.isOffline] overrides navigator.onLine
 * @param {string} [options.tenantId] active tenant marker (EventSource cannot
 *   set headers, so the server re-resolves the tenant from the JWT/cookie)
 */
constructor(options = {}) {
	this.log = logger.create("RealtimeClient")
	this.options = options
	this.url = options.url ?? `${window.location.origin}/api/realtime/events`
	this.getToken = options.getToken ?? (() => null)
	this.calcOffline = options.isOffline ?? (() => !navigator.onLine)
	this.state = RT_STATE_IDLE
	this.es = null
	this.lastEventId = null
	this.attempts = 0
	this.tenantId = options.tenantId ?? null
		this.timer = null
		this.disposed = false
		this.statusCallbacks = new Set()
		this.handlers = new Map() // topic -> Set<fn>  ("*" = all topics)

		const ctor =
			options.EventSourceCtor === undefined
				? globalThis.EventSource
				: options.EventSourceCtor
		this.ctor = typeof ctor === "function" ? ctor : null
		if (!this.ctor) {
			this.state = RT_STATE_DISABLED
			this.log.warn("EventSource unavailable — realtime disabled")
		}

		this._onOnline = () => {
			if (this.disposed) return
			if (this.calcOffline()) return
			if (this.state === RT_STATE_OFFLINE) {
				this.connect()
			}
		}
		this._onOffline = () => {
			if (this.disposed) return
			this._goOffline()
		}
		if (typeof window !== "undefined" && window.addEventListener) {
			window.addEventListener("online", this._onOnline)
			window.addEventListener("offline", this._onOffline)
		}
	}

	/** @returns {string} currently assigned status atom */
	get status() {
		return this.state
	}

	buildUrl() {
		const u = new URL(this.url)
		const token = this.getToken()
		if (token) u.searchParams.set("token", String(token))
		if (this.lastEventId != null)
			u.searchParams.set("lastEventId", String(this.lastEventId))
		return u.toString()
	}

	connect() {
		if (this.disposed || this.state === RT_STATE_DISABLED) return
		if (this.calcOffline()) {
			this._goOffline()
			return
		}
		if (this.es) {
			try {
				this.es.close()
			} catch {
				/* noop */
			}
		}
		this._emitStatus(RT_STATE_RECONNECTING)
		const es = new this.ctor(this.buildUrl())
		es.addEventListener("open", () => this._onOpen(es))
		es.addEventListener("message", (e) => this._onMessage(e))
		es.addEventListener("error", () => this._onError(es))
		this.es = es
	}

	/** @param {(status: string, meta?: object) => void} cb */
	onStatus(cb) {
		this.statusCallbacks.add(cb)
		return () => this.statusCallbacks.delete(cb)
	}

	/** @param {string} topic topic to listen to ("*" = all) */
	onChange(topic, cb) {
		if (!this.handlers.has(topic)) this.handlers.set(topic, new Set())
		this.handlers.get(topic).add(cb)
		return () => this.handlers.get(topic)?.delete(cb)
	}

	_onOpen(es) {
		if (this.disposed || es !== this.es) return
		this.attempts = 0
		this._emitStatus(RT_STATE_CONNECTED)
	}

	_onMessage(e) {
		if (this.disposed || this.state === RT_STATE_DISABLED) return
		let data
		try {
			data = JSON.parse(String(e.data || ""))
		} catch {
			return // server keep-alive comment/empty frames
		}
		if (data && typeof data.id === "number") this.lastEventId = data.id
		const topic = String(data?.topic ?? "")
		if (!topic) return
		for (const cb of this.handlers.get(topic) ?? []) {
			try {
				cb(data.payload, data)
			} catch (err) {
				this.log.warn("realtime handler failed", err)
			}
		}
		if (topic !== "*") {
			for (const cb of this.handlers.get("*") ?? []) {
				try {
					cb(data.payload, data)
				} catch (err) {
					this.log.warn("realtime wildcard handler failed", err)
				}
			}
		}
	}

	_onError(es) {
		if (this.disposed || this.state === RT_STATE_DISABLED) return
		try {
			es.close()
		} catch {
			/* noop */
		}
		if (this.es === es) this.es = null
		const cap = this.calcOffline()
		if (cap) {
			this._goOffline()
			return
		}
		this.attempts += 1
		this._emitStatus(RT_STATE_ERROR)
		this._scheduleReconnect()
	}

	_scheduleReconnect() {
		if (this.disposed || this.timer) return
		const delay = backoffDelay(this.attempts)
		this.log.warn(
			"realtime reconnecting in %dms (attempt %d)",
			delay,
			this.attempts,
		)
		this.timer = setTimeout(() => {
			this.timer = null
			this.connect()
		}, delay)
	}

	_goOffline() {
		this._clearTimer()
		if (this.es) {
			try {
				this.es.close()
			} catch {
				/* noop */
			}
			this.es = null
		}
		if (this.state !== RT_STATE_DISABLED) this._emitStatus(RT_STATE_OFFLINE)
	}

	_emitStatus(status) {
		this.state = status
		for (const cb of this.statusCallbacks) {
			try {
				cb(status, { lastEventId: this.lastEventId, attempts: this.attempts })
			} catch (err) {
				this.log.warn("realtime status callback failed", err)
			}
		}
	}

	_clearTimer() {
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
	}

	disconnect() {
		this._clearTimer()
		if (this.es) {
			try {
				this.es.close()
			} catch {
				/* noop */
			}
			this.es = null
		}
		if (this.state !== RT_STATE_DISABLED && this.state !== RT_STATE_OFFLINE) {
			this._emitStatus(RT_STATE_IDLE)
		}
	}

	dispose() {
		if (this.disposed) return
		this.disposed = true
		this.disconnect()
		this.statusCallbacks.clear()
		this.handlers.clear()
		if (typeof window !== "undefined" && window.removeEventListener) {
			window.removeEventListener("online", this._onOnline)
			window.removeEventListener("offline", this._onOffline)
		}
	}
}

/** Factory — mirrors createPinia/registerRealtimeSync call-sites in the app. */
export function createRealtimeClient(options = {}) {
	return new RealtimeClient(options)
}
