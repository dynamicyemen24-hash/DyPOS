/**
 * DyPOS Pages build (Cloudflare Pages root deployment).
 * Base "/" + PWA scope "/" so the service worker at /sw.js may control /.
 * Default `npm run build` keeps the Frappe desk base (/assets/DyPOS/pos/).
 *
 * NOTE: POS/index.html hardcodes /assets/DyPOS/pos/* head links for the
 * Frappe desk embed, so after the Vite build we rewrite them to root
 * paths. Bundled JS/CSS already honor base "/".
 */
process.env.DYPOS_PAGES_BUILD = "1";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { build } = await import("vite");

await build({
	base: "/",
	logLevel: "info",
});

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, "..", "..", "DyPOS", "public", "pos", "index.html");
let html = await readFile(indexPath, "utf8");
const before = html;
html = html.split("/assets/DyPOS/pos/").join("/");
if (html !== before) {
	await writeFile(indexPath, html, "utf8");
	console.log("[build-pages] rewrote Frappe asset prefix to root paths");
}
