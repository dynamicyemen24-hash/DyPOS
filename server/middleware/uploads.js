/**
 * /uploads static gate — auth + extension allowlist + kill-switch CSP.
 *
 * The method-router upload directory used to be mounted with no middleware at
 * all, so `GET /uploads/<file>` worked for an anonymous visitor: a
 * cross-tenant read of product images on filenames that are just
 * `${Date.now()}_${name}`. It is now auth-gated — the HttpOnly `dypos_token`
 * cookie rides along on same-origin `<img>` requests, so pictures keep
 * rendering while the directory stops being world-readable.
 *
 * `upload_file` accepts whatever extension the client sends, so only image
 * extensions are served: otherwise an authenticated user stores HTML on this
 * origin and XSS whoever opens the link. The response also carries
 * `nosniff` + a CSP with `default-src 'none'` as a second line of defence
 * for SVG documents (SVG stays allowlisted so vector product art renders).
 */
import express from 'express';
import { authMiddleware } from './auth.js';

const SERVABLE_UPLOAD = /\.(png|jpe?g|webp|gif|avif|bmp|ico|svg)$/i;

/** Express router mounted at `/uploads`. Mounted unconditionally so the gate
 *  fails closed: a missing directory must not silently drop the auth check. */
export function uploadsRouter(uploadsDir) {
	const router = express.Router();
	router.use(authMiddleware, (req, res, next) => {
		if (req.method === 'GET' || req.method === 'HEAD') {
			if (!SERVABLE_UPLOAD.test(req.path)) {
				return res.status(404).json({ error: 'المسار غير موجود', path: req.path });
			}
		}
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader(
			'Content-Security-Policy',
			"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox",
		);
		res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
		return next();
	});
	router.use(express.static(uploadsDir, { maxAge: '1y', etag: true, index: false }));
	return router;
}

export default uploadsRouter;
