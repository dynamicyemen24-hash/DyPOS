/**
 * ZATCA CSID — key generation and PKCS#10 certificate signing request.
 *
 * WHAT THIS IS FOR
 * ----------------
 * ZATCA Phase 2 has no meaning without a CSID: every invoice signature and every
 * cryptographic stamp is made with the CSID's secp256k1 private key. The key
 * lives on the taxpayer's machine, a one-time CSR trades it for a certificate,
 * and the certificate is what the tax authority validates against.
 *
 * So this module is the first link in the chain, and it is deliberately the one
 * link that can be built *correctly without guessing*: PKCS#10 is a published
 * standard (RFC 2986), so a request built here is either a valid
 * CertificationRequest or an obvious error. That is a different epistemic
 * position from the ECIES cryptographic stamp, whose byte layout is
 * ZATCA-specific and must stay refused until it is checked against official
 * vectors — see `signature.js#createCryptographicStamp`.
 *
 * THE SIGNATURE REUSES THE PROVIDER, NOT THE CURVE
 * -----------------------------------------------
 * An ECDSA signature inside a PKCS#10 request is a DER `ECDSA-Sig-Value`
 * (`SEQUENCE { r INTEGER, s INTEGER }`) wrapped in a BIT STRING with a single
 * `0x00` unused-bit pad byte. That inner value is *already* exactly what a
 * conforming provider returns from `sign()`, so this module never imports
 * `@noble/curves` and never needs r or s separately. Any registered provider
 * satisfying the `signature.js` interface can therefore build a CSR — the curve
 * maths stays behind that boundary.
 *
 * NOT OFFICIALLY VALIDATED
 * -----------------------
 * The structure follows the RFCs, and the tests re-parse the emitted request
 * with an independent decoder and verify the self-signature against the public
 * key embedded in the request itself. But no ZATCA CSR endpoint has accepted
 * one yet, and the ASN.1 container is hand-encoded because no ASN.1 library is
 * available offline. Treat this as a carefully-built, self-consistent
 * implementation pending an authority round-trip — not a validated one.
 *
 * WHAT IS STILL MISSING (deliberate, and it is the blocker)
 * -------------------------------------------------------
 * `saveCsidSecret` does not exist. Persisting a CSID private key means deciding
 * how it is protected at rest, and that decision has user-visible consequences
 * (a PIN or password change can orphan a key, and the app's existing token
 * storage is plaintext, which is a pattern that must not be copied for a
 * signing key). Until that design is settled, keys are returned to the caller
 * and never written anywhere.
 */

import {
	base64ToBytes,
	bytesToBase64,
	bytesToHex,
	toPemBody,
} from "./base64.js"
import {
	bitString,
	contextConstructed,
	integer,
	oid,
	printableString,
	sequence,
	set,
	utf8String,
} from "./der.js"
import {
	generateKeyPair,
	getPublicKeyBase64,
	isSigningAvailable,
	signDigest,
} from "./signature.js"

/** id-ecPublicKey (RFC 5480) — the algorithm for an EC SubjectPublicKeyInfo. */
export const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1"
/** secp256k1 — the curve OID. This is what makes the request *not* P-256. */
export const OID_SECP256K1 = "1.3.132.0.10"
/** ecdsa-with-SHA256 (RFC 5758) — the CSR signature algorithm. */
export const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2"

/** PKCS#10 v1 — the only version that exists. */
export const CSR_VERSION = 0

/**
 * Subject attribute OIDs (RFC 5280 §4.1.2.4).
 * Order matters: the DN is encoded in the order given.
 */
const SUBJECT_OIDS = Object.freeze({
	commonName: "2.5.4.3",
	organizationName: "2.5.4.10",
	countryName: "2.5.4.6",
	serialNumber: "2.5.4.5",
})

/**
 * `AlgorithmIdentifier` for a secp256k1 SubjectPublicKeyInfo.
 *
 * `SEQUENCE { OID id-ecPublicKey, OID secp256k1 }` — absent parameters, which
 * is what RFC 5480 mandates for this curve.
 */
export function secp256k1AlgorithmIdentifier() {
	return sequence(oid(OID_EC_PUBLIC_KEY), oid(OID_SECP256K1))
}

/** `AlgorithmIdentifier` for ecdsa-with-SHA256: the OID alone, no parameters. */
export function ecdsaWithSha256AlgorithmIdentifier() {
	return sequence(oid(OID_ECDSA_WITH_SHA256))
}

/**
 * Encode one subject RDN.
 *
 * @param {string} attributeOid
 * @param {string} value
 * @param {"utf8"|"printable"} [encoding]
 */
function rdn(attributeOid, value, encoding = "utf8") {
	const encodedValue =
		encoding === "printable" ? printableString(value) : utf8String(value)
	return set(sequence(oid(attributeOid), encodedValue))
}

/**
 * Encode the subject Name (RDNSequence) in the caller's order.
 *
 * ZATCA's compliance CSID template expects at minimum commonName,
 * organizationName and countryName; serialNumber is optional and carries the
 * establishment identifier.
 *
 * @param {object} subject
 * @param {string} subject.commonName
 * @param {string} subject.organizationName
 * @param {string} [subject.countryName] 2-letter ISO 3166 code
 * @param {string} [subject.serialNumber]
 * @returns {number[]}
 */
export function buildSubjectName(subject) {
	if (!subject?.commonName)
		throw new TypeError("subject.commonName is required")
	if (!subject?.organizationName) {
		throw new TypeError("subject.organizationName is required")
	}

	const parts = [rdn(SUBJECT_OIDS.commonName, subject.commonName)]

	if (subject.countryName) {
		if (!/^[A-Z]{2}$/.test(subject.countryName)) {
			throw new TypeError(
				`subject.countryName must be a 2-letter uppercase code (got ${subject.countryName})`,
			)
		}
		// PrintableString is conventional for countryName and is what openssl
		// emits; UTF8String is also legal but produces a visibly different DN.
		parts.push(rdn(SUBJECT_OIDS.countryName, subject.countryName, "printable"))
	}
	parts.push(rdn(SUBJECT_OIDS.organizationName, subject.organizationName))
	if (subject.serialNumber) {
		parts.push(rdn(SUBJECT_OIDS.serialNumber, subject.serialNumber))
	}
	return sequence(...parts)
}

/**
 * Wrap a raw uncompressed public key in a SubjectPublicKeyInfo.
 *
 * @param {string} publicKeyBase64 65-byte raw point, `0x04 || X || Y`
 * @returns {number[]}
 */
export function buildSubjectPublicKeyInfo(publicKeyBase64) {
	const point = base64ToBytes(publicKeyBase64)
	if (point.length !== 65 || point[0] !== 0x04) {
		throw new TypeError(
			`CSID public key must be a 65-byte raw uncompressed point starting 0x04 (got ${point.length} bytes, prefix 0x${(point[0] ?? 0).toString(16)})`,
		)
	}
	return sequence(secp256k1AlgorithmIdentifier(), bitString(Array.from(point)))
}

/**
 * Build the `CertificationRequestInfo` body and return it as bytes.
 *
 * Exposed separately so callers (and tests) can hash or inspect the exact
 * bytes that the self-signature must cover.
 *
 * @param {object} args
 * @param {object} args.subject see {@link buildSubjectName}
 * @param {string} args.publicKeyBase64
 * @returns {number[]}
 */
export function buildCertificationRequestInfo({ subject, publicKeyBase64 }) {
	return sequence(
		integer(CSR_VERSION),
		buildSubjectName(subject),
		buildSubjectPublicKeyInfo(publicKeyBase64),
		// attributes [0] IMPLICIT SET OF Attribute — must be present, even empty.
		contextConstructed(0)([]),
	)
}

/**
 * Build a PKCS#10 CertificationRequest for a ZATCA CSID.
 *
 * Refuses when no secp256k1 provider is registered, for the same reason
 * `signature.js` does: producing a *request* that cannot be truthfully signed
 * would be a cosmetic artefact. Registration is a hard precondition, not a
 * fallback.
 *
 * @param {object} args
 * @param {object} args.subject {commonName, organizationName, countryName?, serialNumber?}
 * @param {Uint8Array} args.privateKeyBytes 32-byte CSID private key
 * @returns {Promise<{der: Uint8Array, pem: string, publicKeyBase64: string,
 *                    publicKeyHex: string, signedInfoHex: string}>}
 */
export async function buildCsidCsr({ subject, privateKeyBytes }) {
	if (!isSigningAvailable()) {
		throw new Error(
			"[ZATCA] Cannot build a CSID request: no secp256k1 provider is registered.\n" +
				"[ZATCA] لا يمكن إنشاء طلب الشهادة: لم يتم تسجيل مزود secp256k1.",
		)
	}
	if (
		!(privateKeyBytes instanceof Uint8Array) ||
		privateKeyBytes.length !== 32
	) {
		throw new TypeError("privateKeyBytes must be a 32-byte Uint8Array")
	}

	const publicKeyBase64 = await getPublicKeyBase64(privateKeyBytes)
	const infoBytes = buildCertificationRequestInfo({ subject, publicKeyBase64 })
	const info = Uint8Array.from(infoBytes)

	// The self-signature covers CertificationRequestInfo exactly, not the
	// finished request.
	const digest = await crypto.subtle.digest("SHA-256", info)
	const signatureBase64 = await signDigest(
		new Uint8Array(digest),
		privateKeyBytes,
	)
	const signatureDer = base64ToBytes(signatureBase64)

	// Sanity-check the provider's DER before embedding it: BIT STRING content
	// must be a DER SEQUENCE, or the request is invalid and should fail here
	// rather than at the authority.
	if (signatureDer[0] !== 0x30) {
		throw new Error(
			"[ZATCA] CSID signature is not DER-encoded; refusing to build a malformed CSR",
		)
	}

	const request = sequence(
		info,
		ecdsaWithSha256AlgorithmIdentifier(),
		bitString(Array.from(signatureDer)),
	)
	const der = Uint8Array.from(request)

	return {
		der,
		pem: toPem(der),
		publicKeyBase64,
		publicKeyHex: bytesToHex(base64ToBytes(publicKeyBase64)),
		signedInfoHex: bytesToHex(info),
	}
}

/** Wrap DER bytes in the PEM envelope a CSR endpoint expects. */
export function toPem(der, label = "CERTIFICATE REQUEST") {
	return `-----BEGIN ${label}-----\n${toPemBody(der)}\n-----END ${label}-----\n`
}

/**
 * Generate a CSID key pair, returning the Base64 forms a caller can hand to
 * {@link buildCsidCsr}.
 *
 * The key is returned, never stored — see the module header for why.
 *
 * @returns {Promise<{privateKeyBase64: string, publicKeyBase64: string,
 *                    privateKey: Uint8Array, publicKey: Uint8Array}>}
 */
export async function generateCsidKeyPair() {
	const { privateKey, publicKey } = await generateKeyPair()
	if (privateKey.length !== 32) {
		throw new Error(
			`CSID private key must be 32 bytes (got ${privateKey.length})`,
		)
	}
	if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
		throw new Error(
			`CSID public key must be a 65-byte uncompressed point (got ${publicKey.length} bytes)`,
		)
	}
	return {
		privateKey,
		publicKey,
		privateKeyBase64: bytesToBase64(privateKey),
		publicKeyBase64: bytesToBase64(publicKey),
	}
}

export default {
	generateCsidKeyPair,
	buildCsidCsr,
	buildCertificationRequestInfo,
}
