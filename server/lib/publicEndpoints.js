/**
 * Simple public endpoints (no auth, lightweight).
 * Extracted from server.js to keep it under the file-size cap.
 */
import { VERSION } from '../lib/version.js';

export function registerPublicEndpoints(app) {
	// Simple ping endpoint for offline detection (no auth, lightweight)
	app.get('/api/ping', (_req, res) => {
		res.json({ pong: true, time: Date.now(), version: VERSION });
	});

	// Fleet version visibility: every API response carries the running build
	// so any terminal can detect drift without a separate version call.
	app.use('/api', (_req, res, next) => {
		try {
			res.setHeader('X-DyPOS-Version', VERSION);
		} catch { /* headers best-effort */ }
		next();
	});
}