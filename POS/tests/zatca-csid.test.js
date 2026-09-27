/**
 * CSID / PKCS#10 tests.
 *
 * THE IMPORTANT PART
 * ------------------
 * The encoder under test is hand-written, so testing it with itself proves
 * nothing. These tests therefore re-parse the emitted CSR with an **independent
 * DER decoder written separately from `der.js`**, and then verify the CSR's own
 * self-signature against the public key embedded inside the request. If the
 * encoder and the decoder share a misunderstanding they would agree on a wrong
 * answer — so the decoder here is deliberately naive and strict (it walks tags
 * and lengths positionally and throws on anything it does not recognise),
 * while the known-good OID encodings are asserted as **literal byte constants
 * taken from the published ASN.1 definitions** rather than recomputed.
 *
 * The self-signature check is the strong one: it proves the request is signed by
 * the key it advertises, over exactly the bytes it advertises. That is the
 * correctness property a certificate authority relies on.
 *
 * NOT VALIDATED HERE: that ZATCA accepts the request. No authority round-trip
 * has been run. This suite proves internal consistency, not compliance.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
	base64ToBytes,
	bytesToBase64,
	hexToBytes,
} from "@/utils/zatca/base64.js"
import {
	buildCertificationRequestInfo,
	buildCsidCsr,
	buildSubjectPublicKeyInfo,
	CSR_VERSION,
	generateCsidKeyPair,
	OID_ECDSA_WITH_SHA256,
	OID_EC_PUBLIC_KEY,
	OID_SECP256K1,
	secp256k1AlgorithmIdentifier,
	toPem,
} from "@/utils/zatca/csid.js"
import {
	integer,
	oid,
	bitString,
	sequence,
	printableString,
	utf8String,
	encodeLength,
} from "@/utils/zatca/der.js"
import {
	isSigningAvailable,
	registerSecp256k1Provider,
	resetProvider,
} from "@/utils/zatca/signature.js"
import * as nobleProvider from "@/utils/zatca/secp256k1Provider.js"

const SUBJECT = {
	commonName: "Test Establishment",
	organizationName: "Test Trading Company",
	countryName: "SA",
	serialNumber: "1234567890",
}

/* ------------------------------------------------------------------ *
 * Independent DER decoder (written separately from src/der.js)
 * ------------------------------------------------------------------ */

/**
 * Positional, strict TLV reader. Returns { tag, content, total }.
 * Throws on anything unexpected — a strict decoder that rejects unknown shapes
 * is more useful here than a lenient one.
 */
function readTlv(bytes, offset) {
	const tag = bytes[offset]
	if (tag === undefined) throw new Error(`tag byte missing at ${offset}`)
	// Long-form length.
	let length
	let headerLength
	if (bytes[offset + 1] & 0x80) {
		const count = bytes[offset + 1] & 0x7f
		length = 0
		for (let i = 0; i < count; i += 1)
			length = length * 256 + bytes[offset + 2 + i]
		headerLength = 2 + count
	} else {
		length = bytes[offset + 1]
		headerLength = 2
	}
	const start = offset + headerLength
	const content = Array.from(bytes.slice(start, start + length))
	if (content.length !== length) {
		throw new Error(`truncated TLV 0x${tag.toString(16)} at ${offset}`)
	}
	return { tag, content, start, headerLength, total: headerLength + length }
}

/** Split a constructed element's content into its children. */
function children(content) {
	const out = []
	let offset = 0
	while (offset < content.length) {
		const node = readTlv(content, offset)
		out.push(node)
		offset += node.total
	}
	return out
}

/** Decode a BIT STRING, asserting the unused-bit pad byte is present. */
function readBitString(node) {
	if (node.content[0] !== 0x00) {
		throw new Error(`BIT STRING missing zero pad byte (got ${node.content[0]})`)
	}
	return Uint8Array.from(node.content.slice(1))
}

function textOf(node) {
	return new TextDecoder().decode(Uint8Array.from(node.content))
}

/**
 * Extract the *complete* TLV of a child node — header included — as a
 * Uint8Array. The signed bytes are this, not `node.content`: a
 * CertificationRequestInfo is signed with its tag and length as well as its
 * fields, so hashing the bare content would verify against the wrong message.
 */
function nodeBytes(derBytes, root, index) {
	const node = children(root.content)[index]
	return Uint8Array.from(
		derBytes.slice(root.headerLength, root.headerLength + node.total),
	)
}

beforeAll(() => {
	registerSecp256k1Provider(nobleProvider)
})

afterEach(() => {
	// Provider stays registered except where a test removes it explicitly.
})

describe("DER encoding", () => {
	it("encodes lengths in minimal short or long form", () => {
		expect(encodeLength(0)).toEqual([0x00])
		expect(encodeLength(127)).toEqual([0x7f])
		expect(encodeLength(128)).toEqual([0x81, 0x80])
		expect(encodeLength(255)).toEqual([0x81, 0xff])
		expect(encodeLength(256)).toEqual([0x82, 0x01, 0x00])
		expect(encodeLength(65535)).toEqual([0x82, 0xff, 0xff])
		expect(encodeLength(65536)).toEqual([0x83, 0x01, 0x00, 0x00])
	})

	it("encodes the published OID byte sequences exactly", () => {
		// Literal encodings from the ASN.1 definitions, NOT recomputed by the
		// encoder under test.
		expect(oid(OID_EC_PUBLIC_KEY)).toEqual([
			0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
		])
		expect(oid(OID_SECP256K1)).toEqual([
			0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
		])
		expect(oid(OID_ECDSA_WITH_SHA256)).toEqual([
			0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02,
		])
		// A multi-byte arc, to catch base-128 continuation-bit errors.
		expect(oid("1.2.840.113549")).toEqual([
			0x06, 0x06, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d,
		])
	})

	it("rejects malformed OIDs instead of emitting something plausible", () => {
		expect(() => oid("1")).toThrow(/at least two arcs/)
		expect(() => oid("3.1.2")).toThrow(/must be 0-2/)
		expect(() => oid("1.40.1")).toThrow(/<= 39/)
		expect(() => oid("1.2.x")).toThrow(/Invalid OID arc/)
	})

	it("pads INTEGER only when the sign bit requires it", () => {
		// 0x7f needs no pad; 0x80 does.
		expect(integer(127)).toEqual([0x02, 0x01, 0x7f])
		expect(integer(128)).toEqual([0x02, 0x02, 0x00, 0x80])
		expect(integer(0)).toEqual([0x02, 0x01, 0x00])
		// Redundant leading zeros must be stripped (DER minimality).
		expect(integer(5)).toEqual([0x02, 0x01, 0x05])
	})

	it("refuses partial-octet BIT STRINGs", () => {
		expect(bitString([0x01, 0x02])).toEqual([0x03, 0x03, 0x00, 0x01, 0x02])
		expect(() => bitString([0xff], 4)).toThrow(/whole-octet/)
	})

	it("rejects non-printable characters in PrintableString", () => {
		expect(printableString("SA")).toEqual([0x13, 0x02, 0x53, 0x41])
		expect(() => printableString("المملكة")).toThrow(
			/PrintableString cannot encode/,
		)
		expect(utf8String("SA")).toEqual([0x0c, 0x02, 0x53, 0x41])
	})

	it("emits a secp256k1 AlgorithmIdentifier with no parameters", () => {
		const bytes = Uint8Array.from(secp256k1AlgorithmIdentifier())
		const root = readTlv(Array.from(bytes), 0)
		expect(root.tag).toBe(0x30) // SEQUENCE
		// Exactly two children, both OIDs: no trailing parameters, which RFC 5480
		// requires for this curve.
		const algs = children(root.content)
		expect(algs.length).toBe(2)
		expect(algs[0].tag).toBe(0x06)
		expect(algs[1].tag).toBe(0x06)
		expect(bytes).toEqual(
			Uint8Array.from([
				// SEQUENCE, length 0x10 = 16 = 9 (ecPublicKey OID) + 7 (secp256k1 OID)
				0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
				0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
			]),
		)
	})
})

describe("CSID key generation", () => {
	it("generates a 32-byte private key and a 65-byte uncompressed public key", async () => {
		const pair = await generateCsidKeyPair()
		expect(pair.privateKey).toBeInstanceOf(Uint8Array)
		expect(pair.privateKey.length).toBe(32)
		expect(pair.publicKey.length).toBe(65)
		expect(pair.publicKey[0]).toBe(0x04)
		expect(base64ToBytes(pair.publicKeyBase64).length).toBe(65)
	})

	it("generates a distinct key pair each time", async () => {
		const a = await generateCsidKeyPair()
		const b = await generateCsidKeyPair()
		expect(bytesToBase64(a.privateKey)).not.toBe(bytesToBase64(b.privateKey))
	})

	it("refuses to derive a public key with no provider registered", async () => {
		resetProvider()
		expect(isSigningAvailable()).toBe(false)
		await expect(generateCsidKeyPair()).rejects.toThrow(/no secp256k1 provider/)
		registerSecp256k1Provider(nobleProvider)
	})
})

describe("PKCS#10 CSR", () => {
	it("builds a structurally valid CertificationRequest", async () => {
		const { privateKey } = await generateCsidKeyPair()
		const { der, pem, publicKeyBase64 } = await buildCsidCsr({
			subject: SUBJECT,
			privateKeyBytes: privateKey,
		})

		const root = readTlv(Array.from(der), 0)
		expect(root.tag).toBe(0x30) // SEQUENCE
		const parts = children(root.content)
		// certificationRequestInfo, signatureAlgorithm, signature
		expect(parts.length).toBe(3)

		// signatureAlgorithm == ecdsa-with-SHA256, OID only, no parameters.
		expect(parts[1].tag).toBe(0x30)
		const algOid = children(parts[1].content)
		expect(algOid.length).toBe(1)
		expect(algOid[0].content).toEqual([
			0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02,
		])

		// The embedded public key must be exactly the one we generated.
		const spki = children(children(parts[0].content)[2].content)
		const embeddedPoint = readBitString(spki[1])
		expect(bytesToBase64(embeddedPoint)).toBe(publicKeyBase64)
		expect(embeddedPoint.length).toBe(65)
		expect(embeddedPoint[0]).toBe(0x04)

		// PEM envelope is well formed and round-trips to the same DER.
		expect(pem.startsWith("-----BEGIN CERTIFICATE REQUEST-----\n")).toBe(true)
		expect(pem.trimEnd().endsWith("-----END CERTIFICATE REQUEST-----")).toBe(
			true,
		)
		const pemBody = pem.split("\n").slice(1, -2).join("")
		expect(new Uint8Array(base64ToBytes(pemBody))).toEqual(der)
	})

	it("encodes the version, subject and empty attributes set correctly", async () => {
		const { privateKey } = await generateCsidKeyPair()
		const { der } = await buildCsidCsr({
			subject: SUBJECT,
			privateKeyBytes: privateKey,
		})

		const info = children(readTlv(Array.from(der), 0).content)[0]
		const fields = children(info.content)
		expect(fields.length).toBe(4)

		// version
		expect(fields[0].tag).toBe(0x02)
		expect(fields[0].content).toEqual([CSR_VERSION])

		// subject: four RDNs, each a SET holding one SEQUENCE
		expect(fields[1].tag).toBe(0x30)
		const rdns = children(fields[1].content)
		expect(rdns.length).toBe(4)
		const values = rdns.map((rdnNode) => {
			const attr = children(rdnNode.content)[0]
			const [type, value] = children(attr.content)
			return { oidBytes: type.content, value: textOf(value), tag: value.tag }
		})
		// commonName, countryName, organizationName, serialNumber
		expect(values[0].value).toBe(SUBJECT.commonName)
		expect(values[0].oidBytes).toEqual([0x55, 0x04, 0x03])
		expect(values[1].value).toBe("SA")
		// countryName uses PrintableString (0x13), the rest UTF8String (0x0c).
		expect(values[1].tag).toBe(0x13)
		expect(values[2].value).toBe(SUBJECT.organizationName)
		expect(values[2].tag).toBe(0x0c)
		expect(values[3].value).toBe(SUBJECT.serialNumber)

		// attributes [0] must be present and empty, not omitted.
		expect(fields[3].tag).toBe(0xa0)
		expect(fields[3].content).toEqual([])
	})

	it("self-signature verifies against the key embedded in the request", async () => {
		const { privateKey, publicKeyBase64 } = await generateCsidKeyPair()
		const { der, signedInfoHex } = await buildCsidCsr({
			subject: SUBJECT,
			privateKeyBytes: privateKey,
		})

		const root = readTlv(Array.from(der), 0)
		const parts = children(root.content)

		// Signed bytes = the complete CertificationRequestInfo TLV, header included.
		const infoBytes = nodeBytes(der, root, 0)
		const signature = readBitString(parts[2])

		// The signature must be a DER SEQUENCE of two INTEGERs (r, s) — the
		// shape the authority parses.
		const sigParts = children(Array.from(signature))
		expect(sigParts.length).toBe(1)
		const rs = children(sigParts[0].content)
		expect(rs.length).toBe(2)
		expect(rs[0].tag).toBe(0x02)
		expect(rs[1].tag).toBe(0x02)
		// High-S values are rejected by ZATCA, so require low-S.
		expect(signature.length).toBeLessThanOrEqual(72)

		// Verify the self-signature with the provider against the embedded key.
		const digest = await crypto.subtle.digest("SHA-256", infoBytes)
		const ok = await nobleProvider.verify(
			bytesToBase64(signature),
			new Uint8Array(digest),
			publicKeyBase64,
		)
		expect(ok).toBe(true)

		// The exported signed bytes must be exactly what was signed.
		expect(signedInfoHex).toBe(
			Array.from(infoBytes, (b) => b.toString(16).padStart(2, "0")).join(""),
		)
	})

	it("rejects a tampered request rather than emitting it", async () => {
		const { privateKey } = await generateCsidKeyPair()
		const { der, publicKeyBase64 } = await buildCsidCsr({
			subject: SUBJECT,
			privateKeyBytes: privateKey,
		})
		// Flip a byte inside the embedded public key.
		const tampered = Uint8Array.from(der)
		tampered[tampered.length - 20] ^= 0xff

		const root = readTlv(Array.from(tampered), 0)
		const parts = children(root.content)
		const infoBytes = nodeBytes(tampered, root, 0)
		const digest = await crypto.subtle.digest("SHA-256", infoBytes)
		const ok = await nobleProvider.verify(
			bytesToBase64(readBitString(parts[2])),
			new Uint8Array(digest),
			publicKeyBase64,
		)
		expect(ok).toBe(false)
	})

	it("requires a provider", async () => {
		const { privateKey } = await generateCsidKeyPair()
		resetProvider()
		await expect(
			buildCsidCsr({ subject: SUBJECT, privateKeyBytes: privateKey }),
		).rejects.toThrow(/no secp256k1 provider/)
		registerSecp256k1Provider(nobleProvider)
	})

	it("validates the subject before encoding anything", async () => {
		const { privateKey } = await generateCsidKeyPair()
		await expect(
			buildCsidCsr({ subject: {}, privateKeyBytes: privateKey }),
		).rejects.toThrow(/commonName is required/)
		await expect(
			buildCsidCsr({
				subject: { commonName: "x" },
				privateKeyBytes: privateKey,
			}),
		).rejects.toThrow(/organizationName is required/)
		await expect(
			buildCsidCsr({
				subject: { ...SUBJECT, countryName: "saudi" },
				privateKeyBytes: privateKey,
			}),
		).rejects.toThrow(/2-letter uppercase/)
	})

	it("rejects a compressed or SPKI-wrapped public key", () => {
		// 33-byte compressed point.
		expect(() =>
			buildSubjectPublicKeyInfo(bytesToBase64(new Uint8Array(33))),
		).toThrow(/65-byte raw uncompressed/)
		// SPKI DER wrapper for the same key: right length, wrong prefix byte.
		const spki = new Uint8Array(65)
		spki[0] = 0x30
		expect(() => buildSubjectPublicKeyInfo(bytesToBase64(spki))).toThrow(
			/65-byte raw uncompressed/,
		)
	})

	it("rejects a malformed private key", async () => {
		await expect(
			buildCsidCsr({ subject: SUBJECT, privateKeyBytes: new Uint8Array(16) }),
		).rejects.toThrow(/32-byte Uint8Array/)
	})

	it("accepts an optional countryName/serialNumber omission", async () => {
		const { privateKey } = await generateCsidKeyPair()
		const { der } = await buildCsidCsr({
			subject: { commonName: "X", organizationName: "Y" },
			privateKeyBytes: privateKey,
		})
		const info = children(readTlv(Array.from(der), 0).content)[0]
		const rdns = children(children(info.content)[1].content)
		expect(rdns.length).toBe(2) // commonName + organizationName
	})

	it("hex round-trips", () => {
		const bytes = new Uint8Array([0x00, 0x0f, 0xff, 0x10])
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
			"",
		)
		expect(Array.from(hexToBytes(hex))).toEqual(Array.from(bytes))
		expect(() => hexToBytes("abc")).toThrow(/even-length/)
		expect(() => hexToBytes("zz")).toThrow(/even-length hex/)
	})

	it("wraps DER in PEM with 64-char lines", () => {
		const der = new Uint8Array(100).fill(0x41)
		const pem = toPem(der)
		const lines = pem.trimEnd().split("\n")
		expect(lines[0]).toBe("-----BEGIN CERTIFICATE REQUEST-----")
		expect(lines[1].length).toBe(64)
		expect(lines[2].length).toBeLessThanOrEqual(64)
		expect(lines.at(-1)).toBe("-----END CERTIFICATE REQUEST-----")
	})

	it("buildCertificationRequestInfo is deterministic for the same key", async () => {
		const { privateKey, publicKeyBase64 } = await generateCsidKeyPair()
		const a = buildCertificationRequestInfo({
			subject: SUBJECT,
			publicKeyBase64,
		})
		const b = buildCertificationRequestInfo({
			subject: SUBJECT,
			publicKeyBase64,
		})
		expect(a).toEqual(b)
		expect(Array.from(a)).toHaveLength(a.length)
	})
})
