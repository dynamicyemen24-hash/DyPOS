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

import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { build } = await import("vite");

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "..", "DyPOS", "public", "pos");

// Deterministic clean: hashed chunks from previous builds (Frappe or Pages)
// would otherwise accumulate AND get precached by Workbox (729 entries/29MB
// incident). Manual rm is EPERM-safe here (verified); vite emptyOutDir stays
// false for the Windows dev flock issue.
for (const entry of await readdir(outDir).catch(() => [])) {
	await rm(path.join(outDir, entry), { recursive: true, force: true });
}
console.log("[build-pages] cleaned output dir");

await build({
	base: "/",
	logLevel: "info",
});

const wwwPosHtml = path.resolve(here, "..", "..", "DyPOS", "www", "pos.html");
let wwwBackup = null;
try {
	wwwBackup = await readFile(wwwPosHtml, "utf8");
} catch {
	/* first build — nothing to preserve yet */
}

const indexPath = path.resolve(here, "..", "..", "DyPOS", "public", "pos", "index.html");
let html = await readFile(indexPath, "utf8");
const before = html;
html = html.split("/assets/DyPOS/pos/").join("/");
if (html !== before) {
	await writeFile(indexPath, html, "utf8");
	console.log("[build-pages] rewrote Frappe asset prefix to root paths");
}

// The frappeui plugin copies index.html → DyPOS/www/pos.html on every build.
// The Frappe desk embed needs the /assets/DyPOS/pos/ base, so restore the
// backup taken before this Pages build overwrote it.
if (wwwBackup !== null) {
	await writeFile(wwwPosHtml, wwwBackup, "utf8");
	console.log("[build-pages] restored DyPOS/www/pos.html (Frappe base)");
}
