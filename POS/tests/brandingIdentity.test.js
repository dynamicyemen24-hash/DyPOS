/**
 * Brand identity gate — the offline PWA's face: tab icon, install icon, the
 * card a shared link shows, and the credit at the bottom of the auth screens.
 *
 * All of it used to rot silently, in three independent places:
 *
 *   1. POS/index.html pointed its icons at `/assets/DyPOS/pos/…`, a prefix that
 *      exists only in the embedded build — the dev server and the Pages build
 *      answered 404/500 for the favicon, the manifest and the card.
 *   2. The card was a relative `og:image`, which social crawlers ignore: a
 *      shared production link carried no image at all.
 *   3. The install banner drew a generic receipt on an emerald tile, and the
 *      auth footers read "© … جميع الحقوق محفوظة" — naming no company and
 *      linking to nowhere, so the vendor was unreachable from the app.
 *
 * The contract is now: brand.js is the only place the identity is spelled out,
 * and this test holds every surface to it (and to the files in public/).
 */
import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
	APP_NAME,
	APP_TAGLINE,
	BRAND_CARD,
	BRAND_CARD_HEIGHT,
	BRAND_CARD_TYPE,
	BRAND_CARD_WIDTH,
	BRAND_THEME_COLOR,
	COMPANY_NAME_AR,
	COMPANY_NAME_EN,
	COMPANY_WEBSITE,
	COMPANY_WEBSITE_LABEL,
} from "@/utils/brand"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const REPO = resolve(POS, "..")
const PUBLIC = join(POS, "public")
/** The untouched company assets (git history shows them renamed out of imag/). */
const OFFICIAL = join(REPO, "docs", "assets", "branding")

const read = (...parts) => readFileSync(join(...parts), "utf8")
const indexHtml = read(POS, "index.html")
const viteConfig = read(POS, "vite.config.js")
const buildPages = read(POS, "scripts", "build-pages.mjs")
const companyFooter = read(
	POS,
	"src",
	"components",
	"common",
	"CompanyFooter.vue",
)
const sha = (file) =>
	createHash("sha256").update(readFileSync(file)).digest("hex")

/** href/content values the browser (or a crawler) fetches straight away. */
const headReferences = (source) =>
	[...source.matchAll(/(?:href|content)="(\/[^"]+)"/g)].map((m) => m[1])

/**
 * Written by the build, not shipped in public/: vite-plugin-pwa emits the
 * manifest into the output root (and serves it in dev through devOptions).
 * Every other head reference must be a real file — that is the 404/500 class.
 */
const GENERATED = new Set(["/manifest.webmanifest"])

const publicFiles = () =>
	readdirSync(PUBLIC).filter((name) =>
		/\.(png|ico|jpg|svg|webmanifest)$/.test(name),
	)

describe("brand identity: head references resolve to real files", () => {
	it("every root-relative head reference exists in public/", () => {
		// The exact defect: an icon the server cannot serve. Public files are
		// the only ones a bare "/name" can reach — no bundler rewrites them.
		const missing = headReferences(indexHtml)
			.filter((ref) => ref !== "/" && !GENERATED.has(ref))
			.filter((ref) => !existsSync(join(PUBLIC, ref)))
			.map((ref) => `${ref} (declared in index.html, absent in public/)`)
		expect(missing).toEqual([])
	})

	it("declares the favicon, the iOS icon and the installable manifest", () => {
		expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico"')
		expect(indexHtml).toContain('rel="apple-touch-icon"')
		expect(indexHtml).toContain('sizes="180x180"')
		expect(indexHtml).toContain(
			'<link rel="manifest" href="/manifest.webmanifest"',
		)
	})

	it("ships the official favicon byte-for-byte", () => {
		// Re-encoding or replacing favicon.ico is a silent identity change: it
		// is what the browser tab and the desktop shortcut show.
		expect(existsSync(join(OFFICIAL, "favicon.ico"))).toBe(true)
		expect(sha(join(PUBLIC, "favicon.ico"))).toBe(
			sha(join(OFFICIAL, "favicon.ico")),
		)
	})

	it("keeps every shipped icon traceable to an official asset", () => {
		const orphans = publicFiles()
			.filter((name) => !existsSync(join(OFFICIAL, name)))
			.map((name) => `${name} has no counterpart in docs/assets/branding/`)
		expect(orphans).toEqual([])
	})
})
describe("brand identity: the company card is usable when shared", () => {
	it("points og:image and twitter:image at the company card", () => {
		expect(indexHtml).toContain(`property="og:image" content="${BRAND_CARD}"`)
		expect(indexHtml).toContain(`name="twitter:image" content="${BRAND_CARD}"`)
	})

	it("declares the card's real dimensions and type", () => {
		// Crawlers size the card from these; guessing is how a 1200×630 JPEG
		// ends up rendered as an 88px thumbnail.
		expect(indexHtml).toContain(
			`property="og:image:width" content="${BRAND_CARD_WIDTH}"`,
		)
		expect(indexHtml).toContain(
			`property="og:image:height" content="${BRAND_CARD_HEIGHT}"`,
		)
		expect(indexHtml).toContain(
			`property="og:image:type" content="${BRAND_CARD_TYPE}"`,
		)
		expect(indexHtml).toContain('property="og:image:alt"')
		expect(indexHtml).toContain('name="twitter:image:alt"')
	})

	it("names the company (not the app) as the site", () => {
		expect(indexHtml).toContain(
			`property="og:site_name" content="${COMPANY_NAME_EN}"`,
		)
		expect(indexHtml).toContain(
			`property="og:title" content="${APP_NAME} — ${APP_TAGLINE}"`,
		)
		expect(indexHtml).toContain('property="og:locale" content="ar_SA"')
		expect(indexHtml).toContain('property="og:direction" content="rtl"')
	})

	it("publishes the card as a real, non-empty file", () => {
		const card = join(PUBLIC, BRAND_CARD)
		expect(existsSync(card)).toBe(true)
		expect(statSync(card).size).toBeGreaterThan(10_000)
	})

	it("does not let the login background drift from the shared card", () => {
		// The brand panel imports src/assets/smart-ports-og.jpg while every meta
		// tag and the service worker precache read public/ — two copies, so they
		// must be proven identical rather than assumed to be.
		const bundled = join(POS, "src", "assets", "smart-ports-og.jpg")
		expect(existsSync(bundled)).toBe(true)
		expect(sha(bundled)).toBe(sha(join(PUBLIC, BRAND_CARD)))
	})

	it("absolutizes the card against the production origin at deploy time", () => {
		// A relative og:image is invisible to crawlers, and that rewrite lives in
		// exactly one script — asserted here so it cannot be dropped silently.
		expect(buildPages).toContain("https://dypos.smartportssoft.com")
		expect(buildPages).toContain("DYPOS_SITE_ORIGIN")
		expect(buildPages).toContain("BRAND_CARD")
		expect(buildPages).toContain('property="og:url"')
	})
})
describe("brand identity: the installable app presents the DyPOS icon", () => {
	const manifestBlock = () => {
		const start = viteConfig.indexOf("manifest: {")
		expect(start, "manifest block not found in vite.config.js").toBeGreaterThan(
			-1,
		)
		return viteConfig.slice(start, viteConfig.indexOf("workbox: {"))
	}

	it("takes its name, tagline and theme color from brand.js", () => {
		const block = manifestBlock()
		expect(block).toContain("short_name: APP_NAME")
		expect(block).toContain("name: `${APP_NAME} — ${APP_TAGLINE}`")
		expect(block).toContain("theme_color: BRAND_THEME_COLOR")
		expect(block).toContain(
			"description: `${APP_NAME} — ${APP_TAGLINE} من ${COMPANY_NAME_AR}",
		)
	})

	it("declares an Arabic, right-to-left install surface", () => {
		const block = manifestBlock()
		expect(block).toContain('lang: "ar"')
		expect(block).toContain('dir: "rtl"')
	})

	it("names only icons that exist in public/", () => {
		const names = [
			...manifestBlock().matchAll(/([a-z0-9-]+\.(?:png|ico|svg))/g),
		].map((m) => m[1])
		expect(names.length).toBeGreaterThan(0)
		const missing = names
			.filter((name) => !existsSync(join(PUBLIC, name)))
			.map((name) => `${name} is in the manifest but not in public/`)
		expect(missing).toEqual([])
	})

	it("shows the same icon in the manifest, without a second copy", () => {
		// The install-prompt UI (InstallAppBadge + usePWAInstall) was removed as
		// dead code: nothing ever mounted it, so the app had no in-app prompt and
		// the file only added a second, unbranded rendering of the icon. The
		// install path that remains is the browser's own: manifest + service
		// worker, both asserted here.
		expect(existsSync(join(PUBLIC, "android-chrome-192x192.png"))).toBe(true)
		expect(
			existsSync(
				join(POS, "src", "components", "common", "InstallAppBadge.vue"),
			),
		).toBe(false)
	})

	it("serves the manifest with the content type browsers require", () => {
		const headers = read(PUBLIC, "_headers")
		expect(headers).toMatch(
			/\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/,
		)
	})
})

describe("brand identity: the company's official website is reachable", () => {
	it("spells out the vendor once, in brand.js", () => {
		expect(COMPANY_WEBSITE).toBe("https://smartportssoft.com/")
		expect(COMPANY_WEBSITE_LABEL).toBe("smartportssoft.com")
		expect(COMPANY_NAME_AR).toBe("شركة المنافذ الذكية للبرمجيات")
		expect(COMPANY_NAME_EN).toBe("Smart Ports Software")
		expect(APP_NAME).toBe("DyPOS")
	})

	it("links the footer to the site, safely", () => {
		expect(companyFooter).toContain(':href="COMPANY_WEBSITE"')
		expect(companyFooter).toContain('target="_blank"')
		expect(companyFooter).toContain('rel="noopener noreferrer"')
		expect(companyFooter).toContain("{{ COMPANY_WEBSITE_LABEL }}")
		expect(companyFooter).toContain("{{ COMPANY_NAME_AR }}")
	})

	it("keeps explicit brand identity on both auth screens", () => {
		for (const page of ["Login.vue", "Register.vue"]) {
			const source = read(POS, "src", "pages", `${page}`)
			expect(source, `${page} must reference the DyPOS brand`).toMatch(
				/DyPOSLogo|APP_NAME|COMPANY_NAME/,
			)
		}
	})
})
