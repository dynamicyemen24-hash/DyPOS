/**
 * TOTP — RFC 6238 (time-based) over RFC 4226 (HOTP), implemented on node:crypto.
 *
 * Why first-party instead of a package: the runtime stack is deliberately
 * dependency-light (AGENTS.md invariant 9), and the whole algorithm is one
 * HMAC + one dynamic truncation. `qrcode` is already a declared dependency for
 * print labels; an authenticator app needs nothing more than the standard.
 *
 * Standards conformance (this is what makes Google Authenticator / Authy /
 * 1Password / Microsoft Authenticator accept the same secret):
 *   - RFC 4226 §5.3  HOTP: HMAC-SHA1(secret, counter), dynamic truncation to a
 *     6-digit code, modulo 10^6.
 *   - RFC 6238 §4.2  T = floor((unixTime - T0) / X), X = 30s step.
 *   - Base32 (RFC 4648 §6) is the shared secret encoding authenticator apps
 *     expect in the `otpauth://` URI.
 *   - Verification accepts a +/- `window` step skew because phone clocks drift;
 *     ±1 step (±30s) is the Google-recommended default.
 *
 * Replay protection: `lastUsedStep` is persisted by the caller, so a code that
 * already succeeded inside its window cannot be replayed — the classic TOTP
 * weakness where the same 6 digits stay valid for up to 90 seconds.
 */
import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const TOTP_DEFAULTS = Object.freeze({
	digits: 6,
	stepSeconds: 30,
	window: 1,
	algorithm: 'sha1',
	issuer: 'DyPOS',
});

/** RFC 4648 §6 base32 encode, no padding (what authenticator apps expect). */
export function base32Encode(buffer) {
	const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

/** RFC 4648 §6 base32 decode. Tolerates lowercase, spaces and `=` padding. */
export function base32Decode(input) {
	const source = String(input ?? '')
		.toUpperCase()
		.replace(/\s/g, '');
	const paddingIndex = source.indexOf('=');
	const clean = paddingIndex === -1 ? source : source.slice(0, paddingIndex);
	const padding = paddingIndex === -1 ? '' : source.slice(paddingIndex);
	const remainder = clean.length % 8;
	const paddingByRemainder = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };

	if (
		(padding && (!/^=+$/.test(padding) || source.length % 8 !== 0)) ||
		(padding && padding.length !== paddingByRemainder[remainder]) ||
		paddingByRemainder[remainder] === undefined
	) {
		throw new Error('base32: invalid padding or length');
	}

	let bits = 0;
	let value = 0;
	const out = [];
	for (const char of clean) {
		const index = BASE32_ALPHABET.indexOf(char);
		if (index === -1) throw new Error('base32: illegal character');
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) {
		throw new Error('base32: non-zero trailing bits');
	}
	return Buffer.from(out);
}

/** RFC 4226 §5.3 — one code for a counter value. */
export function hotp(secretBase32, counter, options = {}) {
	const { digits = TOTP_DEFAULTS.digits, algorithm = TOTP_DEFAULTS.algorithm } = options;
	if (!Number.isSafeInteger(counter) || counter < 0) {
		throw new RangeError('HOTP counter must be a non-negative safe integer');
	}
	if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
		throw new RangeError('HOTP digits must be an integer from 1 to 10');
	}
	const key = base32Decode(secretBase32);
	// 64-bit counter, big-endian — Buffer.writeBigUInt64BE.
	const message = Buffer.alloc(8);
	message.writeBigUInt64BE(BigInt(counter));
	const digest = crypto.createHmac(algorithm, key).update(message).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const binary =
		((digest[offset] & 0x7f) << 24) |
		((digest[offset + 1] & 0xff) << 16) |
		((digest[offset + 2] & 0xff) << 8) |
		(digest[offset + 3] & 0xff);
	return String(binary % 10 ** digits).padStart(digits, '0');
}

/** RFC 6238 §4.2 — time-based code for an explicit unix timestamp (ms). */
export function totp(secretBase32, timestampMs = Date.now(), options = {}) {
	const { stepSeconds = TOTP_DEFAULTS.stepSeconds } = options;
	if (!Number.isSafeInteger(stepSeconds) || stepSeconds <= 0) {
		throw new RangeError('TOTP stepSeconds must be a positive safe integer');
	}
	return hotp(secretBase32, Math.floor(timestampMs / 1000 / stepSeconds), options);
}

/** Current counter value — the caller persists it as `lastUsedStep`. */
export function currentStep(timestampMs = Date.now(), options = {}) {
	const { stepSeconds = TOTP_DEFAULTS.stepSeconds } = options;
	if (!Number.isSafeInteger(stepSeconds) || stepSeconds <= 0) {
		throw new RangeError('TOTP stepSeconds must be a positive safe integer');
	}
	return Math.floor(timestampMs / 1000 / stepSeconds);
}

/**
 * Constant-time code comparison. `timingSafeEqual` throws on length mismatch,
 * so the length is compared first (it is not secret — the code length is fixed).
 */
export function safeEqualCode(a, b) {
	const left = Buffer.from(String(a ?? ''));
	const right = Buffer.from(String(b ?? ''));
	if (left.length !== right.length || left.length === 0) return false;
	return crypto.timingSafeEqual(left, right);
}
/**
 * Verify a submitted code within a +/- `window` step skew.
 *
 * @returns {{ ok: boolean, step?: number, driftSteps?: number }}
 *   `step` is the counter that matched — persist it to block replay.
 */
export function verifyTotp(secretBase32, code, options = {}) {
	const {
		window = TOTP_DEFAULTS.window,
		stepSeconds = TOTP_DEFAULTS.stepSeconds,
		timestampMs = Date.now(),
		lastUsedStep = -1,
		digits = TOTP_DEFAULTS.digits,
		algorithm = TOTP_DEFAULTS.algorithm,
	} = options;

	if (!Number.isInteger(window) || window < 0 || window > 10) {
		throw new RangeError('TOTP window must be an integer from 0 to 10');
	}
	const submitted = String(code ?? '').replace(/[\s-]/g, '');
	if (!/^\d+$/.test(submitted) || submitted.length !== digits) return { ok: false };

	const step = currentStep(timestampMs, { stepSeconds });
	// Walk newest-first so a small clock skew is preferred over a large one.
	for (let drift = 0; drift <= window; drift++) {
		for (const candidate of drift === 0 ? [step] : [step - drift, step + drift]) {
			if (candidate < 0 || candidate <= lastUsedStep) continue; // stale or replayed
			if (safeEqualCode(hotp(secretBase32, candidate, { digits, algorithm }), submitted)) {
				return { ok: true, step: candidate, driftSteps: drift };
			}
		}
	}
	return { ok: false };
}

/**
 * Provisioning URI — the format every authenticator app scans as a QR code.
 * `otpauth://totp/<label>?secret=…&issuer=…&algorithm=…&digits=…&period=…`
 */
export function otpauthUri({ secret, account, issuer = TOTP_DEFAULTS.issuer, options = {} }) {
	const {
		digits = TOTP_DEFAULTS.digits,
		stepSeconds = TOTP_DEFAULTS.stepSeconds,
		algorithm = TOTP_DEFAULTS.algorithm,
	} = options;
	const label = encodeURIComponent(`${issuer}:${account}`);
	const params = new URLSearchParams({
		secret,
		issuer,
		algorithm: algorithm.toUpperCase(),
		digits: String(digits),
		period: String(stepSeconds),
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}

/** Cryptographically random base32 secret (default 160-bit, RFC 4226 §4). */
export function generateSecret(bytes = 20, randomBytes = crypto.randomBytes) {
	return base32Encode(randomBytes(bytes));
}

export default {
	TOTP_DEFAULTS,
	base32Encode,
	base32Decode,
	generateSecret,
	hotp,
	totp,
	currentStep,
	verifyTotp,
	otpauthUri,
	safeEqualCode,
};
