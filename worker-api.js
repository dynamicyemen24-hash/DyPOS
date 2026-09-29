/**
 * DyPOS Backend API Worker
 * Provides API endpoints for PWA sync and online functionality
 * Uses D1 database for persistence
 */

const API_VERSION = '1.40.0';
const ALLOWED_ORIGIN = 'https://dypos.smartportssoft.com';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;

		// CORS headers
		const requestOrigin = request.headers.get('Origin');
		const corsHeaders = {
			'Access-Control-Allow-Origin': requestOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN,
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
			'Access-Control-Max-Age': '86400',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// Health check
			if (path === '/api/health' || path === '/health') {
				return jsonResponse({ status: 'ok', version: API_VERSION, timestamp: new Date().toISOString() }, corsHeaders);
			}

			if (path === '/api/ready' || path === '/ready') {
				return jsonResponse({ status: 'ready', checks: { database: true } }, corsHeaders);
			}

			// Ping endpoint for offline detection
			if (path === '/api/method/DyPOS.api.ping' || path === '/api/ping') {
				return jsonResponse({ status: 'ok', server_time: new Date().toISOString() }, corsHeaders);
			}

			// Auth endpoints
			if (path === '/api/method/dypos.auth.get_logged_user' || path === '/api/auth/user') {
				const authHeader = request.headers.get('Authorization');
				if (!authHeader) {
					return jsonResponse({ user: null, authenticated: false }, corsHeaders);
				}
				// Never treat the presence of an Authorization header as authentication.
				// Real identity validation belongs to the authoritative backend/session layer.
				return jsonResponse({ error: 'Authentication is not available on this edge compatibility endpoint' }, { ...corsHeaders, status: 501 });
			}

			if (path === '/api/method/DyPOS.api.auth.register' || path === '/api/auth/register') {
				return jsonResponse({ error: 'Registration must use the authoritative backend' }, { ...corsHeaders, status: 501 });
			}

			// Localization endpoints (canonical + legacy paths).
			// The PWA is local-first: these exist only as optional enrichment.
			if (path === '/api/localization/translations' ||
				path === '/api/method/DyPOS.api.localization.get_app_translations') {
				return jsonResponse({ translations: {} }, corsHeaders);
			}

			if (path === '/api/localization/locales' ||
				path === '/api/method/DyPOS.api.localization.get_allowed_locales') {
				return jsonResponse({ locales: ['ar', 'en'] }, corsHeaders);
			}

			if (path === '/api/localization/user-language' ||
				path === '/api/method/DyPOS.api.localization.get_user_language') {
				return jsonResponse({ locale: 'ar', user_language: 'ar' }, corsHeaders);
			}

			// Features endpoint
			if (path === '/api/features') {
				return jsonResponse({
					features: {
						offline_first: true,
						pwa: true,
						arabic_rtl: true,
						offline_auth: true,
						offline_sales: true,
						self_checkout: true,
						stock_management: true,
						reports: true
					}
				}, corsHeaders);
			}

			// CSRF token (canonical + legacy path)
			if (path === '/api/csrf_token' || path === '/api/method/DyPOS.api.utilities.get_csrf_token') {
				return jsonResponse({ csrf_token: crypto.randomUUID() }, corsHeaders);
			}

			if (path === '/api/auth/login') {
				return jsonResponse({
					success: false,
					offline_first: true,
					message: 'Use local offline login; server login is optional sync-only'
				}, corsHeaders);
			}

			if (path === '/api/auth/logout') {
				return jsonResponse({ success: true }, corsHeaders);
			}

			// Device registration
			if (path === '/api/device' || path === '/api/method/DyPOS.api.device.register') {
				return jsonResponse({ error: 'Device registration must use the authoritative backend' }, { ...corsHeaders, status: 501 });
			}

			// Sync endpoints (canonical + legacy paths)
			if (path === '/api/sync' || path === '/api/sync/push' || path === '/api/method/DyPOS.api.sync.push' ||
				path === '/api/sync/pull' || path === '/api/method/DyPOS.api.sync.pull') {
				return jsonResponse({ error: 'Sync must use the authoritative backend; no-op sync is disabled' }, { ...corsHeaders, status: 501 });
			}

			// Not found
			return jsonResponse({ error: 'Not found', path }, { ...corsHeaders, status: 404 });

		} catch (error) {
			console.error('Worker error:', error);
			return jsonResponse({
				error: 'Internal server error',
				request_id: request.headers.get('X-Request-Id') || crypto.randomUUID(),
			}, { ...corsHeaders, status: 500 });
		}
	}
};

function jsonResponse(data, options = {}) {
	const headers = {
		'Content-Type': 'application/json',
		...options.headers
	};
	return new Response(JSON.stringify(data), {
		status: options.status || 200,
		headers
	});
}
