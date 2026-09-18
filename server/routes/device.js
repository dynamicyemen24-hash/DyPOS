/**
 * GET /api/device — device intelligence + adaptation hints (public).
 *
 * Public on purpose: the login shell itself must adapt before any user
 * authenticates. Reflects only the caller's own User-Agent plus a generic
 * origin perf snapshot — no PII is read, stored, or logged.
 *
 * Response:
 * {
 *   device: { type, os, browser, browserMajor, touchLikely, bot },
 *   adaptation: { compactUi, largeTouchTargets, listPageSize, prefetch, reduceMotion },
 *   server: { rss_mb, heap_mb, uptime_s },
 *   warnings: [{ level, code, message }]   // Arabic, user-facing
 * }
 */
import { Router } from 'express';
import { detectDevice, adaptationFor, deviceWarnings, serverWarnings } from '../lib/device.js';

const router = Router();

router.get('/', (req, res) => {
  const ua = String(req.headers['user-agent'] || '');
  const device = detectDevice(ua);
  const adaptation = adaptationFor(device);
  const mem = process.memoryUsage();
  const server = {
    rss_mb: Math.round(mem.rss / 1048576),
    heap_mb: Math.round(mem.heapUsed / 1048576),
    uptime_s: Math.round(process.uptime()),
  };
  const warnings = [...deviceWarnings(device), ...serverWarnings(server)];
  return res.json({ device, adaptation, server, warnings });
});

export default router;
