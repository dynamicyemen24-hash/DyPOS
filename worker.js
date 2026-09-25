export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// API routes -> proxy to backend (deployed separately)
		if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/run-billing") || url.pathname.startsWith("/push") || url.pathname.startsWith("/pull") || url.pathname.startsWith("/subscriptions") || url.pathname.startsWith("/tenants") || url.pathname.startsWith("/register") || url.pathname.startsWith("/login") || url.pathname.startsWith("/logout") || url.pathname.startsWith("/products") || url.pathname.startsWith("/invoices") || url.pathname.startsWith("/customers") || url.pathname.startsWith("/stock") || url.pathname.startsWith("/shifts") || url.pathname.startsWith("/devices") || url.pathname.startsWith("/webhooks") || url.pathname.startsWith("/export") || url.pathname.startsWith("/import") || url.pathname.startsWith("/report") || url.pathname.startsWith("/billings") || url.pathname.startsWith("/plans") || url.pathname.startsWith("/billings") || url.pathname.startsWith("/openapi.json") || url.pathname.startsWith("/health") || url.pathname.startsWith("/ready")) {
			const backendUrl = env.BACKEND_URL || "https://dypos-api.smartportssoft.com";
			const apiUrl = new URL(request.url);
			apiUrl.hostname = new URL(backendUrl).hostname;
			apiUrl.protocol = new URL(backendUrl).protocol;
			apiUrl.port = new URL(backendUrl).port;

			const apiRequest = new Request(apiUrl.toString(), {
				method: request.method,
				headers: request.headers,
				body: request.body,
				redirect: "follow",
			});

			return fetch(apiRequest);
		}

		// Static assets and SPA -> serve from assets
		return env.ASSETS.fetch(request);
	},
};