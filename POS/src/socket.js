import { io } from "socket.io-client"

import { logger } from "@/utils/logger"

const log = logger.create("Socket")

/**
 * ============================================================================
 * DyPOS Realtime Socket Infrastructure
 * ============================================================================
 *
 * Responsibilities:
 * - Resolve the correct Socket.IO endpoint.
 * - Create exactly one client instance.
 * - Keep connection lifecycle deterministic.
 * - Support lazy connection.
 * - Handle reconnects safely.
 * - Expose connection state without coupling business logic.
 * - Prevent duplicate initialization/listeners.
 * - Work safely during SSR/build/test environments.
 * - Preserve Frappe/Bench compatibility.
 *
 * This module intentionally does NOT contain business events.
 *
 * Business layers should use:
 *
 *   const socket = useSocket();
 *   socket?.on("event", handler);
 *
 * or the higher-level subscription helpers below.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_SOCKETIO_PORT = 9000

const DEFAULT_OPTIONS = Object.freeze({
	autoConnect: false,

	withCredentials: true,

	reconnection: true,

	/**
	 * Socket.IO will continue reconnecting according to its backoff
	 * configuration. We deliberately avoid an artificially low attempt
	 * count because POS realtime should recover after temporary network
	 * interruptions.
	 */
	reconnectionAttempts: Number.POSITIVE_INFINITY,

	reconnectionDelay: 500,

	reconnectionDelayMax: 5_000,

	randomizationFactor: 0.5,

	timeout: 10_000,

	transports: ["websocket", "polling"],
})

const SOCKET_STATES = Object.freeze({
	IDLE: "idle",
	CONNECTING: "connecting",
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	ERROR: "error",
})

/* -------------------------------------------------------------------------- */
/* Runtime state                                                              */
/* -------------------------------------------------------------------------- */

let socket = null

let socketState = SOCKET_STATES.IDLE

let lastError = null

let lastConnectedAt = null

let lastDisconnectedAt = null

let initializationKey = null

const subscriptions = new Map()

const stateListeners = new Set()

/* -------------------------------------------------------------------------- */
/* Environment helpers                                                        */
/* -------------------------------------------------------------------------- */

function isBrowser() {
	return typeof window !== "undefined" && typeof document !== "undefined"
}

function isDevelopment() {
	return import.meta.env?.DEV === true
}

/* -------------------------------------------------------------------------- */
/* Safe runtime access                                                        */
/* -------------------------------------------------------------------------- */

function getFrappeBoot() {
	if (!isBrowser()) {
		return null
	}

	try {
		return window.frappe?.boot || null
	} catch {
		return null
	}
}

function getRuntimeSiteName(siteNameOverride) {
	if (siteNameOverride) {
		return String(siteNameOverride)
	}

	if (!isBrowser()) {
		return null
	}

	const boot = getFrappeBoot()

	return (
		window.site_name ||
		boot?.sitename ||
		boot?.site_name ||
		window.location.hostname ||
		null
	)
}

function getConfiguredPort() {
	const envPort = Number(import.meta.env?.VITE_SOCKETIO_PORT)

	if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) {
		return envPort
	}

	const bootPort = Number(getFrappeBoot()?.socketio_port)

	if (Number.isInteger(bootPort) && bootPort > 0 && bootPort <= 65535) {
		return bootPort
	}

	return DEFAULT_SOCKETIO_PORT
}

/* -------------------------------------------------------------------------- */
/* URL resolution                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the Socket.IO endpoint.
 *
 * Production:
 *   https://example.com/site
 *
 * Development / Bench:
 *   http://example.com:9000/site
 *
 * The current page protocol is authoritative unless an explicit
 * socket protocol is supplied by configuration.
 */
function resolveSocketUrl(siteNameOverride) {
	if (!isBrowser()) {
		return null
	}

	const location = window.location

	const siteName = getRuntimeSiteName(siteNameOverride)

	if (!siteName) {
		throw new Error("Unable to determine Frappe site name for Socket.IO")
	}

	const boot = getFrappeBoot()

	const configuredUrl =
		import.meta.env?.VITE_SOCKETIO_URL ||
		boot?.socketio_url ||
		boot?.socketio_url_prefix

	if (configuredUrl) {
		try {
			const base = new URL(String(configuredUrl), location.origin)

			return new URL(
				String(siteName).replace(/^\/+|\/+$/g, ""),
				`${base.origin}${base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`}`,
			)
				.toString()
				.replace(/\/$/, "")
		} catch (error) {
			log.warn?.(
				"Invalid configured Socket.IO URL. Falling back to runtime resolution.",
				error,
			)
		}
	}

	/**
	 * When the page is explicitly served through a development
	 * port, connect to the classic Socket.IO port.
	 *
	 * In normal production deployments, Socket.IO should share
	 * the page origin through the reverse proxy.
	 */
	const isSecurePage = location.protocol === "https:"

	const isLikelyDevelopment =
		isDevelopment() ||
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1" ||
		location.hostname === "::1"

	const protocol = isSecurePage ? "https:" : "http:"

	const shouldUseExplicitPort =
		isLikelyDevelopment &&
		!isSecurePage &&
		getConfiguredPort() !== Number(location.port)

	const authority = shouldUseExplicitPort
		? `${location.hostname}:${getConfiguredPort()}`
		: location.host

	return `${protocol}//${authority}/${encodeURIComponent(siteName)}`
}

/* -------------------------------------------------------------------------- */
/* State management                                                           */
/* -------------------------------------------------------------------------- */

function setSocketState(nextState, error = null) {
	if (socketState === nextState && lastError === error) {
		return
	}

	socketState = nextState
	lastError = error

	for (const listener of stateListeners) {
		try {
			listener({
				state: socketState,
				error: lastError,
				connected: socketState === SOCKET_STATES.CONNECTED,
				connecting: socketState === SOCKET_STATES.CONNECTING,
				disconnected: socketState === SOCKET_STATES.DISCONNECTED,
				timestamp: Date.now(),
			})
		} catch (listenerError) {
			log.warn?.("Socket state listener failed", listenerError)
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Event lifecycle                                                            */
/* -------------------------------------------------------------------------- */

function handleConnect() {
	lastConnectedAt = Date.now()
	lastError = null

	setSocketState(SOCKET_STATES.CONNECTED)

	log.debug?.("Socket connected", {
		id: socket?.id,
	})
}

function handleConnecting() {
	setSocketState(SOCKET_STATES.CONNECTING)

	if (isDevelopment()) {
		log.debug?.("Socket connecting")
	}
}

function handleConnectError(error) {
	lastError = error

	setSocketState(SOCKET_STATES.ERROR, error)

	log.warn?.("Socket connection error", {
		message: error?.message,
	})

	/**
	 * Do not throw from Socket.IO event handlers.
	 *
	 * Reconnection is owned by Socket.IO.
	 */
}

function handleDisconnect(reason) {
	lastDisconnectedAt = Date.now()

	/**
	 * "io client disconnect" means the application intentionally
	 * disconnected the socket. Other reasons may be recoverable.
	 */
	const intentionallyDisconnected = reason === "io client disconnect"

	setSocketState(
		intentionallyDisconnected
			? SOCKET_STATES.DISCONNECTED
			: SOCKET_STATES.DISCONNECTED,
	)

	log.debug?.("Socket disconnected", {
		reason,
	})
}

function handleReconnectAttempt(attempt) {
	if (isDevelopment()) {
		log.debug?.(`Socket reconnect attempt #${attempt}`)
	}
}

function handleReconnect(attempt) {
	lastConnectedAt = Date.now()
	lastError = null

	setSocketState(SOCKET_STATES.CONNECTED)

	log.debug?.("Socket reconnected", {
		attempt,
		id: socket?.id,
	})
}

function handleReconnectError(error) {
	lastError = error

	log.warn?.("Socket reconnect error", {
		message: error?.message,
	})
}

function handleReconnectFailed() {
	setSocketState(SOCKET_STATES.ERROR, lastError)

	log.warn?.("Socket reconnection failed")
}

/* -------------------------------------------------------------------------- */
/* Listener registration                                                      */
/* -------------------------------------------------------------------------- */

function attachLifecycleListeners(instance) {
	instance.on("connect", handleConnect)
	instance.on("connecting", handleConnecting)
	instance.on("connect_error", handleConnectError)
	instance.on("disconnect", handleDisconnect)

	instance.io?.on("reconnect_attempt", handleReconnectAttempt)
	instance.io?.on("reconnect", handleReconnect)
	instance.io?.on("reconnect_error", handleReconnectError)
	instance.io?.on("reconnect_failed", handleReconnectFailed)
}

function detachLifecycleListeners(instance) {
	instance.off("connect", handleConnect)
	instance.off("connecting", handleConnecting)
	instance.off("connect_error", handleConnectError)
	instance.off("disconnect", handleDisconnect)

	instance.io?.off("reconnect_attempt", handleReconnectAttempt)

	instance.io?.off("reconnect", handleReconnect)
	instance.io?.off("reconnect_error", handleReconnectError)

	instance.io?.off("reconnect_failed", handleReconnectFailed)
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */

export function initSocket(siteNameOverride = null, options = {}) {
	/**
	 * Socket.IO is browser-only in this application.
	 */
	if (!isBrowser()) {
		log.debug?.("Socket initialization skipped outside browser environment")

		return null
	}

	/**
	 * Singleton protection.
	 */
	if (socket) {
		log.debug?.("Socket already initialized")
		return socket
	}

	try {
		const url = resolveSocketUrl(siteNameOverride)

		if (!url) {
			throw new Error("Socket.IO URL could not be resolved")
		}

		const mergedOptions = {
			...DEFAULT_OPTIONS,
			...options,
		}

		/**
		 * Keep the initialization identity so accidental attempts
		 * to initialize the same socket through different modules
		 * remain deterministic.
		 */
		initializationKey = `${url}`

		log.debug?.(
			"Initializing Socket.IO",
			isDevelopment()
				? {
						url,
						autoConnect: mergedOptions.autoConnect,
					}
				: {
						host: new URL(url).host,
					},
		)

		const instance = io(url, mergedOptions)

		socket = instance

		attachLifecycleListeners(instance)

		setSocketState(
			instance.connected ? SOCKET_STATES.CONNECTED : SOCKET_STATES.IDLE,
		)

		return instance
	} catch (error) {
		lastError = error
		setSocketState(SOCKET_STATES.ERROR, error)

		log.error?.("Failed to initialize Socket.IO", error)

		/**
		 * Do NOT return a fake socket.
		 *
		 * A fake object hides infrastructure failures and makes
		 * production bugs extremely difficult to diagnose.
		 *
		 * Consumers should handle a null socket explicitly.
		 */
		socket = null

		return null
	}
}

/* -------------------------------------------------------------------------- */
/* Connection controls                                                        */
/* -------------------------------------------------------------------------- */

export function connectSocket() {
	if (!socket) {
		log.warn?.("connectSocket() called before initSocket()")

		return false
	}

	if (socket.connected) {
		return true
	}

	try {
		setSocketState(SOCKET_STATES.CONNECTING)

		socket.connect()

		return true
	} catch (error) {
		setSocketState(SOCKET_STATES.ERROR, error)

		log.error?.("Failed to connect Socket.IO", error)

		return false
	}
}

export function disconnectSocket() {
	if (!socket) {
		return
	}

	const instance = socket

	try {
		detachLifecycleListeners(instance)

		/**
		 * Remove application-level subscriptions registered through
		 * subscribeSocket().
		 */
		for (const cleanup of subscriptions.values()) {
			try {
				cleanup()
			} catch (error) {
				log.warn?.("Socket subscription cleanup failed", error)
			}
		}

		subscriptions.clear()

		instance.removeAllListeners()

		if (instance.connected || instance.active) {
			instance.disconnect()
		}
	} catch (error) {
		log.warn?.("Socket disconnect encountered an error", error)
	} finally {
		socket = null
		initializationKey = null
		lastError = null
		lastDisconnectedAt = Date.now()

		setSocketState(SOCKET_STATES.DISCONNECTED)

		log.debug?.("Socket disconnected and cleared")
	}
}

/* -------------------------------------------------------------------------- */
/* Socket access                                                              */
/* -------------------------------------------------------------------------- */

export function useSocket() {
	return socket
}

export function isSocketConnected() {
	return socket?.connected === true
}

export function getSocketState() {
	return {
		state: socketState,
		connected: socketState === SOCKET_STATES.CONNECTED,
		connecting: socketState === SOCKET_STATES.CONNECTING,
		error: lastError,
		id: socket?.id || null,
		url: initializationKey,
		lastConnectedAt,
		lastDisconnectedAt,
	}
}

/* -------------------------------------------------------------------------- */
/* State subscription                                                         */
/* -------------------------------------------------------------------------- */

export function onSocketStateChange(listener) {
	if (typeof listener !== "function") {
		return () => {}
	}

	stateListeners.add(listener)

	/**
	 * Immediately provide the current state.
	 */
	try {
		listener({
			state: socketState,
			error: lastError,
			connected: socketState === SOCKET_STATES.CONNECTED,
			connecting: socketState === SOCKET_STATES.CONNECTING,
			disconnected: socketState === SOCKET_STATES.DISCONNECTED,
			timestamp: Date.now(),
		})
	} catch (error) {
		log.warn?.("Socket state listener failed", error)
	}

	return () => {
		stateListeners.delete(listener)
	}
}

/* -------------------------------------------------------------------------- */
/* Event subscription                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Safe application-level event subscription.
 *
 * Returns an unsubscribe function.
 *
 * Example:
 *
 * const unsubscribe = subscribeSocket(
 *     "pos:invoice_updated",
 *     handler,
 * );
 *
 * onUnmounted(unsubscribe);
 */
export function subscribeSocket(event, handler, options = {}) {
	if (!socket) {
		log.warn?.(`Cannot subscribe to "${event}" before socket initialization`)

		return () => {}
	}

	if (typeof event !== "string" || event.trim().length === 0) {
		return () => {}
	}

	if (typeof handler !== "function") {
		return () => {}
	}

	const normalizedEvent = event.trim()

	const once = options.once === true

	if (once) {
		socket.once(normalizedEvent, handler)
	} else {
		socket.on(normalizedEvent, handler)
	}

	const unsubscribe = () => {
		if (!socket) {
			return
		}

		socket.off(normalizedEvent, handler)
	}

	const key = Symbol(normalizedEvent)

	subscriptions.set(key, unsubscribe)

	return () => {
		unsubscribe()
		subscriptions.delete(key)
	}
}

/* -------------------------------------------------------------------------- */
/* Event emission                                                             */
/* -------------------------------------------------------------------------- */

export function emitSocket(event, ...args) {
	if (!socket) {
		log.warn?.(`Cannot emit "${event}" before socket initialization`)

		return false
	}

	if (!socket.connected) {
		log.debug?.(
			`Socket event "${event}" skipped because socket is disconnected`,
		)

		return false
	}

	try {
		socket.emit(event, ...args)

		return true
	} catch (error) {
		log.error?.(`Failed to emit socket event "${event}"`, error)

		return false
	}
}

/* -------------------------------------------------------------------------- */
/* Acknowledged emission                                                      */
/* -------------------------------------------------------------------------- */

export function emitSocketWithAck(event, payload, options = {}) {
	const timeout = Number(options.timeout) || 10_000

	if (!socket || !socket.connected) {
		return Promise.reject(new Error("Socket is not connected"))
	}

	return new Promise((resolve, reject) => {
		let settled = false

		const finish = (callback, value) => {
			if (settled) {
				return
			}

			settled = true
			callback(value)
		}

		const timer = setTimeout(() => {
			finish(reject, new Error(`Socket acknowledgement timeout: ${event}`))
		}, timeout)

		try {
			socket.emit(event, payload, (response) => {
				clearTimeout(timer)
				finish(resolve, response)
			})
		} catch (error) {
			clearTimeout(timer)
			finish(reject, error)
		}
	})
}

/* -------------------------------------------------------------------------- */
/* Lifecycle cleanup                                                          */
/* -------------------------------------------------------------------------- */

export function resetSocket() {
	disconnectSocket()

	stateListeners.clear()
	subscriptions.clear()

	socketState = SOCKET_STATES.IDLE
	lastError = null
	lastConnectedAt = null
	lastDisconnectedAt = null
	initializationKey = null
}

/* -------------------------------------------------------------------------- */
/* Public constants                                                           */
/* -------------------------------------------------------------------------- */

export { SOCKET_STATES }
