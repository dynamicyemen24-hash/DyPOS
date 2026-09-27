/**
 * Real secp256k1 provider for ZATCA, backed by `@noble/curves`.
 *
 * This is the implementation that `signature.js` refuses to fabricate. It
 * supplies genuine ECDSA on secp256k1 — never a P-256 substitute, which would
 * produce a signature that *looks* valid and is silently rejected by the tax
 * authority.
 *
 * WHAT IS **NOT** IMPLEMENTED HERE
 * -------------------------------
 * The ZATCA *cryptographic stamp* (ECIES over secp256k1) is deliberately
 * absent. Its exact byte layout (ephemeral-key ECDH, AES-256-CBC key/IV
 * derivation, HMAC-SHA256 authentication tag, counter and IV framing) must be
 * matched to the published specification and verified against the official SDK.
 * Guessing it would recreate precisely the defect this module exists to prevent:
 * a plausible-looking artefact that no authority accepts. `signature.js` keeps
 * refusing to build a stamp, and that refusal is correct until the construction
 * is validated. See `createCryptographicStamp`.
 *
 * NOT OFFICIALLY VALIDATED: the maths here is standard and self-tested, but no
 * ZATCA XSD/SDK/Fatoora validation has been run. Treat this as a correct
 * cryptographic building block, not as a compliance certificate.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js"

import { base64ToBytes, bytesToBase64, bytesToHex as toHex } from "./base64.js"

function assertBytes(value, length, label) {
	if (!(value instanceof Uint8Array) || value.length !== length) {
		throw new TypeError(
			`${label} must be a ${length}-byte Uint8Array (got ${
				value instanceof Uint8Array ? `${value.length} bytes` : typeof value
			})`,
		)
	}
}

/**
 * Sign a 32-byte SHA-256 digest with ECDSA/secp256k1.
 *
 * `prehash: false` is essential: the digest has already been computed, and
 * noble's default (`prehash: true`) would hash it a second time and sign a
 * completely different message.
 *
 * `format: "der"` is equally essential. noble's default is `"compact"` (64 raw
 * bytes r||s), which is NOT what ZATCA accepts — the invoice signature must be
 * ASN.1 DER. Omitting this produces a 64-byte value that looks like a
 * signature and is rejected by the authority.
 *
 * `lowS: true` (the library default) keeps `s` in the lower half-order, which
 * is the canonical form ZATCA expects and avoids signature malleability.
 *
 * @param {Uint8Array} digestBytes 32-byte SHA-256 digest
 * @param {Uint8Array} privateKeyBytes 32-byte CSID private key
 * @returns {Promise<string>} Base64 DER-encoded ECDSA signature
 */
export async function sign(digestBytes, privateKeyBytes) {
	assertBytes(digestBytes, 32, "invoice digest")
	assertBytes(privateKeyBytes, 32, "private key")

	const signature = secp256k1.sign(digestBytes, privateKeyBytes, {
		prehash: false,
		lowS: true,
		format: "der",
	})

	// noble v2 returns a Uint8Array already in the requested format; v1 returned
	// a Signature object exposing toDERRawBytes(). Accept both, but never fall
	// back to a non-DER encoding — a wrong-format signature is a silent
	// compliance failure, so fail loudly instead.
	let der
	if (signature instanceof Uint8Array) {
		der = signature
	} else if (typeof signature?.toDERRawBytes === "function") {
		der = signature.toDERRawBytes()
	} else {
		throw new Error(
			"[ZATCA] secp256k1 provider returned an unrecognised signature type; " +
				"refusing to emit a non-DER signature",
		)
	}

	// Cheap structural assertion: DER SEQUENCE, single-byte length, INTEGER.
	if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 0x02) {
		throw new Error(
			"[ZATCA] secp256k1 provider produced a non-DER signature; refusing to continue",
		)
	}

	return bytesToBase64(der)
}

/**
 * Public key for the CSID certificate request.
 *
 * ZATCA expects the **raw uncompressed EC point** — 65 bytes laid out as
 * `0x04 || X(32) || Y(32)` — Base64-encoded. It is *not* an SPKI/DER wrapper;
 * wrapping it in SPKI is a common mistake that yields a rejected CSR.
 *
 * @param {Uint8Array} [privateKeyBytes] omit to derive later via getPublicKeyBase64
 * @returns {Promise<string>} Base64 raw uncompressed public key
 */
export async function getPublicKeyBase64(privateKeyBytes) {
	assertBytes(privateKeyBytes, 32, "private key")
	return bytesToBase64(secp256k1.getPublicKey(privateKeyBytes, false))
}

/**
 * Verify a Base64 DER signature against a digest and a Base64 public key.
 *
 * Used by the test-suite to prove signatures are real, and available to the
 * app for self-checks before transmission.
 *
 * @param {string} signatureBase64
 * @param {Uint8Array} digestBytes
 * @param {string} publicKeyBase64 Base64 raw uncompressed public key
 * @returns {Promise<boolean>}
 */
export async function verify(signatureBase64, digestBytes, publicKeyBase64) {
	assertBytes(digestBytes, 32, "invoice digest")
	try {
		return secp256k1.verify(
			base64ToBytes(signatureBase64),
			digestBytes,
			base64ToBytes(publicKeyBase64),
			{ prehash: false, lowS: true, format: "der" },
		)
	} catch {
		// A malformed key or signature is a failed verification, not a crash.
		return false
	}
}

/**
 * Generate a fresh CSID key pair from the platform CSPRNG.
 *
 * `keygen()` returns a **compressed** 33-byte public key, but ZATCA's CSID
 * request needs the raw 65-byte uncompressed point, so it is re-derived here
 * rather than passed through.
 *
 * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
 *          `publicKey` is the 65-byte uncompressed form (0x04 || X || Y).
 */
export async function generateKeyPair() {
	const { secretKey } = secp256k1.keygen()
	return {
		privateKey: secretKey,
		publicKey: secp256k1.getPublicKey(secretKey, false),
	}
}

/** Human-readable provider id, recorded in audit logs. */
export const name = "@noble/curves secp256k1"

export default {
	name,
	sign,
	verify,
	getPublicKeyBase64,
	generateKeyPair,
}

export { base64ToBytes, bytesToBase64, toHex }
