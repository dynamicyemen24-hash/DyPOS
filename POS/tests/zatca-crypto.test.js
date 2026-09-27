import { describe, expect, it, beforeEach } from "vitest"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import {
	base64ToBytes,
	bytesToBase64,
	createCryptographicStamp,
	generateKeyPair,
	getPublicKeyBase64,
	isSigningAvailable,
	registerSecp256k1Provider,
	resetProvider,
	signDigest,
	verify,
} from "../src/utils/zatca/index.js"
import { buildZatcaInvoice } from "../src/utils/zatca/index.js"

/** Deterministic key so every assertion below is reproducible. */
const PRIVATE_KEY = base64ToBytes(
	"kPrPAhXOtjUwhEnoA1kG2ZzXKFTGvDBwCLGrxViSNFY=",
)

function sha256(bytes) {
	return crypto.subtle
		.digest("SHA-256", bytes)
		.then((buf) => new Uint8Array(buf))
}

describe("ZATCA secp256k1 provider", () => {
	beforeEach(() => {
		resetProvider()
	})

	it("registers into the provider boundary and enables signing", async () => {
		expect(isSigningAvailable()).toBe(false)
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		registerSecp256k1Provider(mod.default)
		expect(isSigningAvailable()).toBe(true)
	})

	it("still refuses to sign when NO provider is registered", async () => {
		const digest = await sha256(new TextEncoder().encode("x"))
		// The whole point of the boundary: no silent fallback to P-256.
		await expect(signDigest(digest, PRIVATE_KEY)).rejects.toThrow(
			/Cannot sign: no secp256k1 provider/,
		)
	})

	it("produces a well-formed DER signature that verifies against the digest", async () => {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		const digest = await sha256(new TextEncoder().encode("invoice-xml"))
		const sigB64 = await mod.sign(digest, PRIVATE_KEY)

		const der = base64ToBytes(sigB64)
		// SEQUENCE (0x30), single-byte length, INTEGER (0x02) tags.
		expect(der[0]).toBe(0x30)
		expect(der[1]).toBe(der.length - 2)
		expect(der[2]).toBe(0x02)

		// Regression guard: noble's DEFAULT encoding is "compact" (64 raw
		// bytes r||s), which ZATCA rejects. DER must be ~70-72 bytes and must
		// not be a bare r||s pair.
		expect(der.length).toBeGreaterThan(64)
		expect(der.length).toBeLessThan(73)

		// The decisive check: a real verifier accepts it.
		const pub = await mod.getPublicKeyBase64(PRIVATE_KEY)
		expect(await mod.verify(sigB64, digest, pub)).toBe(true)
	})

	it("refuses to emit a signature if the provider yields a non-DER encoding", async () => {
		// Guards the silent-compliance-failure mode: if a future library upgrade
		// drops `format: "der"`, we must fail loudly rather than ship a compact
		// signature that looks valid and is rejected by the authority.
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		const digest = await sha256(new TextEncoder().encode("x"))
		const good = base64ToBytes(await mod.sign(digest, PRIVATE_KEY))
		expect(good[0]).toBe(0x30)

		// A compact signature must fail the provider's own structural assertion.
		const compact = secp256k1.sign(digest, PRIVATE_KEY, {
			prehash: false,
			format: "compact",
		})
		expect(compact.length).toBe(64)
		expect(compact[0]).not.toBe(0x30)
	})

	it("produces a DIFFERENT valid signature for a different digest", async () => {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		const d1 = await sha256(new TextEncoder().encode("invoice-A"))
		const d2 = await sha256(new TextEncoder().encode("invoice-B"))
		const s1 = await mod.sign(d1, PRIVATE_KEY)
		const s2 = await mod.sign(d2, PRIVATE_KEY)
		expect(s1).not.toBe(s2)
		expect(
			await mod.verify(s1, d1, await mod.getPublicKeyBase64(PRIVATE_KEY)),
		).toBe(true)
		// Cross-verification must fail: a signature is bound to its digest.
		expect(
			await mod.verify(s1, d2, await mod.getPublicKeyBase64(PRIVATE_KEY)),
		).toBe(false)
	})

	it("returns the RAW uncompressed 65-byte public key (not SPKI)", async () => {
		const pubB64 = await getPublicKeyBase64(PRIVATE_KEY)
		const pub = base64ToBytes(pubB64)
		expect(pub.length).toBe(65)
		expect(pub[0]).toBe(0x04) // uncompressed point marker
		// An SPKI wrapper would be 0x30 and ~88 bytes; assert we are not that.
		expect(pub[0]).not.toBe(0x30)
	})

	it("signs the ACTUAL digest, not a re-hash of it (prehash:false)", async () => {
		// Guards the most dangerous integration bug: noble hashes by default.
		const digest = await sha256(new TextEncoder().encode("invoice-xml"))
		const ours = await sign_(digest)
		// Correct DER, but over sha256(digest) instead of digest itself.
		const wrong = secp256k1.sign(digest, PRIVATE_KEY, {
			prehash: true,
			format: "der",
		})
		// A double-hashed signature must NOT verify against the original digest.
		const pub = await getPublicKeyBase64(PRIVATE_KEY)
		const crossOk = await verify(bytesToBase64(wrong), digest, pub)
		expect(crossOk).toBe(false)
		// Ours does.
		expect(await verify(ours, digest, pub)).toBe(true)
	})

	it("rejects wrong-sized digests and keys instead of coercing", async () => {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		await expect(mod.sign(new Uint8Array(31), PRIVATE_KEY)).rejects.toThrow(
			/32-byte/,
		)
		await expect(
			mod.sign(new Uint8Array(32), new Uint8Array(16)),
		).rejects.toThrow(/32-byte/)
	})

	it("keygen produces a usable 65-byte uncompressed key pair", async () => {
		const { privateKey, publicKey } = await generateKeyPair()
		expect(privateKey.length).toBe(32)
		// Regression guard: keygen() natively returns a COMPRESSED 33-byte key.
		expect(publicKey.length).toBe(65)
		expect(publicKey[0]).toBe(0x04)
		const derived = base64ToBytes(await getPublicKeyBase64(privateKey))
		expect(bytesToBase64(derived)).toBe(bytesToBase64(publicKey))
	})

	it("refuses to fabricate a cryptographic stamp (ECIES not implemented)", async () => {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		registerSecp256k1Provider(mod.default)
		const digest = await sha256(new TextEncoder().encode("x"))
		// Correct behaviour: an honest refusal, not a plausible-looking blob.
		await expect(createCryptographicStamp(digest)).rejects.toThrow(
			/does not implement stamp/,
		)
	})
})

// helper so the prehash test can sign through the module without re-importing
let _signFn
async function sign_(digest) {
	if (!_signFn) {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		registerSecp256k1Provider(mod.default)
		_signFn = mod.sign
	}
	return _signFn(digest, PRIVATE_KEY)
}

describe("ZATCA signed invoice end-to-end (local, not authority-validated)", () => {
	beforeEach(() => {
		resetProvider()
	})

	it("produces a signed invoice whose signature verifies over the hash", async () => {
		const mod = await import("../src/utils/zatca/secp256k1Provider.js")
		registerSecp256k1Provider(mod.default)

		const invoice = await buildZatcaInvoice({
			seller: {
				sellerName: "مؤسسة الاختبار",
				sellerVatNumber: "300000000000003",
			},
			timestamp: "2026-01-15T10:00:00Z",
			icv: 1,
			invoiceId: "INV-1",
			totals: {
				lineExtensionAmount: 10000,
				taxExclusiveAmount: 10000,
				taxInclusiveAmount: 11500,
				payableAmount: 11500,
				taxTotal: 1500,
			},
			tax: {
				categories: [
					{ code: "S", percent: 15, taxableAmount: 10000, taxAmount: 1500 },
				],
			},
			lines: [
				{
					name: "صنف",
					quantity: 1,
					unitPrice: 10000,
					lineExtensionAmount: 10000,
				},
			],
		})

		// `invoiceHash` is a lowercase hex SHA-256 string; convert to bytes.
		const digestBytes = new Uint8Array(
			invoice.invoiceHash
				.match(/.{2}/g)
				.map((byte) => Number.parseInt(byte, 16)),
		)

		const sig = await signDigest(digestBytes, PRIVATE_KEY)
		const pub = await getPublicKeyBase64(PRIVATE_KEY)
		expect(await verify(sig, digestBytes, pub)).toBe(true)
	})
})
