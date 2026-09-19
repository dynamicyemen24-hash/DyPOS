import { createServer } from "node:http";
import { promises as fsp, readdirSync } from "node:fs";
import path from "node:path";

const DEPLOY_DIR = "D:\\SulationDy\\DyPOS\\dist-deploy";
const PORT = 8123;

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".ico": "image/x-icon",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".webmanifest": "application/manifest+json",
};

function rootOf() {
	const names = readdirSync(DEPLOY_DIR);
	// Prefer canonical semver names (pos-package-1.21.0). Semver >= legacy
	// timestamps are never comparable numerically (13-digit vs 4-6 digit),
	// so separate the two schemes and let semver win explicitly.
	const semver = names
		.filter((n) => /^pos-package-\d+\.\d+\.\d+$/.test(n))
		.map((n) => ({ n, t: n.match(/-(\d+)\.(\d+)\.(\d+)$/).slice(1).map(Number) }))
		.sort((a, b) => {
			for (let i = 0; i < 3; i++) if (a.t[i] !== b.t[i]) return b.t[i] - a.t[i];
			return 0;
		})[0];
	if (semver) return path.join(DEPLOY_DIR, semver.n);

	const legacy = names
		.filter((n) => /^pos-package-\d+$/.test(n))
		.sort((a, b) => Number(b.replace(/^pos-package-/, "")) - Number(a.replace(/^pos-package-/, "")))[0];
	if (!legacy) throw new Error(`No pos-package-* (semver or legacy) under ${DEPLOY_DIR}`);
	return path.join(DEPLOY_DIR, legacy);
}

function json(res, data) {
	res.writeHead(200, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"Set-Cookie": "user_id=Guest; Path=/; HttpOnly; SameSite=Lax",
	});
	res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
	const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
	const pathname = decodeURIComponent(url.pathname);

	// --- Minimal Frappe API mock so the production bundle boots its shell ---
	if (pathname === "/api/method/frappe.auth.get_logged_user") {
		return json(res, { message: "Guest" });
	}
	if (pathname === "/api/method/DyPOS.api.utilities.get_csrf_token") {
		return json(res, { message: { csrf_token: "mock-csrf-token" } });
	}
	if (pathname.startsWith("/api/method/frappe.client.get_list")) {
		return json(res, { message: [] });
	}
	if (pathname === "/api/method/frappe.client.get_count") {
		return json(res, { message: 0 });
	}
	if (pathname.startsWith("/api/")) {
		return json(res, { message: null });
	}
	if (pathname === "/login" || pathname === "/logout") {
		return json(res, { message: "Logged Out" });
	}

	const ROOT = rootOf();
	let target = pathname;
	if (target === "/") target = "/pos.html";
	const file = path.join(ROOT, target);
	try {
		const data = await fsp.readFile(file);
		const ext = path.extname(file).toLowerCase();
		res.writeHead(200, {
			"Content-Type": MIME[ext] || "application/octet-stream",
			"Cache-Control": "no-store",
		});
		res.end(data);
	} catch {
		// SPA fallback: serve the shell for client-side routes (like IIS URL rewrite).
		const shell = await fsp.readFile(path.join(ROOT, "pos.html"));
		res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
		res.end(shell);
	}
}).listen(PORT, "127.0.0.1", () => {
	console.log(`Serving latest DyPOS package at http://127.0.0.1:${PORT}/pos.html`);
});
