import { createServer } from "node:http";
import { promises as fsp } from "node:fs";
import path from "node:path";

const ROOT = "D:\\SulationDy\\DyPOS\\dist-deploy\\pos-package-1789399255269";
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

function json(res, data, status = 200) {
	res.writeHead(status, {
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
	console.log(`Serving DyPOS package (API mock) at http://127.0.0.1:${PORT}/pos.html`);
});