import path from "node:path"
import { promises as fs } from "node:fs"
import { existsSync } from "node:fs"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { viteStaticCopy } from "vite-plugin-static-copy"

import {
	APP_NAME,
	APP_TAGLINE,
	BRAND_BACKGROUND_COLOR,
	BRAND_THEME_COLOR,
	COMPANY_NAME_AR,
} from "./src/utils/brand.js"

// ── DyPOS UI Kit (first-party) ──────────────────────────────────────────────
// The kit lives in the repo (POS/packages/dypos-ui) and is aliased in, not
// installed from a registry. It replaced a third-party component+data library
// that dragged in a WYSIWYG editor, an icon font and four chart engines, forced
// a Windows-only postinstall patch on every machine, and shipped a bench-walk
// loop that hung `vite build` before printing anything.
const UI_KIT = path.resolve(import.meta.dirname, "packages", "dypos-ui")

/**
 * Build output root — the single source of truth for "where the PWA lives".
 *
 * It used to be `<repo>/DyPOS/public/pos`, a path that no longer exists (the
 * Frappe app folder was removed) and that four files each re-derived on their
 * own, so a build and its deploy target could silently disagree — which is
 * exactly how a stale bundle reached production. One constant, referenced by
 * every script, exported for tooling.
 */
const OUT_DIR = path.resolve(import.meta.dirname, "dist", "pos")

// Rollup hands `manualChunks` platform-native paths; building the first-party
// kit matcher from path.sep keeps it correct on Windows and POSIX alike.
const sep = path.sep

// Get build version from environment or use timestamp
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const appVersion = require("./package.json").version || "0.0.0"
const buildVersion = process.env.DyPOS_BUILD_VERSION || Date.now().toString()
const enableSourceMap = process.env.DyPOS_ENABLE_SOURCEMAP === "true"

// Dual-target PWA:
// - DyPOS desk embed (default): base /assets/DyPOS/pos/, SW scope under it.
// - Cloudflare Pages root (DYPOS_PAGES_BUILD=1): base /, SW scope /.
// A root scope with a SW script nested under /assets/... is rejected by
// browsers ("scope not under max scope allowed"), so scope must follow base.
const isPagesBuild = process.env.DYPOS_PAGES_BUILD === "1"
const pwaScope = isPagesBuild ? "/" : "/assets/DyPOS/pos/"
const pwaStartUrl = isPagesBuild ? "/" : "/assets/DyPOS/pos/"
const pwaNavigateFallback = isPagesBuild
	? "/index.html"
	: "/assets/DyPOS/pos/index.html"
const pwaIconPrefix = isPagesBuild ? "/" : "/assets/DyPOS/pos/"

/**
 * Post-build font cleanup.
 * 1) Removes the dypos-ui variable Inter fonts (Inter.var / Inter-Italic.var)
 *    that are dead weight in the build and PWA precache.
 * 2) Strips every `.woff` (legacy) fallback from emitted @font-face src lists
 *    and deletes the orphaned `.woff` asset files. Modern browsers all support
 *    woff2; these duplicates cost ~775 KB in the precache (Cairo + Inter).
 */
function stripDeadFontFallbacks() {
	const WOFF_REF = /,\s*url\([^)]*\.woff\)\s+format\(["']woff["']\)/g
	return {
		name: "pos-next-strip-font-fallbacks",
		apply: "build",
		// `sequential` matters: Rollup runs writeBundle hooks in PARALLEL by
		// default, and the prune hook deletes stale hashed files from the same
		// directory. They used to race, so this hook could read a CSS file that
		// prune had already unlinked — an ENOENT that failed an otherwise good
		// build. Sequential + declaration order (strip, then prune) makes the
		// pipeline deterministic.
		writeBundle: {
			order: "post",
			sequential: true,
			async handler() {
				const assetsDir = path.join(OUT_DIR, "assets")

				// 1) Delete the variable-font asset files (unreferenced after CSS strip).
				let removedVar = 0
				for (const file of await fs.readdir(assetsDir)) {
					if (
						file.startsWith("Inter.var-") ||
						file.startsWith("Inter-Italic.var-")
					) {
						await fs.unlink(path.join(assetsDir, file))
						removedVar += 1
					}
				}

				// 2) Drop every @font-face block whose src references the variable fonts,
				//    and strip legacy .woff fallbacks from every emitted CSS file.
				const varPattern =
					/@font-face\{[^{}]*(?:Inter\.var|Inter-Italic\.var)[^{}]*\}/g
				let cssFilesStripped = 0
				let removedWoff = 0
				const woffRefsRemaining = new Set()
				for (const file of await fs.readdir(assetsDir)) {
					if (!file.endsWith(".css")) continue
					const cssPath = path.join(assetsDir, file)
					let css
					try {
						css = await fs.readFile(cssPath, "utf8")
					} catch (error) {
						// A concurrent build step may have removed the file between
						// readdir and readFile. Losing one strip is recoverable;
						// failing the whole build is not.
						if (error?.code === "ENOENT") {
							console.warn(
								`[strip-font-fallbacks] skipped ${file} (removed concurrently)`,
							)
							continue
						}
						throw error
					}
					const next = css.replace(varPattern, "").replace(WOFF_REF, "")
					if (next !== css) {
						await fs.writeFile(cssPath, next, "utf8")
						cssFilesStripped += 1
					}
					// Track any .woff references that are still legitimately used.
					css = next
					const refRe = /url\(([^)]*\.woff)\)/g
					for (let m = refRe.exec(css); m !== null; m = refRe.exec(css)) {
						woffRefsRemaining.add(path.basename(m[1]))
					}
				}

				// 3) Delete orphaned .woff asset files (no longer referenced). woff2 kept.
				for (const file of await fs.readdir(assetsDir)) {
					if (
						file.endsWith(".woff") &&
						!file.endsWith(".woff2") &&
						!woffRefsRemaining.has(file)
					) {
						await fs.unlink(path.join(assetsDir, file))
						removedWoff += 1
					}
				}

				if (removedVar > 0 || cssFilesStripped > 0 || removedWoff > 0) {
					console.log(
						`\n[strip-font-fallbacks] removed ${removedVar} var font(s), ${removedWoff} legacy .woff, stripped ${cssFilesStripped} css file(s)`,
					)
				}
			},
		},
	}
}

/**
 * Vite plugin to prune stale hashed assets left behind by earlier builds.
 *
 * `emptyOutDir` is false on purpose: the output root also holds generated and
 * hand-maintained files (index.html, sw.js, version.json, _headers, icons,
 * manifest.webmanifest, locales/, workers/) that a wipe would destroy. The cost
 * is that `assets/` accumulated one generation of chunks per local build, which
 * caused two real defects:
 *
 *  1. The bundle-budget gate summed orphaned files and reported a false
 *     over-budget failure (905KB stale vs 658KB for the real build).
 *  2. vite-plugin-pwa globs the output dir to build the service-worker precache
 *     manifest, so orphans were precached — customers downloaded dead chunks
 *     into their offline cache.
 *
 * Runs in `writeBundle` (not `buildStart`) so a failed build cannot destroy the
 * last good output, and before VitePWA's `closeBundle` so the precache manifest
 * is generated from the pruned directory. Only files inside `assets/` are
 * touched, and only ones absent from the bundle just emitted.
 */
function pruneStaleAssetsPlugin() {
	return {
		name: "pos-next-prune-stale-assets",
		apply: "build",
		// Sequential and after the font-strip hook (see the note there): the two
		// mutate the same directory, and parallel hooks raced on it.
		writeBundle: {
			order: "post",
			sequential: true,
			async handler(_options, bundle) {
				const assetsDir = path.join(OUT_DIR, "assets")
				if (!existsSync(assetsDir)) return

				const emitted = new Set(Object.keys(bundle))
				let removed = 0
				for (const file of await fs.readdir(assetsDir, {
					withFileTypes: true,
				})) {
					const rel = `assets/${file.name}`
					if (file.isDirectory()) {
						// Keep a subdirectory only if the bundle wrote into it.
						const prefix = `${rel}/`
						const stillUsed = [...emitted].some((f) => f.startsWith(prefix))
						if (!stillUsed) {
							await fs.rm(path.join(assetsDir, file.name), {
								recursive: true,
								force: true,
							})
							removed += 1
						}
						continue
					}
					if (emitted.has(rel)) continue
					await fs.unlink(path.join(assetsDir, file.name))
					removed += 1
				}
				if (removed > 0) {
					console.log(
						`\n[prune-stale-assets] removed ${removed} orphaned file(s) from assets/`,
					)
				}
			},
		},
	}
}

/**
 * Vite plugin to write build version to version.json file
 * This enables cache busting and version tracking.
 * Contract (version single-source gate): `version` MUST be the app semver
 * (package.json), `build` carries the unique build stamp for cache-busting.
 */
function DyPOSBuildVersionPlugin(version, appVersion) {
	return {
		name: "pos-next-build-version",
		apply: "build",
		async writeBundle() {
			const versionFile = path.join(OUT_DIR, "version.json")
			await fs.mkdir(path.dirname(versionFile), { recursive: true })
			await fs.writeFile(
				versionFile,
				JSON.stringify(
					{
						version: appVersion,
						build: version,
						timestamp: new Date().toISOString(),
						buildDate: new Date().toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						}),
					},
					null,
					2,
				),
				"utf8",
			)
			console.log(`\n✓ Build version written: ${version}`)
		},
	}
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		DyPOSBuildVersionPlugin(buildVersion, appVersion),
		vue(),
		viteStaticCopy({
			targets: [
				{
					src: "src/workers",
					dest: ".",
				},
			],
		}),
		stripDeadFontFallbacks(),
		pruneStaleAssetsPlugin(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: [
				"favicon.ico",
				"favicon-16x16.png",
				"favicon-32x32.png",
				"apple-touch-icon.png",
				"android-chrome-192x192.png",
				"android-chrome-512x512.png",
				"smart-ports-og.jpg",
			],
			manifest: {
				// الهوية تأتي من src/utils/brand.js — نفس المصدر الذي يغذّي
				// ترويسة index.html وتذييل الدخول، فلا يختلف اسم المنتج ولا
				// لون العلامة بين مثبّت التطبيق وصفحة الدخول.
				id: pwaStartUrl,
				name: `${APP_NAME} — ${APP_TAGLINE}`,
				short_name: APP_NAME,
				description: `${APP_NAME} — ${APP_TAGLINE} من ${COMPANY_NAME_AR}: فواتير ومخزون لحظي، تشغيل دون اتصال، مستخدمون متعددون، وربط مباشر بنظام ERP`,
				theme_color: BRAND_THEME_COLOR,
				background_color: BRAND_BACKGROUND_COLOR,
				display: "standalone",
				orientation: "any",
				lang: "ar",
				dir: "rtl",
				categories: ["business", "productivity", "shopping"],
				prefer_related_applications: false,
				scope: pwaScope,
				start_url: pwaStartUrl,
				icons: [
					{
						src: `${pwaIconPrefix}android-chrome-192x192.png`,
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: `${pwaIconPrefix}android-chrome-512x512.png`,
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
					{
						src: `${pwaIconPrefix}apple-touch-icon.png`,
						sizes: "180x180",
						type: "image/png",
						purpose: "any",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json}"],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
				navigateFallback: pwaNavigateFallback,
				navigateFallbackDenylist: [/^\/api/, /^\/app/],
				runtimeCaching: [
					// No cross-origin routes on purpose. Flags are platform emoji
					// (src/utils/flags.js) and fonts are local @fontsource files, so
					// the flagcdn / Google Fonts routes were dead config that still
					// let the service worker talk to third-party hosts. Every route
					// below is same-origin.
					{
						urlPattern: /\/assets\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "pos-assets-cache",
							expiration: {
								maxEntries: 500,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
						},
					},
					// Cache product images with StaleWhileRevalidate for better UX
					{
						urlPattern: /\/files\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i,
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: "product-images-cache",
							expiration: {
								maxEntries: 200, // Cache up to 200 product images
								maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /\/api\/.*/i,
						handler: "NetworkFirst",
						options: {
							cacheName: "api-cache",
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: ({ request, url }) =>
							request.mode === "navigate" &&
							(url.pathname === "/" ||
								url.pathname.startsWith("/assets/DyPOS/pos") ||
								url.pathname.startsWith("/account/") ||
								url.pathname.startsWith("/pos")),
						handler: "NetworkFirst",
						options: {
							cacheName: "pos-page-cache",
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 1,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
						},
					},
				],
				cleanupOutdatedCaches: true,
				skipWaiting: true,
				clientsClaim: true,
			},
			devOptions: {
				enabled: true,
				type: "module",
			},
		}),
	],
	build: {
		chunkSizeWarningLimit: 500,
		outDir: OUT_DIR,
		emptyOutDir: false,
		// es2022: top-level await in src/adapters/index.js (backend selector).
		// Baseline 2026: Chrome/Edge 89+, Firefox 89+, Safari 15+ — كل أجهزة الكاشير الحديثة.
		target: "es2022",
		sourcemap: enableSourceMap,
		rollupOptions: {
			output: {
				chunkFileNames: (chunkInfo) => {
					if (chunkInfo.name?.startsWith("dashboard")) {
						return "assets/dashboards/[name]-[hash].js"
					}
					return "assets/[name]-[hash].js"
				},
				// Vendor splitting (millions-scale): stable framework/vendor code gets
				// its own long-cacheable chunks so app-code deploys don't invalidate everything.
				// Budgets: vendor-vue ~180KB, vendor-charts lazy, vendor-print lazy, vendor-realtime lazy.
				manualChunks(id) {
					// The UI kit is first-party (POS/packages/dypos-ui) but behaves like
					// vendor code: it changes rarely, so it earns its own cacheable chunk.
					if (id.includes(`${sep}packages${sep}dypos-ui${sep}`))
						return "vendor-dypos"
					if (!id.includes("node_modules")) return undefined
					if (
						/[\\/]node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)
					) {
						return "vendor-vue"
					}
					if (/[\\/]node_modules[\\/](@vueuse)[\\/]/.test(id)) {
						return "vendor-utils"
					}
					if (/[\\/]node_modules[\\/](dexie|idb|@vertexvis)[\\/]/.test(id)) {
						return "vendor-offline"
					}
					if (/[\\/]node_modules[\\/](chart\.js|vue-chartjs)[\\/]/.test(id)) {
						return "vendor-charts"
					}
					if (
						/[\\/]node_modules[\\/](socket\.io-client|socket\.io-parser|engine\.io-client)[\\/]/.test(
							id,
						)
					) {
						return "vendor-realtime"
					}
					if (/[\\/]node_modules[\\/](qz-tray|feather-icons)[\\/]/.test(id)) {
						return "vendor-print"
					}
					return undefined
				},
			},
		},
	},
	worker: {
		format: "es",
		rollupOptions: {
			output: {
				format: "es",
			},
		},
	},
	resolve: {
		// Regex anchors keep the three entry points exact: a bare `dypos-ui`
		// must never swallow `dypos-ui/style.css` (and vice versa).
		alias: [
			{
				find: /^dypos-ui$/,
				replacement: path.join(UI_KIT, "index.js"),
			},
			{
				find: /^dypos-ui\/tailwind$/,
				replacement: path.join(UI_KIT, "tailwind", "index.js"),
			},
			{
				find: /^dypos-ui\/style\.css$/,
				replacement: path.join(UI_KIT, "style.css"),
			},
			{
				find: "@",
				replacement: path.resolve(import.meta.dirname, "src"),
			},
			{
				find: "tailwind.config.js",
				replacement: path.resolve(import.meta.dirname, "tailwind.config.js"),
			},
		],
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(buildVersion),
		// The semantic version, for surfaces that must SHOW it (the
		// identity card). `__BUILD_VERSION__` is a timestamp — fine for
		// cache-busting, wrong to show a user.
		__APP_VERSION__: JSON.stringify(appVersion),
	},
	optimizeDeps: {
		// Every entry MUST be a declared dependency: the optimizer pre-bundles
		// them eagerly and vite dev fails on an unresolvable one. `feather-icons`
		// backs the kit's icon component, `qz-tray` the print bridge.
		// `tests/buildConfig.test.js` keeps this list honest.
		include: ["feather-icons", "qz-tray"],
	},
	server: {
		allowedHosts: true,
		port: 8080,
		proxy: {
			"^/(app|api|assets|files|printview)": {
				target: "http://127.0.0.1:3002",
				ws: true,
				changeOrigin: true,
				secure: false,
				cookieDomainRewrite: "localhost",
				router: (req) => {
					const site_name = req.headers.host.split(":")[0]
					const isLocalhost =
						site_name === "localhost" || site_name === "127.0.0.1"
					const targetHost = isLocalhost ? "127.0.0.1" : site_name
					return `http://${targetHost}:3002`
				},
			},
		},
	},
	preview: {
		proxy: {},
	},
})
