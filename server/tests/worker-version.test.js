import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../lib/version.js';

// The edge worker stamps its own `API_VERSION` into /api/edge-health and
// /api/ready. It is a second literal that must track the single source:
// a release that bumps every package.json but forgets worker-api.js leaves
// the edge reporting a stale version, and the live gate (`/api/health`
// frontend/API parity) cannot see it because that probe is proxied.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workerSource = readFileSync(resolve(ROOT, 'worker-api.js'), 'utf8');
const pinned = workerSource.match(/^\s*const API_VERSION = "([^"]+)"\s*;/m)?.[1];
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const posPkg = JSON.parse(readFileSync(resolve(ROOT, 'POS', 'package.json'), 'utf8'));

test('worker-api.js stamps a single API_VERSION literal', () => {
  assert.match(pinned ?? '', /^\d+\.\d+\.\d+$/, 'API_VERSION literal not found in worker-api.js');
});

test('edge API_VERSION tracks the version single source', () => {
  assert.equal(pinned, VERSION);
  assert.equal(pinned, rootPkg.version);
  assert.equal(pinned, posPkg.version);
});
