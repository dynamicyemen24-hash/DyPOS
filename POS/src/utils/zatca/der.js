/**
 * Minimal DER (ASN.1 Distinguished Encoding Rules) encoder.
 *
 * WHY THIS EXISTS
 * ---------------
 * A ZATCA CSID certificate request is a **PKCS#10 CertificationRequest** — a
 * published, standard X.509 structure (RFC 2986 / RFC 2985). `@noble/curves`
 * supplies the curve maths but no ASN.1, and Web Crypto's `exportKey` emits
 * SPKI/DER for *public* keys only; it cannot build a signed CSR. So the
 * container has to be encoded here.
 *
 * SCOPE, DELIBERATELY TIGHT
 * -------------------------
 * Only the handful of universal types a secp256k1 PKCS#10 request needs. This is
 * not a general ASN.1 library, and it must not grow into one: a general
 * implementation invites the "looks plausible, rejected by the authority" class
 * of defect this module exists to prevent. Anything not representable here is
 * a loud error, never a silent approximation.
 *
 * DER RULES ENFORCED (the ones that are actually easy to get wrong)
 * ---------------------------------------------------------------
 * - **Length**: short form below 128, otherwise long form with a minimal,
 *   big-endian byte count. A non-minimal length is invalid DER.
 * - **INTEGER**: two's-complement, *minimal* — leading `0x00` is added only when
 *   the top bit of the first content byte is set, and redundant leading zeros
 *   are stripped. The high-bit case is the classic off-by-one that turns a
 *   valid r/s into a CSR the authority rejects.
 * - **BIT STRING**: the first content byte is the *unused-bit count* and must be
 *   `0x00` for a whole number of octets. Omitting it is the second classic
 *   defect; an ECDSA signature in a BIT STRING without the pad byte is invalid.
 *
 * PURE AND TOTAL: no I/O, no globals, no platform assumptions.
 */

/** Universal ASN.1 tag bytes used here (high-tag-number form is not needed). */
export const TAG = Object.freeze({
	BOOLEAN: 0x01,
	INTEGER: 0x02,
	BIT_STRING: 0x03,
	OCTET_STRING: 0x04,
	NULL: 0x05,
	OID: 0x06,
	UTF8_STRING: 0x0c,
	PRINTABLE_STRING: 0x13,
	SEQUENCE: 0x30,
	SET: 0x31,
})

/**
 * Encode a DER length.
 *
 * Exported because length encoding is the single easiest thing to get subtly
 * wrong, and it deserves direct tests against hand-computed byte sequences.
 *
 * @param {number} length non-negative integer
 * @returns {number[]}
 */
export function encodeLength(length) {
	if (!Number.isInteger(length) || length < 0) {
		throw new RangeError(
			`DER length must be a non-negative integer (got ${length})`,
		)
	}
	if (length < 0x80) return [length]

	// Long form: 0x80 | byteCount, then the count big-endian, minimal.
	const bytes = []
	let remaining = length
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff)
		remaining = Math.floor(remaining / 256)
	}
	if (bytes.length > 4) {
		throw new RangeError(
			`DER length ${length} exceeds the supported 4-byte form`,
		)
	}
	return [0x80 | bytes.length, ...bytes]
}

/**
 * Wrap content in a tag-length-value triple.
 *
 * The content is asserted to be real bytes. This looks paranoid until you
 * notice that a `Uint8Array` is not an `Array` — `Array.isArray()` says false,
 * so a spread-and-append silently treats a typed array as a single opaque
 * element and emits a zero-filled structure that is structurally plausible and
 * completely wrong. Failing here is far cheaper than a rejected CSR.
 *
 * @param {number} tag single tag byte
 * @param {number[]} content already-encoded bytes
 * @returns {number[]}
 */
function tlv(tag, content) {
	for (const byte of content) {
		if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
			throw new TypeError(
				`DER content must be bytes 0-255 (got ${typeof byte}: ${String(byte).slice(0, 40)})`,
			)
		}
	}
	return [tag, ...encodeLength(content.length), ...content]
}

/**
 * Flatten arbitrarily nested byte containers into one flat list.
 *
 * Recursive on purpose: callers build structures by composing functions, so a
 * single-level spread loses data as soon as one level arrives as a Uint8Array
 * rather than a plain array.
 */
function flatten(value) {
	const out = []
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		for (const item of value) out.push(...flatten(item))
	} else {
		out.push(value)
	}
	return out
}

/** SEQUENCE — an ordered, constructed container. */
export function sequence(...items) {
	return tlv(TAG.SEQUENCE, flatten(items))
}

/** SET — an unordered, constructed container (DER sorts by encoding). */
export function set(...items) {
	return tlv(TAG.SET, flatten(items))
}

/** NULL. */
export function nullValue() {
	return tlv(TAG.NULL, [])
}

/**
 * INTEGER from raw two's-complement bytes.
 *
 * @param {number[]} valueBytes big-endian two's complement
 * @returns {number[]}
 */
export function integerFromBytes(valueBytes) {
	// Strip redundant leading bytes, keeping at least one sign byte.
	let start = 0
	while (
		start < valueBytes.length - 1 &&
		valueBytes[start] === 0x00 &&
		(valueBytes[start + 1] & 0x80) === 0
	) {
		start += 1
	}
	const body = valueBytes.slice(start)

	// Pad so the value reads as positive.
	if (body.length > 0 && (body[0] & 0x80) !== 0) {
		return tlv(TAG.INTEGER, [0x00, ...body])
	}
	return tlv(TAG.INTEGER, body)
}

/**
 * INTEGER from a non-negative safe integer.
 *
 * Only used for small values (version 0, DN string-tag numbers); r and s must go
 * through {@link integerFromBytes} because they are 256-bit magnitudes.
 *
 * @param {number} value
 * @returns {number[]}
 */
export function integer(value) {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(
			`DER INTEGER must be a non-negative integer (got ${value})`,
		)
	}
	if (value === 0) return tlv(TAG.INTEGER, [0x00])
	const bytes = []
	let remaining = value
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff)
		remaining = Math.floor(remaining / 256)
	}
	return integerFromBytes(bytes)
}

/**
 * BIT STRING.
 *
 * @param {number[]} valueBytes the octets of the string
 * @param {number} [unusedBits=0] must be 0 — we never emit partial octets
 * @returns {number[]}
 */
export function bitString(valueBytes, unusedBits = 0) {
	if (unusedBits !== 0) {
		// A non-zero unused-bit count cannot be represented without real bit
		// slicing, which nothing here needs. Fail instead of emitting garbage.
		throw new RangeError(
			"Only whole-octet BIT STRINGs (unusedBits = 0) are supported",
		)
	}
	return tlv(TAG.BIT_STRING, [0x00, ...valueBytes])
}

/** OCTET STRING. */
export function octetString(valueBytes) {
	return tlv(TAG.OCTET_STRING, valueBytes)
}

/** UTF8String. */
export function utf8String(value) {
	return tlv(
		TAG.UTF8_STRING,
		Array.from(new TextEncoder().encode(String(value))),
	)
}

/** PrintableString — restricted to the X.680 printable character set. */
const PRINTABLE_RE = /^[A-Za-z0-9 '()+,\-./:=?]*$/
export function printableString(value) {
	const text = String(value)
	if (!PRINTABLE_RE.test(text)) {
		throw new TypeError(
			`PrintableString cannot encode ${JSON.stringify(text)}; use UTF8String`,
		)
	}
	return tlv(TAG.PRINTABLE_STRING, Array.from(new TextEncoder().encode(text)))
}

/**
 * OBJECT IDENTIFIER from dotted decimal, e.g. "1.2.840.10045.2.1".
 *
 * The first two arcs are packed into one byte as `40*arc1 + arc2`; each
 * subsequent arc is base-128 with the continuation bit set on all but the last
 * byte.
 *
 * @param {string} dotted
 * @returns {number[]}
 */
export function oid(dotted) {
	const arcs = String(dotted)
		.split(".")
		.map((part) => {
			if (!/^\d+$/.test(part)) {
				throw new TypeError(`Invalid OID arc ${JSON.stringify(part)}`)
			}
			return Number(part)
		})

	if (arcs.length < 2)
		throw new TypeError(`OID needs at least two arcs: ${dotted}`)
	if (arcs[0] > 2)
		throw new TypeError(`First OID arc must be 0-2 (got ${arcs[0]})`)
	if (arcs[0] < 2 && arcs[1] > 39) {
		throw new TypeError("Second OID arc must be <= 39 when the first is < 2")
	}

	const bytes = [arcs[0] * 40 + arcs[1]]
	for (const arc of arcs.slice(2)) {
		if (arc < 0) throw new TypeError(`Negative OID arc in ${dotted}`)
		if (arc === 0) {
			bytes.push(0x00)
			continue
		}
		// base-128, most-significant group first.
		const groups = []
		let remaining = arc
		while (remaining > 0) {
			groups.unshift(remaining & 0x7f)
			remaining = Math.floor(remaining / 128)
		}
		for (let i = 0; i < groups.length - 1; i += 1) groups[i] |= 0x80
		bytes.push(...groups)
	}
	return tlv(TAG.OID, bytes)
}

/**
 * Context-specific constructed tag, e.g. `[0] IMPLICIT SET OF Attribute`.
 *
 * @param {number} number context tag number (0-30)
 * @returns {(content: number[]) => number[]} a builder
 */
export function contextConstructed(number) {
	if (!Number.isInteger(number) || number < 0 || number > 30) {
		throw new RangeError(`Context tag number must be 0-30 (got ${number})`)
	}
	const tag = 0xa0 | number
	return (content) => tlv(tag, content)
}

export default {
	TAG,
	encodeLength,
	sequence,
	set,
	nullValue,
	integer,
	integerFromBytes,
	bitString,
	octetString,
	utf8String,
	printableString,
	oid,
	contextConstructed,
}
