/**
 * Device intelligence regression tests (device-adaptation feature).
 * Pure-function matrix for lib/device.js + the public GET /api/device
 * endpoint (custom User-Agent headers).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';
import { detectDevice, adaptationFor, deviceWarnings, serverWarnings } from '../lib/device.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const IE11 = 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko';
const OLD_CHROME = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Safari/537.36';

let server, port;

async function req(path, ua) {
  const headers = {};
  if (ua !== undefined) headers['User-Agent'] = ua;
  const res = await fetch(`http://localhost:${port}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

describe('detectDevice matrix', () => {
  it('iPhone Safari → mobile/ios/safari/touch', () => {
    const d = detectDevice(IPHONE);
    assert.strictEqual(d.type, 'mobile');
    assert.strictEqual(d.os, 'ios');
    assert.strictEqual(d.browser, 'safari');
    assert.strictEqual(d.touchLikely, true);
  });

  it('Android Chrome → mobile/android/chrome', () => {
    const d = detectDevice(ANDROID);
    assert.strictEqual(d.type, 'mobile');
    assert.strictEqual(d.os, 'android');
    assert.strictEqual(d.browser, 'chrome');
    assert.strictEqual(d.browserMajor, 120);
  });

  it('iPad → tablet', () => {
    assert.strictEqual(detectDevice(IPAD).type, 'tablet');
  });

  it('Android tablet without Mobile token → tablet', () => {
    const d = detectDevice(ANDROID_TABLET);
    assert.strictEqual(d.type, 'tablet');
    assert.strictEqual(d.os, 'android');
  });

  it('Windows Chrome → desktop, no touch', () => {
    const d = detectDevice(DESKTOP);
    assert.strictEqual(d.type, 'desktop');
    assert.strictEqual(d.os, 'windows');
    assert.strictEqual(d.browser, 'chrome');
    assert.strictEqual(d.touchLikely, false);
  });

  it('Googlebot → bot', () => {
    const d = detectDevice(BOT);
    assert.strictEqual(d.type, 'bot');
    assert.strictEqual(d.bot, true);
  });

  it('empty UA → unknown, never throws', () => {
    assert.strictEqual(detectDevice('').type, 'unknown');
    assert.strictEqual(detectDevice(null).type, 'unknown');
    assert.strictEqual(detectDevice(undefined).type, 'unknown');
  });
});

describe('adaptation + warnings', () => {
  it('mobile gets compact UI + touch targets + small pages, no prefetch', () => {
    const a = adaptationFor(detectDevice(IPHONE));
    assert.strictEqual(a.compactUi, true);
    assert.strictEqual(a.largeTouchTargets, true);
    assert.strictEqual(a.listPageSize, 20);
    assert.strictEqual(a.prefetch, false);
  });

  it('desktop gets prefetch + large pages', () => {
    const a = adaptationFor(detectDevice(DESKTOP));
    assert.strictEqual(a.prefetch, true);
    assert.strictEqual(a.listPageSize, 50);
  });

  it('bot UA warns, IE11 is critical, old Chrome warns', () => {
    assert.ok(deviceWarnings(detectDevice(BOT)).some((w) => w.code === 'bot-traffic'));
    const ie = deviceWarnings(detectDevice(IE11));
    assert.ok(ie.some((w) => w.level === 'critical' && w.code === 'browser-unsupported'));
    assert.ok(deviceWarnings(detectDevice(OLD_CHROME)).some((w) => w.code === 'browser-outdated'));
    assert.strictEqual(deviceWarnings(detectDevice(DESKTOP)).length, 0);
  });

  it('serverWarnings escalates on RSS thresholds', () => {
    assert.strictEqual(serverWarnings({ rss_mb: 100 }).length, 0);
    assert.ok(serverWarnings({ rss_mb: 950 }).some((w) => w.code === 'server-memory-high'));
    assert.ok(serverWarnings({ rss_mb: 1600 }).some((w) => w.level === 'critical'));
  });
});

describe('GET /api/device (public)', () => {
  it('iPhone UA → mobile + compact adaptation + server snapshot', async () => {
    const r = await req('/api/device', IPHONE);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.device.type, 'mobile');
    assert.strictEqual(r.body.adaptation.compactUi, true);
    assert.ok(typeof r.body.server.rss_mb === 'number');
    assert.ok(Array.isArray(r.body.warnings));
  });

  it('missing UA → unknown, still 200', async () => {
    const r = await req('/api/device', '');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.device.type, 'unknown');
  });

  it('bot UA → bot class + warning surfaced', async () => {
    const r = await req('/api/device', BOT);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.device.type, 'bot');
    assert.ok(r.body.warnings.some((w) => w.code === 'bot-traffic'));
  });
});
