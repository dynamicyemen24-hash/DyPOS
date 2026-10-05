/**
 * Simple public endpoints (no auth, lightweight).
 * Extracted from server.js to keep it under the file-size cap.
 *
 * Canonical CSRF lives HERE: GET /api/csrf_token is the single REST path the
 * POS probes first. The method-router name
 * (DyPOS.api.utilities.get_csrf_token) is legacy compat and delegates to the
 * same generator in lib/csrf.js — never a second implementation.
 */
import { VERSION } from '../lib/version.js';
import { sendCsrfToken } from './csrf.js';

export function registerPublicEndpoints(app) {
	// Simple ping endpoint for offline detection (no auth, lightweight)
	app.get('/api/ping', (_req, res) => {
		res.json({ pong: true, time: Date.now(), version: VERSION });
	});

	// Canonical CSRF token (POS utils/csrf.js probes this first, no-store).
	// Cookie + header + body share lib/csrf.js with the legacy method verb.
	app.get('/api/csrf_token', (req, res) => sendCsrfToken(req, res));

	// Fleet version visibility: every API response carries the running build
	// so any terminal can detect drift without a separate version call.
	app.use('/api', (_req, res, next) => {
		try {
			res.setHeader('X-DyPOS-Version', VERSION);
		} catch {
			/* headers best-effort */
		}
		next();
	});
}
