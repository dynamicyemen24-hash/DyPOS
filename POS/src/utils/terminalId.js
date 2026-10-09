/**
 * Terminal identity utilities — standalone, no circular dependencies.
 *
 * Used by bootstrap and posContext without creating import cycles.
 */

const TERMINAL_STORAGE_KEY = "dypos.terminal.id"

function safeStorage() {
	try {
		return typeof globalThis !== "undefined" && globalThis.localStorage
			? globalThis.localStorage
			: null
	} catch (error) {
		return null
	}
}

/**
 * Generate a device terminal identity (UUID-based, TERM- prefixed).
 * @returns {string}
 */
export function generateTerminalId() {
	const cryptoObj = globalThis.crypto
	if (typeof cryptoObj?.randomUUID === "function") {
		try {
			return `TERM-${cryptoObj.randomUUID()}`
		} catch (error) {
			/* fall through to the random fallback */
		}
	}
	const segment = () =>
		Math.floor(Math.random() * 0xffff)
			.toString(16)
			.padStart(4, "0")
	return `TERM-${segment()}${segment()}-${segment()}-${segment()}`
}

/**
 * Resolve the terminal identity for this device: reuse an existing one or
 * generate + persist a fresh id. Never regenerates an existing id.
 * @param {Object} [storage] - Injectable storage (testability).
 * @returns {string|null}
 */
export function resolveTerminalId(storage = safeStorage()) {
	if (storage) {
		try {
			const existing = storage.getItem(TERMINAL_STORAGE_KEY)
			if (existing) {
				return existing
			}
		} catch (error) {
			/* fall through */
		}
	}

	// A business terminal is provisioned data, not a client-generated identifier.
	// Never manufacture a terminal that can be mistaken for a real POS terminal.
	return null
}

/**
 * Import a provisioned terminal code (e.g. printed on the device).
 * @param {string} code
 * @param {Object} [storage]
 * @returns {string}
 */
export function importTerminalCode(code, storage = safeStorage()) {
	const normalized = String(code || "").trim()
	if (!normalized) {
		throw new TypeError("Terminal code is required")
	}
	if (storage) {
		try {
			storage.setItem(TERMINAL_STORAGE_KEY, normalized)
		} catch (error) {
			/* storage unavailable */
		}
	}
	return normalized
}

export { TERMINAL_STORAGE_KEY }