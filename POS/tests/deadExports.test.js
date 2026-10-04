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

/**
 * component name -> { barrel, spec } so a lazy import can be matched to it.
 *
 * ## Determinism — the first version of this gate was NOT
 *
 * `exported.set(name, …)` on a bare `Map` meant that whichever barrel was
 * visited LAST won. `readdirSync` order is filesystem-dependent, so on CI
 * (ext4, different inode order) the `queue/index.ts` barrel could be visited
 * after `selfCheckout/index.js`, and `SelfCheckoutScreen` was reported dead
 * there and alive on a Windows laptop. **The same commit passed locally and
 * failed in production** — the worst possible shape for a gate, because a red
 * deploy reads as "the product is broken".
 *
 * The fix is not sorting: it is refusing to guess. Every barrel that offers a
 * name is COLLECTED, and a component is dead only when NO barrel entry can
 * account for it. Order then cannot change the verdict.

/**
 * EVERY barrel that offers a given name, with the specs it points at.
 *
 * A name can live in more than one barrel (`work/index.js` re-exports members
 * that `work/index.ts`-style barrels also list), and a single `Map` entry keeps
 * only one of them. Which one survives depends on `readdirSync` order, which is
 * filesystem-dependent — so the CI runner and a laptop disagreed, and CI was
 * the one that said "dead". Collect them all and the order stops mattering.
 */
const barrelsByName = new Map()
for (const barrel of barrels) {
	const text = readFileSync(barrel, "utf8")
	for (const m of text.matchAll(
		/export\s*\{[^}]*?as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']([^"']+\.vue)["']/g,
	)) {
		if (!barrelsByName.has(m[1])) barrelsByName.set(m[1], [])
		barrelsByName.get(m[1]).push([barrel, m[2]])
	}
}

/**
 * Resolve a barrel's specifier to a real file, or null.
 *
 * The spec is relative TO THE BARREL'S OWN DIRECTORY — `./sales/Sales.vue`
 * from `reports/dashboards/index.js` means
 * `reports/dashboards/sales/Sales.vue`. The first version inserted a `".."`
 * before it, which resolved every dashboard one directory too high, made
 * `existsSync` false, and turned all six live dashboards into "dead" again.
 */
function resolveSpec(barrel, spec) {
	const abs = spec.startsWith(".")
		? resolve(dirname(barrel), spec)
		: resolve(SRC, spec.replace(/^@\//, ""))
	return existsSync(abs) ? abs : null
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

describe("no dead component exports", () => {
	it("found barrels, exports and tags (an empty scan is a silent green)", () => {
		expect(barrels.length).toBeGreaterThan(0)
		expect(barrelsByName.size).toBeGreaterThan(5)
		expect(usedTags.size).toBeGreaterThan(20)
	})

	it("proves the registry scan is not vacuous", () => {
		// Without this, deleting the whole dynamic-mount mechanism would make
		// the dashboards look dead and the gate would AGREE — for the wrong
		// reason, which is worse than being red.
		expect(lazilyImported.size).toBeGreaterThan(3)
	})

	it("verdicts do not depend on directory-read order", () => {
		// The CI failure this pins: the gate said "dead" on the runner and
		// "alive" on a laptop for the SAME commit, because `readdirSync` order
		// decided which barrel entry survived. A gate whose answer changes with
		// the filesystem is worse than no gate — it teaches the team to
		// re-run until green, which is exactly how a real defect survives.
		const forward = judge([...barrels])
		const reversed = judge([...barrels].reverse())
		expect(reversed).toEqual(forward)
		expect(forward).toEqual([])
	})

	it("exports no component that is neither rendered nor lazily mounted", () => {
		expect(
			judge(barrels),
			"these components ship (a barrel exports them) but nothing renders or " +
				"mounts them: no literal tag, no lazy import. Wire them up or " +
				"delete them — a component that reaches every cashier's browser to " +
				"display nothing is a defect that compiles green.",
		).toEqual([])
	})

	it("would still catch a component that is genuinely dead", () => {
		// Determinism is worthless if the verdict is always empty. This feeds
		// the SAME judge a synthetic barrel whose component has no tag, no lazy
		// import and no sibling that could mount it, and demands a verdict.
		const fakeBarrel = join(SRC, "components", "work", "__probe__.index.js")
		const collected = new Map()
		collected.set("TotallyUnmountedWidget", [[fakeBarrel, "./__probe__.vue"]])
		const verdict = judgeCollected(collected)
		expect(verdict).toEqual(["TotallyUnmountedWidget"])
	})
})

/** The dead-export verdict from an already-collected name → barrels map. */
function judgeCollected(collected) {
	const dead = []
	for (const [name, entries] of collected) {
		if (usedTags.has(name)) continue
		const mounted = entries.some(([barrel, spec]) => {
			const source = resolveSpec(barrel, spec)
			if (source && lazilyImported.has(source)) return true
			const base = barrel.replace(/[/\\]index\.(js|ts)$/, "")
			return lazilyImported.has(barrel) || lazilyImported.has(base)
		})
		if (!mounted) dead.push(name)
	}
	return dead.sort()
}

/** The dead-export verdict for a given barrel visiting order. */
function judge(barrelOrder) {
	const collected = new Map()
	for (const barrel of barrelOrder) {
		const text = readFileSync(barrel, "utf8")
		for (const m of text.matchAll(
			/export\s*\{[^}]*?as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']([^"']+\.vue)["']/g,
		)) {
			if (!collected.has(m[1])) collected.set(m[1], [])
			collected.get(m[1]).push([barrel, m[2]])
		}
	}
	return judgeCollected(collected)
}
