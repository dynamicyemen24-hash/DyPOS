import path from "node:path"
import { promises as fs } from "node:fs"
import vue from "@vitejs/plugin-vue"
import frappeui from "frappe-ui/vite"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { viteStaticCopy } from "vite-plugin-static-copy"

// Get build version from environment or use timestamp
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const appVersion = require("./package.json").version || "0.0.0"
const buildVersion = process.env.DyPOS_BUILD_VERSION || Date.now().toString()
const enableSourceMap = process.env.DyPOS_ENABLE_SOURCEMAP === "true"

// Dual-target PWA:
// - Frappe desk embed (default): base /assets/DyPOS/pos/, SW scope under it.
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
 * 1) Removes the frappe-ui variable Inter fonts (Inter.var / Inter-Italic.var)
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
		async writeBundle() {
			const outDir = path.resolve(import.meta.dirname, "../DyPOS/public/pos")
			const assetsDir = path.join(outDir, "assets")

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
				let css = await fs.readFile(cssPath, "utf8")
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
			const versionFile = path.resolve(
				import.meta.dirname,
				"../DyPOS/public/pos/version.json",
			)
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
		frappeui({
			frappeProxy: true,
			jinjaBootData: true,
			lucideIcons: true,
			buildConfig: {
				indexHtmlPath: path.join("..", "DyPOS", "www", "pos.html"),
				// مطلق عمدًا: حماية من انحراف الإخراج مع اختلاف دليل التشغيل
				outDir: path.resolve(
					import.meta.dirname,
					"..",
					"DyPOS",
					"public",
					"pos",
				),
				emptyOutDir: false,
				sourcemap: enableSourceMap,
			},
		}),
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
				name: "DyPOS",
				short_name: "DyPOS",
				description:
					"Point of Sale system with real-time billing, stock management, and offline support",
				theme_color: "#1E40AF",
				background_color: "#ffffff",
				display: "standalone",
				lang: "ar",
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
					{
						urlPattern: /^https:\/\/flagcdn\.com\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "flags-cache",
							expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "google-fonts-cache",
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "gstatic-fonts-cache",
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
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
		outDir: path.resolve(import.meta.dirname, "..", "DyPOS", "public", "pos"),
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
					if (/[\\/]node_modules[\\/](frappe-ui)[\\/]/.test(id)) {
						return "vendor-frappe"
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
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
			"tailwind.config.js": path.resolve(
				import.meta.dirname,
				"tailwind.config.js",
			),
		},
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(buildVersion),
	},
	optimizeDeps: {
		// Note: these mirror the exact modules the app imports (see src/utils/qzTray.js,
		// components that pull feather-icons via frappe-ui, highlight.js/interactjs from
		// dependency trees). `showdown` was removed — it is not used anywhere.
		include: [
			"feather-icons",
			"highlight.js/lib/core",
			"interactjs",
			"qz-tray",
		],
	},
	server: {
		allowedHosts: true,
		port: 8080,
		proxy: {
			"^/(app|api|assets|files|printview)": {
				target: "http://127.0.0.1:8000",
				ws: true,
				changeOrigin: true,
				secure: false,
				cookieDomainRewrite: "localhost",
				router: (req) => {
					const site_name = req.headers.host.split(":")[0]
					const isLocalhost =
						site_name === "localhost" || site_name === "127.0.0.1"
					const targetHost = isLocalhost ? "127.0.0.1" : site_name
					return `http://${targetHost}:8000`
				},
			},
		},
	},
})
