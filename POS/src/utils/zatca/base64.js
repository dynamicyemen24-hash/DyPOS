/**
 * Base64 / hex helpers shared by the ZATCA modules.
 *
 * Single source on purpose: invoice artefacts (QR payload, CSID public key,
 * DER signature) are compared byte-for-byte in tests and re-derived on the
 * server. Two subtly different encoders would be a silent interop bug, so
 * there is exactly one implementation and everything imports it.
 *
 * Works unchanged in the browser and in Node/jsdom.
 */

/** Base64-encode raw bytes. */
export function bytesToBase64(bytes) {
	if (!(bytes instanceof Uint8Array)) {
		throw new TypeError(
			`bytesToBase64 expects a Uint8Array (got ${typeof bytes})`,
		)
	}
	let binary = ""
	// Chunked to stay well clear of the argument-count limit on large inputs.
	const CHUNK = 0x8000
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
	}
	return btoa(binary)
}

/** Decode Base64 to raw bytes. */
export function base64ToBytes(value) {
	const binary = atob(String(value))
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
	return out
}

/** Lowercase hex, for digests and audit trails. */
export function bytesToHex(bytes) {
	if (!(bytes instanceof Uint8Array)) {
		throw new TypeError(`bytesToHex expects a Uint8Array (got ${typeof bytes})`)
	}
	let hex = ""
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
	return hex
}

/** Parse lowercase/uppercase hex to raw bytes. */
export function hexToBytes(hex) {
	const clean = String(hex).trim()
	if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
		throw new TypeError("hexToBytes expects an even-length hex string")
	}
	const out = new Uint8Array(clean.length / 2)
	for (let i = 0; i < out.length; i += 1)
		out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
	return out
}

/**
 * Wrap raw bytes as standard (non-PEM) Base64 in fixed-width lines.
 * @param {Uint8Array} bytes
 * @param {number} [width=64]
 */
export function toPemBody(bytes, width = 64) {
	const b64 = bytesToBase64(bytes)
	const lines = []
	for (let i = 0; i < b64.length; i += width)
		lines.push(b64.slice(i, i + width))
	return lines.join("\n")
}

export default {
	bytesToBase64,
	base64ToBytes,
	bytesToHex,
	hexToBytes,
	toPemBody,
}
