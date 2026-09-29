/**
 * Work-screen wiring gate.
 *
 * The nav config (`components/work/workNav.js`) points at routes **by name**,
 * so a name that no route declares renders a dead link with no build error and
 * no console error — the user simply never arrives. That is exactly what
 * happened: `WorkScreens` was in the nav while no route existed, and the
 * settings gear emitted `settings-clicked` with no listener, leaving the whole
 * general-settings surface unreachable.
 *
 * These tests pin the wiring instead of the intention:
 *   1. every nav target resolves to a declared route name;
 *   2. every nav target route exists with the right path + auth guard;
 *   3. the screen registry is coherent (ids, permissions, columns, loaders);
 *   4. the settings entry point is actually mounted by the POS header.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
	WORK_NAV_SECTIONS,
	flatWorkNav,
	isNavActive,
} from "@/components/work/workNav"
import { WORK_SCREENS, workScreenById } from "@/data/workScreens"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (...parts) => readFileSync(join(POS, ...parts), "utf8")

const routerSource = read("src", "router.js")
const posSaleSource = read("src", "pages", "POSSale.vue")

/** `KEY: "Value"` pairs of the frozen ROUTE_NAMES map. */
const routeNameMap = () => {
	const block = routerSource.match(
		/const ROUTE_NAMES = Object\.freeze\(\{([\s\S]*?)\}\)/,
	)
	expect(block, "ROUTE_NAMES block not found in router.js").not.toBeNull()
	return new Map(
		[...block[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
	)
}

/**
 * The routes table, resolved: `path: "/work", name: ROUTE_NAMES.WORK_SCREENS`
 * becomes `{ path: "/work", name: "WorkScreens", block }`. Reading the *table*
 * (not the whole file) is what makes the guard meaningful — a name that only
 * appears in ROUTE_TITLES would otherwise look declared.
 */
const routeEntries = () => {
	const names = routeNameMap()
	const table = routerSource.match(/const routes = \[([\s\S]*?)\n\]\n/)
	expect(table, "routes table not found in router.js").not.toBeNull()
	return [...table[1].matchAll(/\{([\s\S]*?)\n\t\}/g)].map((m) => {
		const block = m[1]
		const path = block.match(/path:\s*"([^"]+)"/)?.[1] ?? ""
		const rawName = block.match(/name:\s*([A-Za-z0-9_.]+)/)?.[1] ?? ""
		const meta = block.match(/meta:\s*\{([\s\S]*?)\}/)?.[1] ?? ""
		return {
			path,
			name: rawName.startsWith("ROUTE_NAMES.")
				? (names.get(rawName.slice("ROUTE_NAMES.".length)) ?? rawName)
				: rawName,
			requiresAuth: meta.includes("requiresAuth"),
			block,
		}
	})
}

describe("work-screen navigation is wired to real routes", () => {
	it("every nav target is a declared route name", () => {
		const declared = new Set(
			routeEntries()
				.map((r) => r.name)
				.filter(Boolean),
		)
		const dangling = flatWorkNav()
			.map((item) => item.to?.name)
			.filter(Boolean)
			.filter((name) => !declared.has(name))
			.map((name) => `${name} is in workNav.js but not in the routes table`)
		expect(dangling).toEqual([])
	})

	it("every nav target resolves to a real path", () => {
		const byName = new Map(routeEntries().map((r) => [r.name, r.path]))
		const missing = flatWorkNav()
			.map((item) => item.to?.name)
			.filter(Boolean)
			.filter((name) => !byName.get(name))
			.map((name) => `${name} has no path in the routes table`)
		expect(missing).toEqual([])
	})

	it("the work screens and settings routes exist, are reachable and guarded", () => {
		const entries = routeEntries()
		for (const [name, path] of [
			["WorkScreens", "/work"],
			["Settings", "/settings"],
		]) {
			const route = entries.find((entry) => entry.name === name)
			expect(route, `${name} must be declared in the routes table`).toBeTruthy()
			expect(route.path).toBe(path)
			expect(route.requiresAuth, `${path} must require authentication`).toBe(
				true,
			)
			// Lazy-loaded so the work kit never lands in the POS sale bundle.
			expect(route.block).toContain("() => import(")
		}
	})

	it("offers settings and the work screens in the nav", () => {
		const targets = flatWorkNav().map((item) => item.to?.name)
		expect(targets).toContain("WorkScreens")
		expect(targets).toContain("Settings")
	})

	it("marks the active item from the route, including the screen query", () => {
		const invoices = flatWorkNav().find(
			(item) => item.to?.query?.screen === "invoices",
		)
		expect(invoices, "the invoices nav item must exist").toBeTruthy()
		expect(
			isNavActive(invoices, {
				name: "WorkScreens",
				query: { screen: "invoices" },
			}),
		).toBe(true)
		expect(
			isNavActive(invoices, {
				name: "WorkScreens",
				query: { screen: "items" },
			}),
		).toBe(false)
	})
})

describe("work-screen registry is coherent", () => {
	it("every screen declares id, label, permission, columns and a loader", () => {
		expect(WORK_SCREENS.length).toBeGreaterThanOrEqual(3)
		for (const screen of WORK_SCREENS) {
			expect(screen.id, "screen id").toBeTruthy()
			expect(screen.label, `${screen.id} label`).toBeTruthy()
			expect(screen.permission, `${screen.id} permission`).toMatch(/^work\./)
			expect(Array.isArray(screen.columns), `${screen.id} columns`).toBe(true)
			expect(
				screen.columns.length,
				`${screen.id} needs columns`,
			).toBeGreaterThan(0)
			for (const column of screen.columns) {
				expect(column.key, `${screen.id} column key`).toBeTruthy()
				expect(column.label, `${screen.id}.${column.key} label`).toBeTruthy()
			}
			expect(typeof screen.load, `${screen.id} loader`).toBe("function")
		}
	})

	it("ids and permissions are unique", () => {
		const ids = WORK_SCREENS.map((s) => s.id)
		expect(new Set(ids).size).toBe(ids.length)
		const permissions = WORK_SCREENS.map((s) => s.permission)
		expect(new Set(permissions).size).toBe(permissions.length)
	})

	it("falls back to a real screen for an unknown id (never undefined)", () => {
		expect(workScreenById("does-not-exist").id).toBe(WORK_SCREENS[0].id)
		expect(workScreenById("items").id).toBe("items")
	})
})

describe("the general settings screen is reachable from the POS", () => {
	it("the header gear has a listener (settings-clicked is not a dead emit)", () => {
		expect(POSHeaderEmits()).toBe(true)
		expect(posSaleSource).toContain('@settings-clicked="goToSettings"')
		expect(posSaleSource).toContain(':show-settings="true"')
	})

	it("the settings route hosts the settings component and closes back", () => {
		const settingsPage = read("src", "pages", "SettingsPage.vue")
		expect(settingsPage).toContain("POSSettings")
		// The event must be the one the CHILD actually emits.
		//
		// This assertion used to require `@close="goBack"`, but `POSSettings`
		// declares `defineEmits(["update:modelValue"])` and never emits `close` —
		// so the listener it required was a dead contract: a handler wired to an
		// event that cannot fire, i.e. a close button that does nothing. It
		// passed while the real defect was live, because the same page passed
		// `:show` instead of `:model-value` and the overlay never rendered at all
		// (see tests/settingsPage.test.js for the rendered-output guard).
		//
		// Pinning the wiring to the emitted event is what makes "closes back"
		// true rather than merely present in the source.
		expect(settingsPage).toContain('@update:model-value="goBack"')
		// And the prop the overlay really declares, so the surface is not blank.
		expect(settingsPage).toContain(':model-value="true"')
		// A re-introduction of the dead `close` listener must fail here too.
		expect(settingsPage).not.toContain('@close="goBack"')
	})
})

describe("the work-screens page actually renders (compiled + fed)", () => {
	beforeEach(() => {
		vi.doMock("@/utils/methodClient", () => ({
			methodGetListWithSource: vi.fn().mockResolvedValue({
				rows: [
					{
						name: "INV-0001",
						customer_name: "عميل",
						posting_date: "2026-09-27",
						grand_total: 120.5,
						status: "Paid",
					},
				],
				source: "server",
				error: null,
			}),
		}))
		// The page uses the composition API, so `$route` mocks do not reach it —
		// vue-router itself is partially mocked (the real module still has to
		// provide createRouter, which src/data/user.js → src/router.js needs).
		const router = {
			replace: vi.fn(),
			push: vi.fn(),
			back: vi.fn(),
		}
		vi.doMock("vue-router", async (importOriginal) => {
			const actual = await importOriginal()
			return {
				...actual,
				useRoute: () => ({
					query: { screen: "invoices" },
					name: "WorkScreens",
				}),
				useRouter: () => router,
			}
		})
		vi.resetModules()
		// happy-dom has no matchMedia; WorkShell reads prefers-reduced-motion
		// on mount. A browser always has it, so this is an env gap, not a bug.
		if (!window.matchMedia) {
			window.matchMedia = (query) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
				dispatchEvent: () => false,
			})
		}
	})

	it("mounts, loads rows through the provenance contract and shows the label", async () => {
		const { mount, flushPromises } = await import("@vue/test-utils")
		const { default: WorkScreens } = await import("@/pages/WorkScreens.vue")

		const wrapper = mount(WorkScreens, {
			global: {
				stubs: { transition: true, "transition-group": true },
				// The shell renders router-link for every nav entry.
				components: {
					"router-link": { template: "<a><slot /></a>" },
				},
			},
		})

		// The screen loads asynchronously, then re-renders. Poll instead of
		// guessing a flush count — a fixed count passed/failed on scheduling luck.
		// The budget is generous on purpose: importing the whole kit costs seconds
		// when the suite runs in parallel, and a tight budget fails on load, not on
		// behaviour.
		const settle = async () => {
			for (let attempt = 0; attempt < 200; attempt++) {
				await flushPromises()
				if (wrapper.html().includes("INV-0001")) return true
				await new Promise((resolve) => setTimeout(resolve, 25))
			}
			return false
		}

		expect(await settle(), "the loaded invoice must reach the grid").toBe(true)
		expect(wrapper.html(), "the screen label must render").toContain("الفواتير")
		wrapper.unmount()
	}, 30_000)

	it("mounts the data grid without undeclared template bindings", async () => {
		const { mount } = await import("@vue/test-utils")
		const { default: WorkDataGrid } = await import(
			"@/components/work/WorkDataGrid.vue"
		)
		const wrapper = mount(WorkDataGrid, {
			props: {
				columns: [
					{ key: "name", label: "الاسم", filterable: true },
					{ key: "status", label: "الحالة", frozen: "right" },
				],
				rows: [],
			},
			global: {
				stubs: {
					WorkSearch: true,
					WorkActions: true,
					WorkPagination: true,
					WorkEmptyState: true,
					WorkCard: true,
					HeaderRow: true,
					DataRow: true,
					GroupHeader: true,
					ColumnFilter: true,
					InlineEditCell: true,
					FeatherIcon: true,
				},
			},
		})

		expect(wrapper.findAll(".work-data-grid__filter-cell")).toHaveLength(2)
		expect(
			wrapper.find(".work-data-grid__empty-cell").attributes("colspan"),
		).toBe("2")
		wrapper.unmount()
	})
})

function POSHeaderEmits() {
	return read("src", "components", "pos", "POSHeader.vue").includes(
		'"settings-clicked"',
	)
}
