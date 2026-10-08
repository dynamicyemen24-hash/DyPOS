/**
 * DyPOS Pages build (Cloudflare Pages root deployment).
 *
 * Base "/" + PWA scope "/" so the service worker at /sw.js may control /.
 * The default `npm run build` keeps the embedded base (/assets/DyPOS/pos/).
 *
 * Two post-build rewrites, both about identity rather than bytes:
 *  1. Bundled JS/CSS already honor base "/", and POS/index.html declares its
 *     icons root-relative, so the embedded /assets/DyPOS/pos/ prefix is only
 *     normalized away when a link still carries it.
 *  2. The Open Graph / Twitter card is absolutized: social crawlers ignore a
 *     relative og:image, so a shared link was served with no card at all.
 *     The origin is overridable (DYPOS_SITE_ORIGIN) for staging previews.
 */
process.env.DYPOS_PAGES_BUILD = "1"

import { readFile, writeFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { BRAND_CARD } from "../src/utils/brand.js"

const { build } = await import("vite")

// Pages is the root-scoped PWA deployment. VitePWA reads this flag while
// loading vite.config.js; setting only base="/" is not enough because scope,
// start_url, icon prefixes and navigateFallback are derived separately.
process.env.DYPOS_PAGES_BUILD = "1"

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "..", "dist", "pos")

/** Public origin of the deploy. Keep in step with AGENTS.md / verify-live.mjs. */
const SITE_ORIGIN = (
	process.env.DYPOS_SITE_ORIGIN || "https://dypos.smartportssoft.com"
).replace(/\/+$/, "")

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

const manifestPath = path.join(outDir, "manifest.webmanifest")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
if (manifest.scope !== "/" || manifest.start_url !== "/") {
	throw new Error(
		`Pages PWA manifest must be root-scoped; got scope=${manifest.scope} start_url=${manifest.start_url}`,
	)
}
console.log("[build-pages] verified root-scoped manifest.webmanifest")

const indexPath = path.join(outDir, "index.html")
let html = await readFile(indexPath, "utf8")
let rewrote = false

const beforePrefix = html
html = html.split("/assets/DyPOS/pos/").join("/")
if (html !== beforePrefix) {
	rewrote = true
	console.log("[build-pages] rewrote embedded asset prefix to root paths")
}

const beforeCard = html
// Every card reference (og:image + twitter:image) becomes an absolute URL.
html = html
	.split(`content="${BRAND_CARD}"`)
	.join(`content="${SITE_ORIGIN}${BRAND_CARD}"`)
	.replace(/(<meta property="og:url" content=")\/(")/, `$1${SITE_ORIGIN}/$2`)
if (html !== beforeCard) {
	rewrote = true
	console.log(
		`[build-pages] absolutized the social card against ${SITE_ORIGIN}`,
	)
}

if (rewrote) await writeFile(indexPath, html, "utf8")
