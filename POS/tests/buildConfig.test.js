/**
 * Build-config integrity gate.
 *
 * The de-branding moved the UI kit from `node_modules/dypos-ui` into the repo
 * (`POS/packages/dypos-ui`) but left three pieces of config pointing at the old
 * location. None of them broke a unit test; each one broke something real:
 *
 *   1. `optimizeDeps.include` still listed `highlight.js` + `interactjs`, which
 *      are not dependencies at all → `vite dev` cannot pre-bundle what does not
 *      resolve.
 *   2. `tailwind.content` still scanned `node_modules/dypos-ui/...` → Tailwind
 *      can no longer see the kit's class names and purges them from the
 *      production CSS (a visual regression that ships silently).
 *   3. The CI "bench-walk" step grepped a package that no longer exists — a gate
 *      that can never fail.
 *
 * This test is the class-level fix: every source path a build config names must
 * exist, and every eagerly pre-bundled module must be a declared dependency.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (...p) => readFileSync(join(POS, ...p), "utf8")

const pkg = JSON.parse(read("package.json"))
const viteConfig = read("vite.config.js")
const tailwindConfig = read("tailwind.config.js")
const headersConfig = read("public/_headers")

/** Quoted path-ish literals that look like a repo-relative glob or folder. */
const configPaths = (source) => {
	const out = []
	for (const m of source.matchAll(/["'](\.\/[^"']+)["']/g)) out.push(m[1])
	return out
}

/** Strip the glob tail so the directory part can be checked for existence. */
const globBase = (pattern) => {
	const cut = pattern.search(/[?*[{]/)
	return (cut === -1 ? pattern : pattern.slice(0, cut)).replace(/\/+$/, "")
}

describe("build config integrity", () => {
	it("every repo path the build config names exists", () => {
		const patterns = [
			...configPaths(viteConfig),
			...configPaths(tailwindConfig),
		]
		expect(patterns.length).toBeGreaterThan(4)
		const missing = patterns
			.map((p) => ({ pattern: p, base: globBase(p) }))
			.filter(({ base }) => !existsSync(join(POS, base)))
		expect(missing).toEqual([])
	})

	it("no build config points at a removed vendor package", () => {
		for (const [name, source] of [
			["vite.config.js", viteConfig],
			["tailwind.config.js", tailwindConfig],
		]) {
			expect(
				source,
				`${name} still references node_modules/dypos-ui`,
			).not.toContain("node_modules/dypos-ui")
		}
	})

	it("tailwind scans the first-party kit (else its classes get purged)", () => {
		expect(tailwindConfig).toContain(
			"./packages/dypos-ui/src/**/*.{vue,js,ts,jsx,tsx}",
		)
	})

	it("optimizeDeps only pre-bundles declared dependencies", () => {
		// Strip line comments first: the block documents itself in prose, and a
		// backtick-quoted name inside a comment is not a dependency.
		const block = viteConfig
			.split("\n")
			.map((line) => line.replace(/\/\/.*$/, ""))
			.join("\n")
			.match(/optimizeDeps:\s*\{([\s\S]*?)\n\s*\},/)
		expect(
			block,
			"optimizeDeps block not found in vite.config.js",
		).not.toBeNull()
		const include = block[1].match(/include:\s*\[([^\]]*)\]/)
		expect(include, "optimizeDeps.include not found").not.toBeNull()
		const entries = [...include[1].matchAll(/["']([^"']+)["']/g)].map(
			(m) => m[1],
		)
		expect(entries.length).toBeGreaterThan(0)
		const declared = new Set([
			...Object.keys(pkg.dependencies || {}),
			...Object.keys(pkg.devDependencies || {}),
		])
		const undeclared = entries.filter((e) => {
			const name = e.startsWith("@")
				? e.split("/").slice(0, 2).join("/")
				: e.split("/")[0]
			return !declared.has(name)
		})
		expect(
			undeclared,
			"optimizeDeps entries must be declared dependencies",
		).toEqual([])
	})

	it("the UI kit is aliased, not installed from a registry", () => {
		expect(pkg.dependencies?.["dypos-ui"]).toBeUndefined()
		expect(pkg.devDependencies?.["dypos-ui"]).toBeUndefined()
		expect(existsSync(join(POS, "packages/dypos-ui/index.js"))).toBe(true)
		// Every import must use the alias, never a deep path into the kit.
		expect(viteConfig).toContain("find: /^dypos-ui$/")
	})

	it("production preview does not proxy built assets to the dev server", () => {
		expect(viteConfig).toMatch(/preview:\s*\{\s*proxy:\s*\{\s*\}/)
	})

	it("service worker is revalidated instead of inheriting immutable JavaScript caching", () => {
		const swRule =
			headersConfig.match(/\/sw\.js\s+([\s\S]*?)(?=\n\S|$)/)?.[1] || ""
		expect(swRule).toContain(
			"Cache-Control: no-cache, max-age=0, must-revalidate",
		)
	})

	it("Cloudflare Pages build switches the PWA to root scope", () => {
		const pagesBuild = readFileSync(
			join(POS, "scripts/build-pages.mjs"),
			"utf8",
		)
		expect(pagesBuild).toContain("process.env.DYPOS_PAGES_BUILD = \"1\"")
		expect(pagesBuild).toContain('base: "/"')
	})

	it("service-worker update notices use the live release feed when linkage is enabled", () => {
		const updater = readFileSync(
			join(POS, "src/composables/useAppUpdate.js"),
			"utf8",
		)
		expect(updater).toContain("/api/updates/latest")
		expect(updater).not.toContain("/assets/DyPOS/pos/release.json")
		expect(updater).toContain("isLinkEnabled")
	})

	it("does not cache tenant-scoped API responses in the service worker", () => {
		expect(viteConfig).toMatch(/urlPattern:\s*\/\\\/api\\\/\.\*\/i,\s*handler:\s*"NetworkOnly"/)
		expect(viteConfig).not.toContain('cacheName: "api-cache"')
	})
})
