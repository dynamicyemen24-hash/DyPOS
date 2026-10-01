import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
	b64u,
	fromB64u,
	parseCoseKey,
	parseAuthenticatorData,
	verifyRegistration,
	verifyAssertion,
	registrationOptions,
	authenticationOptions,
	randomChallenge,
	FLAG_AT,
	FLAG_UP,
	FLAG_UV,
	FLAG_BS,
} from "../lib/webauthn.js";

const RP_ID = "dypos.smartportssoft.com";
const ORIGINS = ["https://dypos.smartportssoft.com", "http://localhost:5173"];

// ── a CBOR *writer*, so the test can mint real COSE keys ─────────────────────
function cbor(value) {
	if (typeof value === "number") {
		if (value >= 0 && value < 24) return Buffer.from([value]);
		// -1 - n: n=-1 -> 0x20, n=-2 -> 0x21, ... (never `-1 - n` with `|`,
		// because -2|0x20 is -2 in JS, not 0x21).
		if (value < 0 && value >= -24) return Buffer.from([0x20 | (-1 - value)]);
		throw new Error("number out of test range");
	}
	if (Buffer.isBuffer(value)) {
		return Buffer.concat([Buffer.from([0x58, value.length]), value]);
	}
	if (Array.isArray(value)) {
		return Buffer.concat([Buffer.from([0x80 | value.length]), ...value.map(cbor)]);
	}
	const keys = Object.keys(value)
		.map(Number)
		.sort((a, b) => a - b);
	const parts = [Buffer.from([0xa0 | keys.length])];
	for (const k of keys) {
		parts.push(cbor(k));
		parts.push(cbor(value[k]));
	}
	return Buffer.concat(parts);
}

function coseFromPublicKey(publicKey) {
	const jwk = publicKey.export({ format: "jwk" });
	return cbor({
		1: 2, // kty: EC2
		3: -7, // alg: ES256
		"-1": 1, // crv: P-256
		"-2": fromB64u(jwk.x),
		"-3": fromB64u(jwk.y),
	});
}

function authData({ rpId = RP_ID, flags, signCount, credId, cose }) {
	const parts = [crypto.createHash("sha256").update(rpId).digest()];
	parts.push(Buffer.from([flags]));
	const sc = Buffer.alloc(4);
	sc.writeUInt32BE(signCount);
	parts.push(sc);
	if (cose) {
		parts.push(Buffer.alloc(16)); // aaguid
		const len = Buffer.alloc(2);
		len.writeUInt16BE(credId.length);
		parts.push(len, credId, cose);
	}
	return Buffer.concat(parts);
}

/** A software authenticator: enough to exercise every branch honestly. */
function makeAuthenticator() {
	const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
	const cose = coseFromPublicKey(publicKey);
	const credId = crypto.randomBytes(32);
	let counter = 0;
	const clientData = (type, challenge, origin = ORIGINS[0]) =>
		Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
	return {
		credId,
		cose,
		register({ challenge = randomChallenge(), flags = FLAG_UP | FLAG_UV | FLAG_AT, rpId = RP_ID, origin = ORIGINS[0] } = {}) {
			const cd = clientData("webauthn.create", challenge, origin);
			return {
				challenge,
				clientDataJSON: b64u(cd),
				attestationObject: b64u(
					Buffer.from(
						JSON.stringify({
							fmt: "none",
							attStmt: {},
							authData: b64u(authData({ rpId, flags, signCount: 0, credId, cose })),
						}),
					),
				),
				response: { transports: ["internal", "hybrid"] },
			};
		},
		assert({ challenge = randomChallenge(), flags = FLAG_UP | FLAG_UV, signCount, rpId = RP_ID, origin = ORIGINS[0], tamper = null } = {}) {
			counter = signCount ?? counter + 1;
			const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
			const ad = authData({ rpId, flags, signCount: counter });
			const signature = crypto.sign("sha256", Buffer.concat([ad, crypto.createHash("sha256").update(cd).digest()]), privateKey);
			return {
				challenge,
				clientDataJSON: b64u(cd),
				authenticatorData: b64u(ad),
				signature: b64u(tamper ? Buffer.concat([signature, Buffer.from([0])]) : signature),
				userHandle: b64u(credId),
			};
		},
	};
}

function storedFrom(registration) {
	return {
		public_key: registration.publicKey,
		credential_id: registration.credentialId,
		counter: 0,
	};
}

test("COSE ES256 key round-trips through the hand-rolled CBOR reader", () => {
	const auth = makeAuthenticator();
	const parsed = parseCoseKey(auth.cose);
	assert.equal(parsed.kty, 2);
	assert.equal(parsed.alg, -7);
	assert.equal(parsed.crv, 1);
	assert.equal(parsed.x.length, 32);
	assert.equal(parsed.y.length, 32);
});

test("authenticator data parses flags, counter and attested credential", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const att = JSON.parse(Buffer.from(reg.attestationObject, "base64url").toString());
	const parsed = parseAuthenticatorData(Buffer.from(att.authData, "base64url"));
	assert.equal(parsed.flags & FLAG_AT, FLAG_AT);
	assert.equal(parsed.signCount, 0);
	assert.equal(parsed.attestedCredentialData.credentialId.toString("hex"), auth.credId.toString("hex"));
});

test("registration yields a storable credential", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const out = verifyRegistration({
		clientDataJSON: reg.clientDataJSON,
		attestationObject: reg.attestationObject,
		response: reg.response,
		rpId: RP_ID,
		origin: ORIGINS,
		challenge: reg.challenge,
	});
	assert.equal(out.credentialId, b64u(auth.credId));
	assert.equal(out.algorithm, -7);
	assert.deepEqual(out.transports, ["internal", "hybrid"]);
	assert.equal(out.backedUp, false);
});

test("registration refuses a ceremony for another relying party", () => {
	const auth = makeAuthenticator();
	const reg = auth.register({ rpId: "evil.example" });
	assert.throws(
		() =>
			verifyRegistration({
				clientDataJSON: reg.clientDataJSON,
				attestationObject: reg.attestationObject,
				response: reg.response,
				rpId: RP_ID,
				origin: ORIGINS,
				challenge: reg.challenge,
			}),
		/rpIdHash does not match/,
	);
});

test("registration refuses a replayed challenge", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	assert.throws(
		() =>
			verifyRegistration({
				clientDataJSON: reg.clientDataJSON,
				attestationObject: reg.attestationObject,
				response: reg.response,
				rpId: RP_ID,
				origin: ORIGINS,
				challenge: randomChallenge(),
			}),
		/challenge mismatch/,
	);
});

test("registration refuses a foreign origin (phishing)", () => {
	const auth = makeAuthenticator();
	// The ceremony is performed on a look-alike site the user was lured to, so
	// the clientData origin is one we do not serve.
	const reg = auth.register({ origin: "https://dypos-typo.example" });
	assert.throws(
		() =>
			verifyRegistration({
				clientDataJSON: reg.clientDataJSON,
				attestationObject: reg.attestationObject,
				response: reg.response,
				rpId: RP_ID,
				origin: [ORIGINS[0]],
				challenge: reg.challenge,
			}),
		/not allowed/,
	);
});

test("biometric policy can demand user verification", () => {
	const auth = makeAuthenticator();
	const reg = auth.register({ flags: FLAG_UP | FLAG_AT });
	assert.throws(
		() =>
			verifyRegistration({
				clientDataJSON: reg.clientDataJSON,
				attestationObject: reg.attestationObject,
				response: reg.response,
				rpId: RP_ID,
				origin: ORIGINS,
				challenge: reg.challenge,
			}),
		/user verification/,
	);
});

test("a valid assertion logs in and advances the counter", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const stored = storedFrom(
		verifyRegistration({
			clientDataJSON: reg.clientDataJSON,
			attestationObject: reg.attestationObject,
			response: reg.response,
			rpId: RP_ID,
			origin: ORIGINS,
			challenge: reg.challenge,
		}),
	);
	const assertion = auth.assert();
	const result = verifyAssertion({
		credential: stored,
		clientDataJSON: assertion.clientDataJSON,
		authenticatorData: assertion.authenticatorData,
		signature: assertion.signature,
		userHandle: assertion.userHandle,
		challenge: assertion.challenge,
		origin: ORIGINS,
	});
	assert.equal(result.ok, true);
	assert.equal(result.signCount, 1);
	assert.equal(result.userVerified, true);
});

test("a single-bit change in the signature is rejected", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const stored = storedFrom(
		verifyRegistration({
			clientDataJSON: reg.clientDataJSON,
			attestationObject: reg.attestationObject,
			response: reg.response,
			rpId: RP_ID,
			origin: ORIGINS,
			challenge: reg.challenge,
		}),
	);
	const assertion = auth.assert({ tamper: true });
	const result = verifyAssertion({
		credential: stored,
		clientDataJSON: assertion.clientDataJSON,
		authenticatorData: assertion.authenticatorData,
		signature: assertion.signature,
		userHandle: assertion.userHandle,
		challenge: assertion.challenge,
		origin: ORIGINS,
	});
	assert.equal(result.ok, false);
	assert.equal(result.reason, "signature_mismatch");
});

test("a cloned authenticator replaying a counter is rejected", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const stored = storedFrom(
		verifyRegistration({
			clientDataJSON: reg.clientDataJSON,
			attestationObject: reg.attestationObject,
			response: reg.response,
			rpId: RP_ID,
			origin: ORIGINS,
			challenge: reg.challenge,
		}),
	);
	const first = auth.assert({ signCount: 7 });
	verifyAssertion({
		credential: stored,
		clientDataJSON: first.clientDataJSON,
		authenticatorData: first.authenticatorData,
		signature: first.signature,
		challenge: first.challenge,
		origin: ORIGINS,
	});
	stored.counter = 7;
	const replay = auth.assert({ signCount: 7 });
	const result = verifyAssertion({
		credential: stored,
		clientDataJSON: replay.clientDataJSON,
		authenticatorData: replay.authenticatorData,
		signature: replay.signature,
		challenge: replay.challenge,
		origin: ORIGINS,
	});
	assert.equal(result.ok, false);
	assert.equal(result.reason, "counter_replay");
});

test("an assertion without the user-presence flag is refused", () => {
	const auth = makeAuthenticator();
	const reg = auth.register();
	const stored = storedFrom(
		verifyRegistration({
			clientDataJSON: reg.clientDataJSON,
			attestationObject: reg.attestationObject,
			response: reg.response,
			rpId: RP_ID,
			origin: ORIGINS,
			challenge: reg.challenge,
		}),
	);
	const assertion = auth.assert({ flags: FLAG_UV });
	assert.throws(
		() =>
			verifyAssertion({
				credential: stored,
				clientDataJSON: assertion.clientDataJSON,
				authenticatorData: assertion.authenticatorData,
				signature: assertion.signature,
				challenge: assertion.challenge,
				origin: ORIGINS,
			}),
		/user presence/,
	);
});

test("the option builders request a resident key and user verification", () => {
	const opts = registrationOptions({
		challenge: randomChallenge(),
		rpId: RP_ID,
		rpName: "DyPOS",
		user: { id: "u1", username: "cashier" },
	});
	assert.equal(opts.authenticatorSelection.userVerification, "required");
	assert.equal(opts.authenticatorSelection.residentKey, "preferred");
	assert.ok(opts.pubKeyCredParams.some((p) => p.alg === -7));
	assert.ok(opts.pubKeyCredParams.some((p) => p.alg === -257));

	const auth = authenticationOptions({ challenge: randomChallenge(), allow: [{ credential_id: b64u(Buffer.alloc(32)) }] });
	assert.equal(auth.userVerification, "required");
	assert.equal(auth.allowCredentials.length, 1);
});
