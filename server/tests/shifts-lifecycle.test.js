/**
 * Shift lifecycle integration tests through the real HTTP API.
 * Covers open, conflict protection, close persistence and double-close safety.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { app } from '../server.js';

let server;
let port;
let token;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const username = `shift_e2e_${Date.now()}`;
  const registered = await req('POST', '/api/auth/register', {
    username, password: 'Pass1234', fullName: 'Shift E2E', role: 'ADMIN',
  });
  assert.ok([200, 201].includes(registered.status), JSON.stringify(registered.body));
  const login = await req('POST', '/api/auth/login', { username, password: 'Pass1234' });
  assert.equal(login.status, 200);
  token = login.body.token;
});

after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  server.close((error) => error ? reject(error) : resolve());
}));

async function req(method, path, body, tok = token) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { status: response.status, body: parsed };
}

describe('Shift lifecycle (HTTP E2E)', () => {
  it('opens a terminal shift, prevents a duplicate, closes it and persists the closed state', async () => {
    const terminalId = `TERM-E2E-${Date.now()}`;
    const opened = await req('POST', '/api/shifts/open', { terminalId, openingCash: 250 });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    assert.equal(opened.body.status, 'OPEN');
    assert.ok(opened.body.shiftId);

    const current = await req('GET', `/api/shifts/open/${encodeURIComponent(terminalId)}`);
    assert.equal(current.status, 200);
    assert.equal(current.body.shift.id, opened.body.shiftId);
    assert.equal(current.body.shift.status, 'OPEN');

    const duplicate = await req('POST', '/api/shifts/open', { terminalId, openingCash: 0 });
    assert.equal(duplicate.status, 409);

    const closed = await req('POST', `/api/shifts/${opened.body.shiftId}/close`, { closingCash: 250 });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.equal(Number(closed.body.expected), 250);
    assert.equal(Number(closed.body.counted), 250);
    assert.equal(Number(closed.body.variance), 0);

    const closedAgain = await req('POST', `/api/shifts/${opened.body.shiftId}/close`, { closingCash: 250 });
    assert.equal(closedAgain.status, 400);

    const history = await req('GET', '/api/shifts?status=CLOSED&limit=200');
    assert.equal(history.status, 200);
    const persisted = history.body.shifts.find((shift) => shift.id === opened.body.shiftId);
    assert.ok(persisted, 'closed shift should be visible in shift history');
    assert.equal(persisted.status, 'CLOSED');
    assert.equal(Number(persisted.opening_cash), 250);
    assert.equal(Number(persisted.closing_cash), 250);
  });

  it('rejects invalid closing cash without changing the open shift', async () => {
    const terminalId = `TERM-INVALID-${Date.now()}`;
    const opened = await req('POST', '/api/shifts/open', { terminalId, openingCash: 25 });
    assert.equal(opened.status, 201);
    const rejected = await req('POST', `/api/shifts/${opened.body.shiftId}/close`, { closingCash: -1 });
    assert.equal(rejected.status, 400);
    const current = await req('GET', `/api/shifts/open/${encodeURIComponent(terminalId)}`);
    assert.equal(current.body.shift.status, 'OPEN');
  });
});
