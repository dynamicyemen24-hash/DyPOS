/**
 * No dead EXPORTS — the hole `deadCode.test.js` structurally cannot see.
 *
 * ## The gap, measured
 *
 * `deadCode.test.js` walks imports from the entry points. That is correct for
 * ordinary modules and **blind** to barrels. `WorkScreens.vue` imports five
 * members from `@/components/work`; the BFS resolves that to the barrel file
 * `index.js`, the barrel re-exports 32 members, and every one of them becomes
 * "reachable" — so components totalling thousands of lines ship to every
 * cashier's browser with no template rendering a single one.
 *
 * Reachability answered "can this be imported?" It never asked "is it ever
 * imported?". Those are different questions, and only the second one is the
 * one a user cares about.
 *
 * ## The two ways a component is genuinely consumed
 *
 *   1. A literal tag: `<WorkWizard ...>`.
 *   2. A REGISTRY — `DASHBOARD_REGISTRY` maps an id to
 *      `() => import("./x/X.vue")`, and `DashboardPage` mounts it through
 *      `<component :is="tab.component">`. There is no literal tag anywhere.
 *
 * Ignoring (2) is how this gate produced its FIRST run: all six dashboards
 * were reported dead — 1424 lines of the reporting surface a shop actually
 * uses every day. The mechanism is not a guess; it is read from the source, and
 * a lazy import that resolves to a real file is a live mount, not an excuse.
 *
 * ## What counts as dead
 *
 * A component exported from a `components/**` barrel that appears in NEITHER a
 * literal tag NOR a lazy import. Tests do not count: several of these were
 * "covered" only as `stubs` in a mount — a stub proves nothing about the
 * component, which is why they stayed unused for months.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(process.cwd(), "src")

function walk(dir, out = []) {
	if (!statSync(dir).isDirectory()) return out
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (/\.(vue|js|ts)$/.test(entry)) out.push(full)
	}
	return out
}

const files = walk(SRC)

/** Barrels that re-export components to the rest of the app. */
const barrels = files.filter((f) =>
	/[/\\]components[/\\].*[/\\]index\.(js|ts)$/.test(f),
)

/** component name -> { barrel, spec } so a lazy import can be matched to it. */
const exported = new Map()
for (const barrel of barrels) {
	const text = readFileSync(barrel, "utf8")
	for (const m of text.matchAll(
		/export\s*\{[^}]*?as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']([^"']+\.vue)["']/g,
	)) {
		exported.set(m[1], { barrel, spec: m[2] })
	}
	// A barrel re-exports more than components — `useCashierQueue` is a
	// composable, consumed by `QueuePage.vue` as a plain named import, and the
	// first run of this gate reported it dead for that reason. Only a `.vue`
	// specifier can be RENDERED, so only those are in scope here; the
	// `.js`/`.ts` exports belong to `deadCode.test.js`, which walks imports.
	for (const m of text.matchAll(/export\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
		if (!exported.has(m[1])) exported.set(m[1], { barrel, spec: null })
	}
}

/** Absolute paths reached through a literal `import("./x.vue")` anywhere. */
const lazilyImported = new Set()
for (const file of files) {
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
		const spec = m[1]
		if (!/\.vue$/.test(spec)) continue
		const abs = spec.startsWith(".")
			? resolve(dirname(file), spec)
			: resolve(SRC, spec.replace(/^@\//, ""))
		if (existsSync(abs)) lazilyImported.add(abs)
	}
}

/**
 * The THIRD mechanism, learned from the second false verdict.
 *
 * `router.js` mounts the self-checkout screen with
 *   `() => import("@/components/selfCheckout").then((m) => m.SelfCheckoutScreen)`
 * — a lazy import of a BARREL, then a member read off it. Neither the
 * `.vue`-literal scan above nor a template tag can see it, so the gate
 * reported a 481-line customer-facing screen as dead.
 *
 * Resolution therefore mirrors the barrel probe: an `@/…` spec that is not a
 * file is resolved to `…/index.{js,ts}` and every member it exports counts as
 * mounted, because mounting one of them mounts the module.
 */
for (const file of files) {
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
		const spec = m[1]
		if (/\.vue$/.test(spec)) continue
		const base = spec.startsWith(".")
			? resolve(dirname(file), spec)
			: resolve(SRC, spec.replace(/^@\//, ""))
		for (const cand of [
			base,
			`${base}.js`,
			`${base}.ts`,
			join(base, "index.js"),
			join(base, "index.ts"),
		]) {
			if (!existsSync(cand) || !statSync(cand).isFile()) continue
			lazilyImported.add(cand)
			break
		}
	}
}

/** Every literal component tag used in any template. */
const usedTags = new Set()
for (const file of files) {
	if (!file.endsWith(".vue")) continue
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/<([A-Z][\w.]*)/g)) usedTags.add(m[1])
	for (const m of text.matchAll(/:is\s*=\s*["']([A-Z][\w]*)["']/g))
		usedTags.add(m[1])
	// `.then((m) => m.Member)` — a member read off a lazily imported module.
	for (const m of text.matchAll(
		/\.then\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.(\w+)\s*\)/g,
	))
		usedTags.add(m[1])
}

/** The file a barrel export resolves to, or null when it is a bare export. */
function sourceOf(entry) {
	if (!entry.spec) return null
	const abs = entry.spec.startsWith(".")
		? resolve(entry.barrel, "..", entry.spec)
		: resolve(SRC, entry.spec.replace(/^@\//, ""))
	return existsSync(abs) ? abs : null
}

/**
 * Mounted = a literal tag, or a lazy import of the very file the barrel points at.
 *
 * A `spec: null` export (a composable or a helper, not a component) is NOT this
 * gate's business — `deadCode.test.js` judges reachability of those. Only a
 * barrel export that actually resolves to a `.vue` can be "dead UI".
 */
function isMounted(name, entry) {
	if (usedTags.has(name)) return true
	const source = sourceOf(entry)
	if (!source) return true // not a component export; out of scope
	if (lazilyImported.has(source)) return true
	// Mounted THROUGH its barrel: the route lazily imports the barrel module,
	// and this component is a member of it.
	const barrelFile = entry.barrel
	return lazilyImported.has(barrelFile.replace(/\/index\.(js|ts)$/, ""))
}

describe("no dead component exports", () => {
	it("found barrels, exports and tags (an empty scan is a silent green)", () => {
		expect(barrels.length).toBeGreaterThan(0)
		expect(exported.size).toBeGreaterThan(5)
		expect(usedTags.size).toBeGreaterThan(20)
	})

	it("proves the registry scan is not vacuous", () => {
		// Without this, deleting the whole dynamic-mount mechanism would make
		// the dashboards look dead and the gate would AGREE — for the wrong
		// reason, which is worse than being red.
		expect(lazilyImported.size).toBeGreaterThan(3)
	})

	it("exports no component that is neither rendered nor lazily mounted", () => {
		const dead = [...exported.entries()]
			.filter(([name, entry]) => !isMounted(name, entry))
			.map(([name]) => name)
			.sort()

		expect(
			dead,
			"these components ship (a barrel exports them) but nothing renders or " +
				"mounts them: no literal tag, no lazy import. Wire them up or " +
				"delete them — a component that reaches every cashier's browser to " +
				"display nothing is a defect that compiles green.",
		).toEqual([])
	})
})
