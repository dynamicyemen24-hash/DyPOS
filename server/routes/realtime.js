/**
 * DyPOS realtime routes (v1.35.0) — SSE endpoint.
 *
 * GET /api/realtime/events — authenticated SSE stream, mounted via
 * `registerSseRoutes(app)` from lib/realtime.js (which applies authMiddleware
 * before this router). The connection handler is injected by the hub
 * (setSseHandler) so this module never imports lib/realtime.js — that one-way
 * dependency keeps ESM evaluation clean and hot-reload safe.
 *
 * Before the handler is installed, the endpoint answers 503 (hub not yet
 * initialized) instead of hanging or 500-ing.
 */
import { Router } from 'express';

let sseHandler = null;

/**
 * Install the SSE connection handler (called once by registerSseRoutes).
 * @param {(req, res) => void} fn
 */
export function setSseHandler(fn) {
  sseHandler = typeof fn === 'function' ? fn : null;
}

const router = Router();

router.get('/events', (req, res) => {
  if (typeof sseHandler !== 'function') {
    return res.status(503).json({ error: 'البث اللحظي غير مهيأ بعد' });
  }
  return sseHandler(req, res);
});

export default router;