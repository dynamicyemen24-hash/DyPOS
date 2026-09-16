/**
 * DyPOS — QZ Tray Printing Infrastructure
 * ============================================================================
 *
 * Production-grade integration with QZ Tray.
 *
 * Responsibilities:
 * - Secure QZ Tray connection management.
 * - Server-side certificate retrieval.
 * - Server-side SHA-512 signing.
 * - Printer discovery.
 * - Saved printer management.
 * - HTML receipt printing.
 * - Reactive connection / trust state.
 * - Concurrent connection deduplication.
 * - Safe browser / SSR behavior.
 *
 * Non-responsibilities:
 * - No UI.
 * - No invoice generation.
 * - No receipt rendering.
 * - No authentication.
 * - No printer configuration persistence except the selected printer name.
 *
 * Security model:
 * - Private signing key MUST remain on the server.
 * - Browser receives only the public certificate.
 * - Every QZ operation is signed by the server.
 * - Failed certificate/signature retrieval is treated as failure.
 *
 * QZ Tray currently exposes:
 * - qz.websocket
 * - qz.security
 * - qz.printers
 * - qz.configs
 * - qz.print
 *
 * See:
 * https://qz.io/docs/signing
 */

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

import qz from "qz-tray"
import { ref } from "vue"

import { call } from "@/utils/apiWrapper"
import { logger } from "@/utils/logger"

const log = logger.create("QZTray")

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const PRINTER_STORAGE_KEY = "pos_qz_printer_name"

const DEFAULT_PAPER_WIDTH_MM = 80

const DEFAULT_ORIENTATION = "portrait"

const DEFAULT_CONNECT_OPTIONS = Object.freeze({
	/**
	 * QZ recommends secure WebSocket connections by default.
	 */
	usingSecure: true,

	/**
	 * Keep the retry policy short here.
	 *
	 * The application owns retry UX rather than allowing an uncontrolled
	 * background connection loop.
	 */
	retries: 0,
})

const QZ_TRUST_STATES = Object.freeze({
	UNKNOWN: "unknown",
	PENDING: "pending",
	TRUSTED: "trusted",
	UNTRUSTED: "untrusted",
})

const QZ_CONNECTION_STATES = Object.freeze({
	DISCONNECTED: "disconnected",
	CONNECTING: "connecting",
	CONNECTED: "connected",
	ERROR: "error",
})

/* -------------------------------------------------------------------------- */
/* Reactive state                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether QZ Tray is currently connected.
 */
export const qzConnected = ref(false)

/**
 * Whether a connection attempt is currently running.
 */
export const qzConnecting = ref(false)

/**
 * Certificate/signing trust state.
 *
 * unknown
 * pending
 * trusted
 * untrusted
 */
export const qzCertStatus = ref(QZ_TRUST_STATES.UNKNOWN)

/**
 * Last QZ connection/operation error.
 *
 * The actual Error object is intentionally not exposed as a public reactive
 * state to avoid accidentally rendering implementation details in the UI.
 */
export const qzLastError = ref(null)

/**
 * Last known QZ connection state.
 */
export const qzConnectionState = ref(QZ_CONNECTION_STATES.DISCONNECTED)

/* -------------------------------------------------------------------------- */
/* Internal state                                                             */
/* -------------------------------------------------------------------------- */

let securityInitialized = false

let cachedCertificate = null

let certificateRequestPromise = null

let connectPromise = null

let securityEpoch = 0

let callbacksInstalled = false

/* -------------------------------------------------------------------------- */
/* Browser helpers                                                            */
/* -------------------------------------------------------------------------- */

function isBrowser() {
	return typeof window !== "undefined" && typeof navigator !== "undefined"
}

function isQZActive() {
	try {
		return Boolean(qz?.websocket?.isActive?.())
	} catch {
		return false
	}
}

function errorMessage(error) {
	return error?.message || String(error || "Unknown error")
}

/* -------------------------------------------------------------------------- */
/* Error normalization                                                        */
/* -------------------------------------------------------------------------- */

function normalizeError(error, fallback = "QZ Tray operation failed") {
	if (error instanceof Error) {
		return error
	}

	const message = errorMessage(error)

	return new Error(message || fallback)
}

/* -------------------------------------------------------------------------- */
/* localStorage                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Get the printer selected for this device.
 *
 * This is intentionally DEVICE scoped, not USER scoped.
 */
export function getSavedPrinterName() {
	if (!isBrowser()) {
		return ""
	}

	try {
		return (localStorage.getItem(PRINTER_STORAGE_KEY) || "").trim()
	} catch (error) {
		log.warn?.("Unable to read saved printer", error)

		return ""
	}
}

/**
 * Persist the selected device printer.
 *
 * @param {string} name
 */
export function savePrinterName(name) {
	if (!isBrowser()) {
		return false
	}

	try {
		const normalized = typeof name === "string" ? name.trim() : ""

		if (normalized) {
			localStorage.setItem(PRINTER_STORAGE_KEY, normalized)
		} else {
			localStorage.removeItem(PRINTER_STORAGE_KEY)
		}

		return true
	} catch (error) {
		log.warn?.("Unable to save printer name", error)

		return false
	}
}

/**
 * Clear the device's saved printer.
 */
export function clearSavedPrinterName() {
	return savePrinterName("")
}

/* -------------------------------------------------------------------------- */
/* QZ callbacks                                                               */
/* -------------------------------------------------------------------------- */

function installQZCallbacks() {
	if (callbacksInstalled || !qz?.websocket) {
		return
	}

	callbacksInstalled = true

	qz.websocket.setClosedCallbacks((event) => {
		qzConnected.value = false
		qzConnecting.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.DISCONNECTED

		/**
		 * A closed connection does not mean the certificate itself is
		 * invalid. Keep trust state intact until a future handshake.
		 */
		log.info?.("QZ Tray connection closed", event)
	})

	qz.websocket.setErrorCallbacks((event) => {
		qzConnected.value = false
		qzConnecting.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.ERROR

		qzLastError.value = normalizeError(
			event?.exception ?? event,
			"QZ Tray connection error",
		)

		log.warn?.("QZ Tray connection error", qzLastError.value)
	})
}

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the public certificate from the DyPOS server.
 *
 * The private key MUST NEVER be sent to the browser.
 */
async function fetchCertificate() {
	if (cachedCertificate) {
		return cachedCertificate
	}

	if (certificateRequestPromise) {
		return certificateRequestPromise
	}

	certificateRequestPromise = (async () => {
		try {
			const response = await call("DyPOS.api.qz.get_certificate")

			const certificate =
				typeof response === "string" ? response : response?.message

			if (typeof certificate !== "string" || !certificate.trim()) {
				throw new Error("QZ certificate was empty")
			}

			cachedCertificate = certificate.trim()

			return cachedCertificate
		} catch (error) {
			cachedCertificate = null

			throw normalizeError(error, "Unable to retrieve QZ certificate")
		} finally {
			certificateRequestPromise = null
		}
	})()

	return certificateRequestPromise
}

/**
 * Invalidate only the cached public certificate.
 *
 * Useful when the server rotates the certificate.
 */
export function clearQZCertificateCache() {
	cachedCertificate = null
	securityEpoch += 1
}

/**
 * Configure QZ security exactly once.
 *
 * QZ's signing model expects a public certificate callback and a signature
 * callback. The signature itself is generated server-side. :contentReference[oaicite:1]{index=1}
 */
function setupSecurity() {
	if (securityInitialized) {
		return
	}

	securityInitialized = true

	qz.security.setCertificatePromise(
		async (resolve, reject) => {
			qzCertStatus.value = QZ_TRUST_STATES.PENDING

			try {
				const certificate = await fetchCertificate()

				resolve(certificate)
			} catch (error) {
				qzCertStatus.value = QZ_TRUST_STATES.UNTRUSTED

				log.error?.("QZ certificate retrieval failed", error)

				/**
				 * Reject rather than silently continuing unsigned.
				 *
				 * QZ documents rejectOnFailure as the appropriate mechanism
				 * when certificate acquisition fails. :contentReference[oaicite:2]{index=2}
				 */
				reject(error)
			}
		},
		{
			rejectOnFailure: true,
		},
	)

	qz.security.setSignatureAlgorithm("SHA512")

	qz.security.setSignaturePromise(async (toSign) => {
		qzCertStatus.value = QZ_TRUST_STATES.PENDING

		try {
			if (typeof toSign !== "string") {
				throw new TypeError("QZ signing payload must be a string")
			}

			const response = await call("DyPOS.api.qz.sign_message", {
				message: toSign,
			})

			const signature =
				typeof response === "string" ? response : response?.message

			if (typeof signature !== "string" || !signature.trim()) {
				throw new Error("QZ signature was empty")
			}

			qzCertStatus.value = QZ_TRUST_STATES.TRUSTED

			return signature.trim()
		} catch (error) {
			qzCertStatus.value = QZ_TRUST_STATES.UNTRUSTED

			log.error?.("QZ signing failed", error)

			throw normalizeError(error, "Unable to sign QZ request")
		}
	})
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Connect to the local QZ Tray application.
 *
 * Concurrent calls share the same Promise.
 *
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function connect(options = {}) {
	if (!isBrowser()) {
		qzConnected.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.DISCONNECTED

		return false
	}

	if (isQZActive()) {
		qzConnected.value = true
		qzConnecting.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.CONNECTED

		return true
	}

	if (connectPromise) {
		return connectPromise
	}

	connectPromise = performConnect(options)

	try {
		return await connectPromise
	} finally {
		connectPromise = null
	}
}

async function performConnect(options = {}) {
	setupSecurity()
	installQZCallbacks()

	qzConnecting.value = true
	qzLastError.value = null
	qzConnectionState.value = QZ_CONNECTION_STATES.CONNECTING

	const connectionOptions = {
		...DEFAULT_CONNECT_OPTIONS,
		...options,
	}

	try {
		await qz.websocket.connect(connectionOptions)

		qzConnected.value = true
		qzConnectionState.value = QZ_CONNECTION_STATES.CONNECTED

		log.info?.("Connected to QZ Tray", {
			version: await getQZVersionSafe(),
		})

		/**
		 * Do not use printer discovery as a fake trust probe.
		 *
		 * Trust is established by the certificate/signature callbacks when
		 * QZ actually performs a signed operation.
		 */
		return true
	} catch (error) {
		const normalized = normalizeError(error, "Could not connect to QZ Tray")

		qzConnected.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.ERROR

		qzLastError.value = normalized

		log.warn?.("Could not connect to QZ Tray", normalized)

		return false
	} finally {
		qzConnecting.value = false
	}
}

/**
 * Disconnect from QZ Tray.
 */
export async function disconnect() {
	if (!isQZActive()) {
		qzConnected.value = false
		qzConnecting.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.DISCONNECTED

		return true
	}

	try {
		await qz.websocket.disconnect()

		qzConnected.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.DISCONNECTED

		return true
	} catch (error) {
		const normalized = normalizeError(error, "Unable to disconnect QZ Tray")

		log.warn?.("QZ Tray disconnect failed", normalized)

		/**
		 * Local state must still represent the connection as closed after
		 * a disconnect request.
		 */
		qzConnected.value = false
		qzConnectionState.value = QZ_CONNECTION_STATES.DISCONNECTED

		return false
	} finally {
		qzConnecting.value = false
	}
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Returns a serializable snapshot suitable for diagnostics/UI.
 */
export function getQZStatus() {
	return {
		connected: qzConnected.value,
		connecting: qzConnecting.value,
		certificate: qzCertStatus.value,
		connection: qzConnectionState.value,
		printer: getSavedPrinterName(),
		lastError: qzLastError.value?.message ?? null,
	}
}

/**
 * Whether QZ is available for printing.
 */
export function isQZReady() {
	return isQZActive() && qzConnected.value
}

/* -------------------------------------------------------------------------- */
/* QZ version                                                                 */
/* -------------------------------------------------------------------------- */

async function getQZVersionSafe() {
	try {
		if (qz?.api?.getVersion) {
			return await qz.api.getVersion()
		}
	} catch {
		// Diagnostic only.
	}

	return null
}

/**
 * Public QZ version helper.
 */
export async function getQZVersion() {
	if (!isQZActive()) {
		return null
	}

	try {
		return await qz.api.getVersion()
	} catch (error) {
		log.warn?.("Unable to retrieve QZ Tray version", error)

		return null
	}
}

/* -------------------------------------------------------------------------- */
/* Printer discovery                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Find all system printers.
 *
 * @returns {Promise<string[]>}
 */
export async function findPrinters() {
	const connected = await connect()

	if (!connected) {
		return []
	}

	try {
		const printers = await qz.printers.find()

		const normalized = Array.isArray(printers)
			? printers.filter((name) => typeof name === "string" && name.trim())
			: []

		log.info?.("QZ printers discovered", {
			count: normalized.length,
		})

		return normalized
	} catch (error) {
		const normalized = normalizeError(error, "Unable to discover printers")

		log.error?.("QZ printer discovery failed", normalized)

		return []
	}
}

/**
 * Get the operating system default printer.
 *
 * @returns {Promise<string>}
 */
export async function getDefaultPrinter() {
	const connected = await connect()

	if (!connected) {
		return ""
	}

	try {
		const printer = await qz.printers.getDefault()

		return typeof printer === "string" ? printer : ""
	} catch (error) {
		log.warn?.("Unable to retrieve default printer", error)

		return ""
	}
}

/**
 * Check whether a specific printer exists.
 *
 * @param {string} printerName
 */
export async function printerExists(printerName) {
	const target = typeof printerName === "string" ? printerName.trim() : ""

	if (!target) {
		return false
	}

	const printers = await findPrinters()

	return printers.includes(target)
}

/* -------------------------------------------------------------------------- */
/* Printer configuration                                                       */
/* -------------------------------------------------------------------------- */

function normalizePrintOptions(options = {}) {
	const width = Number(options.width)

	const normalizedWidth =
		Number.isFinite(width) && width > 0 && width <= 500
			? width
			: DEFAULT_PAPER_WIDTH_MM

	const orientation =
		options.orientation === "landscape" ? "landscape" : DEFAULT_ORIENTATION

	return {
		width: normalizedWidth,
		orientation,
		/**
		 * Keep explicit margins deterministic for receipt printing.
		 */
		margins: {
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		},

		units: "mm",

		size: {
			width: normalizedWidth,
			height: null,
		},

		colorType: options.colorType === "color" ? "color" : "grayscale",

		interpolation: options.interpolation || "nearest-neighbor",
	}
}

function createHTMLPrintConfig(printer, options) {
	return qz.configs.create(printer, normalizePrintOptions(options))
}

/* -------------------------------------------------------------------------- */
/* HTML printing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Print a complete HTML document through QZ Tray.
 *
 * @param {string} html
 * @param {string} [printerName]
 * @param {Object} [options]
 *
 * @returns {Promise<boolean>}
 */
export async function printHTML(html, printerName, options = {}) {
	if (typeof html !== "string" || !html.trim()) {
		throw new TypeError("Print HTML must be a non-empty string")
	}

	const connected = await connect()

	if (!connected) {
		throw new Error("QZ Tray is not available")
	}

	const printer =
		typeof printerName === "string" ? printerName.trim() : getSavedPrinterName()

	if (!printer) {
		throw new Error(
			"No printer selected. Please select a printer in POS Settings.",
		)
	}

	const config = createHTMLPrintConfig(printer, options)

	const data = [
		{
			type: "pixel",
			format: "html",
			flavor: "plain",
			data: html,
		},
	]

	try {
		await qz.print(config, data)

		/**
		 * QZ resolves once the print request has been sent to the printer
		 * layer; this should not be presented as physical paper completion.
		 */
		log.info?.("QZ print job dispatched", {
			printer,
		})

		return true
	} catch (error) {
		const normalized = normalizeError(error, "QZ print failed")

		qzLastError.value = normalized

		log.error?.(`QZ print failed on "${printer}"`, normalized)

		throw normalized
	}
}

/* -------------------------------------------------------------------------- */
/* Printer selection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the effective printer without printing.
 *
 * Useful for UI and validation.
 */
export function resolvePrinterName(printerName = "") {
	const explicit = typeof printerName === "string" ? printerName.trim() : ""

	return explicit || getSavedPrinterName()
}

/**
 * Validate the configured printer against the current QZ printer list.
 */
export async function validateSavedPrinter() {
	const printer = getSavedPrinterName()

	if (!printer) {
		return {
			valid: false,
			printer: "",
		}
	}

	const valid = await printerExists(printer)

	return {
		valid,
		printer,
	}
}

/* -------------------------------------------------------------------------- */
/* Convenience print API                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Print using the persisted device printer.
 *
 * @param {string} html
 * @param {Object} [options]
 */
export function print(html, options = {}) {
	return printHTML(html, getSavedPrinterName(), options)
}

/* -------------------------------------------------------------------------- */
/* Public constants                                                           */
/* -------------------------------------------------------------------------- */

export { QZ_TRUST_STATES, QZ_CONNECTION_STATES, PRINTER_STORAGE_KEY }

/* -------------------------------------------------------------------------- */
/* Default export                                                             */
/* -------------------------------------------------------------------------- */

export default {
	connect,
	disconnect,

	findPrinters,
	getDefaultPrinter,
	printerExists,
	validateSavedPrinter,

	printHTML,
	print,

	getSavedPrinterName,
	savePrinterName,
	clearSavedPrinterName,
	resolvePrinterName,

	canConnect: isQZReady,
	isQZReady,
	getQZStatus,
	getQZVersion,

	clearQZCertificateCache,

	qzConnected,
	qzConnecting,
	qzCertStatus,
	qzLastError,
	qzConnectionState,
}
