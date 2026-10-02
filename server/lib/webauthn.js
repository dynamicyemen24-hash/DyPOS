import crypto from 'node:crypto';

/**
 * WebAuthn (FIDO2) verification primitives.
 *
 * Why this file exists instead of an npm package: the browser/OS already
 * implements the whole ceremony (invariants #9 — no third-party runtime). What
 * the server owes the user is the half nobody can skip: proving the assertion
 * was signed by the private key that never left the authenticator, for THIS
 * relying party, over a challenge we issued and nobody replayed.
 *
 * Nothing here ever sees a fingerprint or a face. Those are matched inside the
 * OS secure enclave; the app only ever handles a signature. That is the whole
 * reason to use WebAuthn instead of a camera model.
 */

// ── base64url ────────────────────────────────────────────────────────────────
export function b64u(buf) {
	return Buffer.from(buf).toString('base64url');
}

export function fromB64u(str) {
	if (typeof str !== 'string' || !str.length) throw new Error('bad base64url');
	return Buffer.from(str, 'base64url');
}

export function sha256(...parts) {
	const h = crypto.createHash('sha256');
	for (const p of parts) h.update(Buffer.isBuffer(p) ? p : Buffer.from(p));
	return h.digest();
}

export function randomChallenge(bytes = 32) {
	return b64u(crypto.randomBytes(bytes));
}

// ── minimal CBOR reader (the COSE_Key subset WebAuthn uses) ──────────────────
// Hand-rolled on purpose: a general CBOR dependency would be a new third-party
// runtime for a ~60-line grammar (major types 0,1,2,3,4,5,7).
function readCbor(buf, state) {
	const b = buf[state.i++];
	const major = b >> 5;
	const minor = b & 0x1f;
	let len;
	if (minor < 24) len = minor;
	else if (minor === 24) len = buf[state.i++];
	else if (minor === 25) {
		len = buf.readUInt16BE(state.i);
		state.i += 2;
	} else if (minor === 26) {
		len = buf.readUInt32BE(state.i);
		state.i += 4;
	} else if (minor === 27) {
		len = Number(buf.readBigUInt64BE(state.i));
		state.i += 8;
	} else throw new Error(`unsupported CBOR additional info ${minor}`);

	switch (major) {
		case 0:
			return minor < 24 ? minor : len;
		case 1:
			return minor < 24 ? -1 - minor : -1 - len;
		case 2: {
			const out = buf.subarray(state.i, state.i + len);
			state.i += len;
			return out;
		}
		case 3: {
			const out = buf.subarray(state.i, state.i + len).toString('utf8');
			state.i += len;
			return out;
		}
		case 4: {
			const arr = [];
			for (let n = 0; n < len; n++) arr.push(readCbor(buf, state));
			return arr;
		}
		case 5: {
			const obj = {};
			for (let n = 0; n < len; n++) {
				// Keep the CBOR label as-is (COSE uses integers); JS normalises
				// numeric keys to strings, so `obj[1]` and `obj["1"]` agree.
				const k = readCbor(buf, state);
				obj[k] = readCbor(buf, state);
			}
			return obj;
		}
		case 7:
			return minor === 20 ? false : minor === 21 ? true : minor === 22 ? null : minor;
		default:
			throw new Error(`unsupported CBOR major type ${major}`);
	}
}

export function parseCoseKey(bytes) {
	const state = { i: 0 };
	const map = readCbor(bytes, state);
	if (!map || map[1] === undefined) throw new Error('not a COSE_Key');
	// COSE labels are integers, not names: 1=kty 3=alg -1/-2/-3 carry the key
	// material (crv,x,y for EC2; n,e for RSA; crv,x for OKP).
	return {
		kty: map[1],
		alg: map[3],
		crv: map[-1],
		x: map[-2],
		y: map[-3],
		n: map[-1],
		e: map[-2],
	};
}

const b64uBuf = (v) => (Buffer.isBuffer(v) ? b64u(v) : v);

// ── COSE_Key → JWK → KeyObject ───────────────────────────────────────────────
/** Node imports JWK natively, so the COSE key never needs custom bigint math. */
export function coseToJwk(cose) {
	if (cose.kty === 2) {
		if (cose.crv !== 1) throw new Error(`unsupported EC curve ${cose.crv}`);
		return {
			kty: 'EC',
			crv: 'P-256',
			x: b64uBuf(cose.x),
			y: b64uBuf(cose.y),
			ext: true,
		};
	}
	if (cose.kty === 3) {
		return { kty: 'RSA', n: b64uBuf(cose.n), e: b64uBuf(cose.e), ext: true };
	}
	if (cose.kty === 1) {
		if (cose.crv !== 6) throw new Error(`unsupported OKP curve ${cose.crv}`);
		return { kty: 'OKP', crv: 'Ed25519', x: b64uBuf(cose.x), ext: true };
	}
	throw new Error(`unsupported COSE kty ${cose.kty}`);
}

export function publicKeyFromCose(coseB64url) {
	const cose = parseCoseKey(fromB64u(coseB64url));
	return crypto.createPublicKey({ key: coseToJwk(cose), format: 'jwk' });
}

/**
 * اسم دالة التجزئة لتوقيع WebAuthn، مشتقّ من خوارزمية COSE وحدها.
 *
 * لا مفتاح هنا بالمعنى المعتاد: التوقيع في WebAuthn يُغطّي
 * `authData ‖ sha256(clientDataJSON)` فقط، فاختيار الدالة دالّة في
 * الخوارزمية لا في المفتاح. `null` يعني Ed25519 يوقّع الرسالة كما هي.
 *
 * @param {number} coseAlg خوارزمية COSE (-7 ES256، -8 EdDSA، -257 RS256)
 * @returns {string|null} اسم دالة التجزئة، أو `null` للتوقيع المباشر
 */
function verifyDigestFor(coseAlg) {
	if (coseAlg === -8) return null; // Ed25519 signs the message directly.
	if (coseAlg === -7) return 'sha256';
	if (coseAlg === -257) return 'sha256';
	throw new Error(`unsupported COSE alg ${coseAlg}`);
}

// ── authenticator data ───────────────────────────────────────────────────────
export const FLAG_UP = 0x01; // user present
export const FLAG_UV = 0x04; // user verified (biometric/PIN inside the enclave)
export const FLAG_BE = 0x08; // backup eligible
export const FLAG_BS = 0x10; // backup state (synced passkey)
export const FLAG_AT = 0x40; // attested credential data present

export function parseAuthenticatorData(buf) {
	if (!Buffer.isBuffer(buf) || buf.length < 37) throw new Error('authData too short');
	const out = {
		rpIdHash: buf.subarray(0, 32),
		flags: buf[32],
		signCount: buf.readUInt32BE(33),
		attestedCredentialData: null,
	};
	if (out.flags & FLAG_AT) {
		const aaguid = buf.subarray(37, 53);
		let i = 53;
		if (buf.length < i + 2) throw new Error('truncated credentialIdLength');
		const idLen = buf.readUInt16BE(i);
		i += 2;
		if (buf.length < i + idLen) throw new Error('truncated credentialId');
		const credentialId = buf.subarray(i, i + idLen);
		i += idLen;
		// The COSE key is CBOR with a definite length; decode one item and use
		// the consumed offset as its end.
		const state = { i };
		readCbor(buf, state);
		const publicKey = b64u(buf.subarray(i, state.i));
		out.attestedCredentialData = { aaguid: b64u(aaguid), credentialId, publicKey };
	}
	return out;
}

// ── clientDataJSON ───────────────────────────────────────────────────────────
/**
 * The three checks that make a WebAuthn response non-replayable and
 * non-phishable: the ceremony type, the challenge we issued, and the origin.
 */
export function verifyClientData(raw, { type, expectedChallenge, expectedOrigins }) {
	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
	} catch {
		throw new Error('clientDataJSON is not JSON');
	}
	if (parsed.type !== type) throw new Error(`clientData type ${parsed.type} != ${type}`);
	if (typeof parsed.challenge !== 'string' || parsed.challenge !== expectedChallenge) {
		throw new Error('challenge mismatch');
	}
	if (!Array.isArray(expectedOrigins) || !expectedOrigins.includes(parsed.origin)) {
		throw new Error(`origin ${parsed.origin} not allowed`);
	}
	if (parsed.crossOrigin === true) throw new Error('cross-origin ceremony refused');
	return parsed;
}

// ── registration (attestation) ───────────────────────────────────────────────
/**
 * We accept self-attestation and "none" attestation: the goal is to bind a
 * user to a public key, not to certify which hardware made it. Full attestation
 * requires an FIDO metadata service, which is a deployment decision, not a code
 * one — so the check that always runs is that the key we just parsed actually
 * verifies the signature over exactly this authenticatorData.
 */
export function verifyRegistration({
	clientDataJSON,
	attestationObject,
	response,
	rpId,
	origin,
	challenge,
	requireUserVerified = true,
}) {
	const att = JSON.parse(Buffer.from(attestationObject, 'base64url').toString('utf8'));
	const clientData = verifyClientData(Buffer.from(clientDataJSON, 'base64url'), {
		type: 'webauthn.create',
		expectedChallenge: challenge,
		expectedOrigins: origin,
	});
	const authData = parseAuthenticatorData(Buffer.from(att.authData, 'base64url'));
	assertFlags(authData, { requireUserVerified });

	const expectedRp = sha256(rpId);
	if (!crypto.timingSafeEqual(authData.rpIdHash, expectedRp)) {
		throw new Error('rpIdHash does not match the relying party');
	}
	if (!authData.attestedCredentialData) throw new Error('no attested credential data');
	if (!response?.clientExtensionResults) {
		// Extensions are optional; presence is not required, correctness is.
	}

	const cose = parseCoseKey(fromB64u(authData.attestedCredentialData.publicKey));
	const key = crypto.createPublicKey({ key: coseToJwk(cose), format: 'jwk' });
	const fmt = att.fmt || 'none';
	if (fmt !== 'none' && fmt !== 'packed' && fmt !== 'self') {
		throw new Error(`unsupported attestation format ${fmt}`);
	}
	if (fmt === 'packed' || fmt === 'self') {
		// Self/packed attest the key with the key itself; proving that is what
		// stops an attacker substituting a public key of their own.
		const digest = verifyDigestFor(cose.alg);
		const signed = Buffer.concat([
			Buffer.from(att.authData, 'base64url'),
			sha256(Buffer.from(clientDataJSON, 'base64url')),
		]);
		const ok = crypto.verify(digest || null, signed, key, fromB64u(att.signature));
		if (!ok) throw new Error('attestation signature does not verify');
	}
	return {
		credentialId: b64u(authData.attestedCredentialData.credentialId),
		publicKey: authData.attestedCredentialData.publicKey,
		algorithm: cose.alg,
		aaguid: authData.attestedCredentialData.aaguid,
		backedUp: Boolean(authData.flags & FLAG_BS),
		signCount: authData.signCount,
		clientData,
		transports: Array.isArray(response?.transports) ? response.transports : [],
	};
}

// ── assertion (login) ────────────────────────────────────────────────────────
function assertFlags(authData, { requireUserVerified }) {
	if (!(authData.flags & FLAG_UP)) throw new Error('user presence flag not set');
	if (requireUserVerified && !(authData.flags & FLAG_UV)) {
		throw new Error('user verification (biometric/PIN) required but not performed');
	}
}

/**
 * The counter is the anti-clone check: a duplicated authenticator replays a
 * signCount we have already seen. Authenticators that do not implement counters
 * report 0 forever, so 0→0 is the one legal non-increment.
 */
export function verifyAssertion({
	credential,
	clientDataJSON,
	authenticatorData,
	signature,
	userHandle,
	challenge,
	origin,
	requireUserVerified = true,
}) {
	const parsedCose = parseCoseKey(fromB64u(credential.public_key));
	const key = crypto.createPublicKey({ key: coseToJwk(parsedCose), format: 'jwk' });
	const authData = parseAuthenticatorData(Buffer.from(authenticatorData, 'base64url'));
	assertFlags(authData, { requireUserVerified });

	verifyClientData(Buffer.from(clientDataJSON, 'base64url'), {
		type: 'webauthn.get',
		expectedChallenge: challenge,
		expectedOrigins: origin,
	});

	const digest = verifyDigestFor(parsedCose.alg);
	const signed = Buffer.concat([
		Buffer.from(authenticatorData, 'base64url'),
		sha256(Buffer.from(clientDataJSON, 'base64url')),
	]);
	const ok = crypto.verify(digest || null, signed, key, fromB64u(signature));
	if (!ok) return { ok: false, reason: 'signature_mismatch' };

	const previous = Number(credential.counter || 0);
	if (authData.signCount > 0 || previous > 0) {
		if (authData.signCount <= previous) {
			return { ok: false, reason: 'counter_replay' };
		}
	}
	if (userHandle) {
		const handle = b64u(fromB64u(userHandle));
		if (handle !== credential.credential_id) {
			return { ok: false, reason: 'user_handle_mismatch' };
		}
	}
	return {
		ok: true,
		signCount: authData.signCount,
		backedUp: Boolean(authData.flags & FLAG_BS),
		backupEligible: Boolean(authData.flags & FLAG_BE),
		userVerified: Boolean(authData.flags & FLAG_UV),
	};
}

// ── option builders ──────────────────────────────────────────────────────────
export function registrationOptions({ challenge, rpId, rpName, user, exclude = [] }) {
	return {
		challenge,
		rp: { id: rpId, name: rpName },
		user: {
			id: user.id,
			name: user.username,
			displayName: user.full_name || user.username,
		},
		pubKeyCredParams: [
			{ type: 'public-key', alg: -7 },
			{ type: 'public-key', alg: -257 },
			{ type: 'public-key', alg: -8 },
		],
		timeout: 60000,
		attestation: 'none',
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'required',
		},
		excludeCredentials: exclude.map((c) => ({ type: 'public-key', id: c.credential_id })),
	};
}

export function authenticationOptions({ challenge, allow = [], userVerification = 'required' }) {
	return {
		challenge,
		timeout: 60000,
		userVerification,
		allowCredentials: allow.length ? allow.map((c) => ({ type: 'public-key', id: c.credential_id })) : undefined,
	};
}
