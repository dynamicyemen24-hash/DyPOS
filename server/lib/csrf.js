/**
 * DyPOS CSRF — single implementation (S3).
 *
 * Canonical REST: GET /api/csrf_token → { csrf_token }
 * Legacy compat: /api/method/DyPOS.api.utilities.get_csrf_token → { message: { csrf_token } }
 *
 * Both paths share THIS generator: same token entropy, same cookie
 * (csrf_token, Path=/, Max-Age=86400, SameSite=Lax + Secure in production),
 * same header contract (X-DyPOS-CSRF-Token). A second implementation is a
 * defect even when both are correct — money-line rule applies to CSRF too.
 */
import { randomBytes } from 'node:crypto';
import { isProduction } from '../middleware/auth.js';

export function mintCsrfToken() {
	return randomBytes(24).toString('hex');
}

export function csrfCookieHeader(token) {
	const secure = isProduction ? '; Secure' : '';
	return `csrf_token=${token}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
}

/**
 * Attach the CSRF cookie + JSON body on a REST response.
 * Shape matches the edge/worker contract the POS parses:
 * { csrf_token } (worker) — legacy wraps it in { message: { csrf_token } }.
 */
export function sendCsrfToken(req, res, { envelope = false } = {}) {
	const token = mintCsrfToken();
	res.append('Set-Cookie', csrfCookieHeader(token));
	const payload = { csrf_token: token, session_id: req.user?.jti || 'anonymous' };
	if (envelope) return res.json({ message: payload });
	return res.json(payload);
}

export default { mintCsrfToken, csrfCookieHeader, sendCsrfToken };
