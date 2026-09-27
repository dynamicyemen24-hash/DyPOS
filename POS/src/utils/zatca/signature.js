/**
 * ZATCA Phase 2 — invoice signature (ECDSA over secp256k1).
 *
 * WHY THIS MODULE REFUSES BY DEFAULT
 * ---------------------------------
 * ZATCA signs the invoice XML with **ECDSA on the secp256k1 curve**, and the
 * cryptographic stamp uses ECIES on the same curve. The Web Crypto API offers
 * ECDSA only on P-256/P-384/P-521 — **secp256k1 is not available**.
 *
 * That means a correct signature is impossible without a vetted secp256k1
 * implementation (e.g. a WebAssembly build, or a native/local-only crypto
 * module). Substituting P-256 would produce a signature that *looks* valid and
 * is silently rejected by the tax authority — the exact failure the legacy
 * implementation shipped, where a decorative "signature" stood in for the real
 * thing.
 *
 * So this module does the only safe thing: it throws until a real provider is
 * registered. An unsigned invoice is a visible, recoverable defect. A forged
 * one is a legal and reputational liability.
 *
 * Registering a real provider makes signing available; the interface is
 * intentionally tiny so a WASM or native implementation can satisfy it.
 */

let provider = null

/**
 * @typedef {object} Secp256k1Provider
 * @property {(digest: Uint8Array, privateKey: Uint8Array) => Promise<string>} sign
 *           Sign a 32-byte SHA-256 digest, return Base64 **DER** signature.
 * @property {(privateKey?: Uint8Array) => Promise<string>} getPublicKeyBase64
 *           Return the Base64 **raw uncompressed** public key (65 bytes,
 *           `0x04 || X || Y`) for the CSID — *not* an SPKI/DER wrapper, which
 *           the authority rejects.
 * @property {(digest: Uint8Array) => Promise<string>} [stamp]
 *           Base64 ECIES cryptographic stamp. Optional: a provider that cannot
 *           produce a spec-conformant stamp should omit it so
 *           {@link createCryptographicStamp} refuses instead of fabricating one.
 * @property {() => Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>} [generateKeyPair]
 *           Generate a secp256k1 key pair. Optional, but required before a
 *           CSID can be requested. Key generation belongs to the curve
 *           implementation, so it is routed through the same boundary rather
 *           than hard-wired in a caller.
 * @property {string} [name] Human-readable provider id, for audit logs.
 */

/**
 * Register a real secp256k1 implementation.
 *
 * @param {Secp256k1Provider} impl
 */
export function registerSecp256k1Provider(impl) {
	if (
		!impl ||
		typeof impl.sign !== "function" ||
		typeof impl.getPublicKeyBase64 !== "function"
	) {
		throw new TypeError(
			"secp256k1 provider must expose sign(digest, privateKey) and getPublicKeyBase64()",
		)
	}
	provider = { name: impl.name || "unnamed", ...impl }
}

/** Remove the registered provider (tests, teardown, device reset). */
export function resetProvider() {
	provider = null
}

/** Whether a real signing provider is available on this device. */
export function isSigningAvailable() {
	return provider !== null
}

/**
 * Sign the SHA-256 digest of an invoice's canonical XML.
 *
 * @param {Uint8Array} digestBytes 32-byte SHA-256 of the XML
 * @param {Uint8Array} privateKeyBytes CSID private key
 * @returns {Promise<string>} Base64 DER ECDSA signature
 */
export async function signDigest(digestBytes, privateKeyBytes) {
	if (!provider) {
		throw new Error(
			"[ZATCA] Cannot sign: no secp256k1 provider is registered. " +
				"ZATCA requires ECDSA on secp256k1, which the Web Crypto API does not " +
				"support. A P-256 substitute is NOT compliant and must never be used. " +
				"Register a vetted secp256k1 implementation via registerSecp256k1Provider().\n" +
				"[ZATCA] لا يمكن التوقيع: لم يتم تسجيل مزود secp256k1. التوقيع بمفتاح P-256 غير مطابق لمتطلبات هيئة الزكاة.",
		)
	}
	if (!(digestBytes instanceof Uint8Array) || digestBytes.length !== 32) {
		throw new TypeError("signDigest requires a 32-byte SHA-256 digest")
	}
	return provider.sign(digestBytes, privateKeyBytes)
}

/**
 * Generate a CSID key pair using the registered provider.
 *
 * Routed through the provider on purpose: the curve implementation owns key
 * generation, so a caller must never reach past the boundary for a second,
 * possibly different, implementation.
 *
 * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
 *          `publicKey` is the 65-byte uncompressed point (0x04 || X || Y).
 */
export async function generateKeyPair() {
	if (!provider) {
		throw new Error(
			"[ZATCA] Cannot generate a CSID key pair: no secp256k1 provider is registered.\n" +
				"[ZATCA] لا يمكن إنشاء مفتاح: لم يتم تسجيل مزود secp256k1.",
		)
	}
	if (typeof provider.generateKeyPair !== "function") {
		throw new Error(
			"[ZATCA] Registered provider does not implement generateKeyPair(); " +
				"a CSID cannot be requested without key generation",
		)
	}
	return provider.generateKeyPair()
}

/**
 * Derive the Base64 raw uncompressed public key (65 bytes) for a CSID, using the
 * registered provider. This is the value a certificate request must carry — not
 * an SPKI/DER wrapper.
 *
 * @param {Uint8Array} privateKeyBytes
 * @returns {Promise<string>}
 */
export async function getPublicKeyBase64(privateKeyBytes) {
	if (!provider) {
		throw new Error(
			"[ZATCA] Cannot derive a public key: no secp256k1 provider is registered.",
		)
	}
	return provider.getPublicKeyBase64(privateKeyBytes)
}

/**
 * Produce the ZATCA cryptographic stamp payload (ECIES) for an invoice.
 * Same curve requirement; equally refuses to fabricate.
 *
 * @returns {Promise<string>} Base64 stamp
 */ export async function createCryptographicStamp(invoiceDigestBytes) {
	if (!provider) {
		throw new Error(
			"[ZATCA] Cannot build the cryptographic stamp: no secp256k1 provider is registered.\n" +
				"[ZATCA] لا يمكن إنشاء الختم التشفيري: لم يتم تسجيل مزود secp256k1.",
		)
	}
	if (typeof provider.stamp !== "function") {
		throw new Error(
			"[ZATCA] Registered provider does not implement stamp() (ECIES)",
		)
	}
	return provider.stamp(invoiceDigestBytes)
}

export default {
	registerSecp256k1Provider,
	resetProvider,
	isSigningAvailable,
	signDigest,
	generateKeyPair,
	getPublicKeyBase64,
	createCryptographicStamp,
}
