/**
 * DyPOS Pages build (Cloudflare Pages root deployment).
 *
 * Base "/" + PWA scope "/" so the service worker at /sw.js may control /.
 * The default `npm run build` keeps the embedded base (/assets/DyPOS/pos/).
 *
 * NOTE: POS/index.html hardcodes /assets/DyPOS/pos/* head links for the
 * embedded target, so after the Vite build we rewrite them to root paths.
 * Bundled JS/CSS already honor base "/".
 */
process.env.DYPOS_PAGES_BUILD = "1"

import { readFile, writeFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const { build } = await import("vite")

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "..", "dist", "pos")

// Deterministic clean: hashed chunks from previous builds would otherwise
// accumulate AND get precached by Workbox (729 entries / 29 MB incident).
// Manual rm is EPERM-safe here; vite emptyOutDir stays false because the output
// root also holds hand-maintained files (_headers, manifest, locales, icons).
for (const entry of await readdir(outDir).catch(() => [])) {
	await rm(path.join(outDir, entry), { recursive: true, force: true })
}
console.log("[build-pages] cleaned output dir")

await build({
	base: "/",
	logLevel: "info",
})

const indexPath = path.join(outDir, "index.html")
let html = await readFile(indexPath, "utf8")
const before = html
html = html.split("/assets/DyPOS/pos/").join("/")
if (html !== before) {
	await writeFile(indexPath, html, "utf8")
	console.log("[build-pages] rewrote embedded asset prefix to root paths")
}
