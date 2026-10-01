import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  base32Decode,
  base32Encode,
  currentStep,
  generateSecret,
  hotp,
  otpauthUri,
  safeEqualCode,
  totp,
  verifyTotp,
} from '../lib/totp.js';

const SHA1_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('RFC 4648 Base32', () => {
  test('round-trips the RFC 4648 test strings', () => {
    const vectors = [
      ['', ''],
      ['f', 'MY======'],
      ['fo', 'MZXQ===='],
      ['foo', 'MZXW6==='],
      ['foob', 'MZXW6YQ='],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI======'],
    ];

    for (const [plain, encoded] of vectors) {
      assert.equal(base32Encode(Buffer.from(plain)), encoded.replace(/=+$/, ''));
      assert.equal(base32Decode(encoded).toString(), plain);
      assert.equal(base32Decode(encoded.toLowerCase()).toString(), plain);
    }
    assert.throws(() => base32Decode('invalid0'));
    assert.throws(() => base32Decode('A'));
    assert.throws(() => base32Decode('MY='));
    assert.throws(() => base32Decode('MZ'));
  });
});

describe('RFC 4226 HOTP', () => {
  test('matches Appendix D test vectors', () => {
    const vectors = [
      '755224', '287082', '359152', '969429', '338314',
      '254676', '287922', '162583', '399871', '520489',
    ];

    for (const [counter, expected] of vectors.entries()) {
      assert.equal(hotp(SHA1_SECRET, counter), expected, `counter ${counter}`);
    }
    assert.throws(() => hotp(SHA1_SECRET, -1), RangeError);
    assert.throws(() => hotp(SHA1_SECRET, 0, { digits: 11 }), RangeError);
  });
});

describe('RFC 6238 TOTP', () => {
  test('matches Appendix B SHA-1, SHA-256, and SHA-512 vectors', () => {
    const vectors = [
      {
        secret: SHA1_SECRET,
        algorithm: 'sha1',
        expected: ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'],
      },
      {
        secret: base32Encode(Buffer.from('12345678901234567890123456789012')),
        algorithm: 'sha256',
        expected: ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
      },
      {
        secret: base32Encode(Buffer.from('1234567890123456789012345678901234567890123456789012345678901234')),
        algorithm: 'sha512',
        expected: ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'],
      },
    ];
    const timestamps = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];

    for (const vector of vectors) {
      for (const [index, seconds] of timestamps.entries()) {
        assert.equal(
          totp(vector.secret, seconds * 1000, { digits: 8, algorithm: vector.algorithm }),
          vector.expected[index],
          `${vector.algorithm} at ${seconds}`,
        );
      }
    }
  });

  test('accepts clock skew and rejects malformed, expired, and replayed codes', () => {
    const timestampMs = 1_700_000_010_000;
    const step = currentStep(timestampMs);
    const previousStepCode = hotp(SHA1_SECRET, step - 1);

    const accepted = verifyTotp(SHA1_SECRET, previousStepCode, { timestampMs });
    assert.deepEqual(accepted, { ok: true, step: step - 1, driftSteps: 1 });
    assert.deepEqual(
      verifyTotp(SHA1_SECRET, previousStepCode, { timestampMs, lastUsedStep: step - 1 }),
      { ok: false },
    );
    assert.deepEqual(verifyTotp(SHA1_SECRET, '12x456', { timestampMs }), { ok: false });
    assert.deepEqual(verifyTotp(SHA1_SECRET, '12345', { timestampMs }), { ok: false });
    assert.throws(() => verifyTotp(SHA1_SECRET, '123456', { window: 11 }), RangeError);
    assert.throws(() => currentStep(timestampMs, { stepSeconds: 0 }), RangeError);
  });
});

describe('Authenticator provisioning helpers', () => {
  test('generates a 160-bit secret and an encoded otpauth URI', () => {
    const secret = generateSecret(20, (size) => Buffer.alloc(size, 0xff));
    assert.equal(base32Decode(secret).length, 20);
    assert.match(secret, /^[A-Z2-7]+$/);

    const uri = new URL(otpauthUri({ secret, account: 'cashier@example.test' }));
    assert.equal(uri.protocol, 'otpauth:');
    assert.equal(uri.hostname, 'totp');
    assert.equal(
      decodeURIComponent(uri.pathname),
      '/DyPOS:cashier@example.test',
    );
    assert.equal(uri.searchParams.get('secret'), secret);
    assert.equal(uri.searchParams.get('issuer'), 'DyPOS');
    assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
    assert.equal(uri.searchParams.get('digits'), '6');
    assert.equal(uri.searchParams.get('period'), '30');
  });

  test('compares codes safely and rejects unequal values', () => {
    assert.equal(safeEqualCode('012345', '012345'), true);
    assert.equal(safeEqualCode('012345', '12345'), false);
    assert.equal(safeEqualCode('１２３４５６', '123456'), false);
    assert.equal(safeEqualCode('', ''), false);
  });
});
