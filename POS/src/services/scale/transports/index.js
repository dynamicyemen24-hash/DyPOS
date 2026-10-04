/**
 * Transport registry — the HAL's transport table.
 *
 * Adding a transport means adding one module and one line here; no caller
 * changes. This file is deliberately dumb: it builds factories and reports
 * which ones this browser can actually run.
 *
 * @see ../transportCore.js — the contract every transport fulfils
 */
import {
	createFramePump,
	checkTransportContract,
	splitFrames,
	TRANSPORT_CONTRACT,
} from "../transportCore"
import { createWebSerialTransport } from "./webSerialTransport"
import { createWebBluetoothTransport } from "./webBluetoothTransport"
import { createWebSocketTransport } from "./webSocketTransport"

/** Transport factories keyed by id — the settings screen iterates this. */
export const TRANSPORTS = Object.freeze({
	"web-serial": createWebSerialTransport,
	bluetooth: createWebBluetoothTransport,
	websocket: createWebSocketTransport,
})

/** Arabic labels for the settings screen (invariant 7). */
export const TRANSPORT_LABELS_AR = Object.freeze({
	"web-serial": "USB (منفذ تسلسلي)",
	bluetooth: "بلوتوث لاسلكي",
	websocket: "جسر محلي (شبكة)",
})

/** Transport ids the HAL accepts. */
export const SUPPORTED_TRANSPORT_IDS = Object.freeze(Object.keys(TRANSPORTS))

/**
 * Build a transport and verify it fulfils the contract.
 *
 * The check is here rather than at connect time so a malformed transport is
 * a startup failure, not a cashier-facing one.
 *
 * @param {string} id
 * @param {object} [options] passed through to the factory
 * @returns {object} a contract-checked transport
 * @throws {Error} for an unknown id or an incomplete transport
 */
export function createTransport(id, options = {}) {
	const factory = TRANSPORTS[id]
	if (!factory) throw new Error(`نقل غير معروف: ${id}`)

	const transport = factory(options)
	const { ok, missing } = checkTransportContract(transport)
	if (!ok) {
		throw new Error(`النقل ${id} لا يحقق العقد: ينقص ${missing.join(", ")}`)
	}

	return transport
}

/**
 * Which transports this browser can run right now.
 *
 * Probed on the live object, not sniffed from the user agent — a till that
 * cannot do USB serial must be told so, not shown a button that throws.
 *
 * @param {object} [options]
 * @returns {{ id: string, label: string, supported: boolean }[]}
 */
export function availableTransports(options = {}) {
	return SUPPORTED_TRANSPORT_IDS.map((id) => {
		const transport = createTransport(id, options)
		return {
			id,
			label: TRANSPORT_LABELS_AR[id],
			supported: transport.isSupported() === true,
		}
	})
}

export {
	createFramePump,
	checkTransportContract,
	splitFrames,
	TRANSPORT_CONTRACT,
	createWebSerialTransport,
	createWebBluetoothTransport,
	createWebSocketTransport,
}

export default {
	TRANSPORTS,
	TRANSPORT_LABELS_AR,
	SUPPORTED_TRANSPORT_IDS,
	createTransport,
	availableTransports,
	splitFrames,
	checkTransportContract,
}
