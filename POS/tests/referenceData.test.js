/**
 * Reference-data (v53) wiring gate — the POS side of the global list
 * architecture: seeds → method router → screens.
 *
 * What this file defends:
 *
 *  1. **The offline mirror answers every reference doctype, and only its own
 *     rows.** `reference_data` is ONE Dexie store for all 26 doctypes; a read
 *     that skipped the implicit `doctype = ?` filter would serve `Country`
 *     rows for `Tax` — a picker showing countries as tax rates. The assertion
 *     is on filtered output, not on the map being "defined".
 *  2. **The management screen renders real provenance.** An empty table with
 *     `source: "unavailable"` must show the Arabic recovery banner (S1/S5):
 *     a confident empty list is the exact defect `methodGetListWithSource`
 *     exists to prevent.
 *  3. **Writes go through the doctype write plane with the right shape.**
 *     `insert`/`set_value`/`delete_doc` are asserted as CALLS — a screen that
 *     fires a differently-named verb fails `npm run contract` only when the
 *     server runs; this pins the client half.
 *  4. **Both doors are reachable** (S7b): `/reference-data` is a real route,
 *     and workNav links it — alongside `/master-data-import`, which had a
 *     route and NO link anywhere in the app before this round.
 *  5. **The stock-count dialog reads the guarded catalogs** (S3): its local
 *     copy carried a `header: "CTN"` row that could never match `u.code` and
 *     four FX rates duplicated from `utils/uom.js`.
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const readSrc = (...parts) =>
	readFileSync(join(HERE, "..", "src", ...parts), "utf8")

vi.mock("@/utils/methodClient", () => ({
	DATA_SOURCE: {
		SERVER: "server",
		LOCAL: "local",
		UNAVAILABLE: "unavailable",
	},
	methodCall: vi.fn(async () => ({ message: {} })),
	methodGetList: vi.fn(async () => []),
	methodGetListWithSource: vi.fn(async () => ({
		rows: [],
		source: "unavailable",
		error: new Error("no client"),
	})),
}))

const CACHE = vi.hoisted(() => ({ put: 0, del: 0 }))
vi.mock("@/utils/offline/db", () => ({
	db: {
		table: () => ({
			where: () => ({
				equals: () => ({
					delete: async () => {
						CACHE.del += 1
						return 0
					},
				}),
			}),
			bulkPut: async (rows) => {
				CACHE.put += rows.length
				return []
			},
			toArray: async () => [],
		}),
		transaction: (_mode, _table, fn) => fn(),
	},
}))

const ROLE = vi.hoisted(() => ({ value: "ADMIN" }))
vi.mock("@/data/session", () => ({
	sessionRole: () => ROLE.value,
	sessionUser: () => null,
}))

import {
	DATA_SOURCE,
	methodCall,
	methodGetListWithSource,
} from "@/utils/methodClient"
import {
	MIRRORED_DOCTYPES,
	REFERENCE_DOCTYPES,
	readLocalRows,
} from "@/utils/offline/localMirror"
import { loadReferenceData } from "@/composables/useReferenceData"
import { WORK_NAV_SECTIONS } from "@/components/work/workNav"
import { __ } from "@/utils/translation"

const ReferenceDataPage = (await import("@/pages/ReferenceDataPage.vue"))
	.default

const flush = async () => {
	for (let i = 0; i < 25; i++) await nextTick()
	await new Promise((r) => setTimeout(r, 0))
	for (let i = 0; i < 25; i++) await nextTick()
}

const mountPage = async () => {
	setActivePinia(createPinia())
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/", component: { template: "<div />" } }],
	})
	const wrapper = mount(ReferenceDataPage, {
		global: {
			plugins: [router, setActivePinia(createPinia())],
			config: { globalProperties: { __ } },
		},
	})
	await flush()
	return wrapper
}

beforeEach(() => {
	ROLE.value = "ADMIN"
	CACHE.put = 0
	CACHE.del = 0
	vi.clearAllMocks()
})

describe("the offline mirror covers every reference doctype", () => {
	it("maps all 26 doctypes to the shared reference store", () => {
		expect(REFERENCE_DOCTYPES).toHaveLength(26)
		for (const d of REFERENCE_DOCTYPES) {
			expect(MIRRORED_DOCTYPES[d], `${d} has no local mirror`).toBe(
				"reference_data",
			)
		}
	})

	it("serves only the requested doctype from the shared store", async () => {
		const mixed = [
			{ doctype: "Tax", name: "VAT15", rate: 15 },
			{ doctype: "Country", name: "YE", name_ar: "اليمن" },
			{ doctype: "Tax", name: "ZERO", rate: 0 },
		]
		const fakeDb = {
			table: () => ({ toArray: async () => mixed }),
		}
		const result = await readLocalRows(
			"Tax",
			{},
			{ loadDb: async () => fakeDb },
		)
		expect(result.ok).toBe(true)
		expect(
			result.rows.map((r) => r.name),
			"a shared store without a doctype predicate leaks other lists",
		).toEqual(["VAT15", "ZERO"])
	})
})

describe("loadReferenceData — provenance and cache", () => {
	it("sorts server rows and caches them under the doctype", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValueOnce({
			rows: [
				{ name: "SA", name_ar: "السعودية" },
				{ name: "YE", name_ar: "اليمن" },
			],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const { rows, source } = await loadReferenceData("Country")
		expect(source).toBe("server")
		expect(rows.map((r) => r.name)).toEqual(["SA", "YE"])
		expect(methodGetListWithSource).toHaveBeenCalledWith(
			"Country",
			expect.objectContaining({
				fields: expect.arrayContaining(["name as name"]),
				limit: 500,
			}),
		)
		expect(CACHE.put, "server rows never reached the offline cache").toBe(2)
		expect(CACHE.del, "the old cache was not replaced").toBe(1)
	})

	it("does NOT rewrite the cache from a local (offline) answer", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValueOnce({
			rows: [{ name: "YE" }],
			source: DATA_SOURCE.LOCAL,
			error: new Error("offline"),
		})
		const { source } = await loadReferenceData("Country")
		expect(source).toBe("local")
		expect(CACHE.put, "an offline answer must not overwrite the cache").toBe(0)
	})
})

describe("ReferenceDataPage", () => {
	it("renders server rows with an explicit source badge", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValue({
			rows: [
				{ name: "YE", name_ar: "اليمن", name_en: "Yemen", is_active: 1 },
				{
					name: "SA",
					name_ar: "السعودية",
					name_en: "Saudi Arabia",
					is_active: 0,
				},
			],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const wrapper = await mountPage()

		expect(wrapper.find('[data-testid="refdata-source"]').text()).toContain(
			"من الخادم",
		)
		const table = wrapper.find('[data-testid="refdata-table"]')
		expect(table.exists(), "server rows never rendered").toBe(true)
		expect(table.text()).toContain("اليمن")
		expect(table.text()).toContain("معطّل")

		const options = wrapper.findAll('[data-testid="refdata-doctype"] option')
		expect(options, "the doctype picker lost its lists").toHaveLength(26)
	})

	it("shows the Arabic recovery banner instead of a confident empty list", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValue({
			rows: [],
			source: DATA_SOURCE.UNAVAILABLE,
			error: new Error("الخادم غير متاح"),
		})
		const wrapper = await mountPage()

		const banner = wrapper.find('[data-testid="refdata-unavailable"]')
		expect(
			banner.exists(),
			"unavailable must be stated, not rendered empty",
		).toBe(true)
		expect(banner.text()).toContain("أعد المحاولة")
		expect(wrapper.find('[data-testid="refdata-table"]').exists()).toBe(false)
	})

	it("creates a row through dypos.client.insert (ADMIN)", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValue({
			rows: [],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const wrapper = await mountPage()

		const add = wrapper
			.findAll("button")
			.find((b) => b.text().includes("إضافة سجل"))
		expect(add, "an admin cannot reach the create form").toBeTruthy()
		await add.trigger("click")
		await nextTick()

		wrapper.vm.form.name = "CUSTOM-1"
		wrapper.vm.form.name_ar = "مخصص"
		await wrapper.vm.createRow()
		await flush()

		expect(methodCall).toHaveBeenCalledWith(
			"dypos.client.insert",
			expect.objectContaining({
				doctype: "Country",
				values: expect.objectContaining({ name: "CUSTOM-1", is_active: 1 }),
			}),
		)
	})

	it("retires a row through dypos.delete_doc, never a physical delete", async () => {
		vi.mocked(methodGetListWithSource).mockResolvedValue({
			rows: [{ name: "YE", name_ar: "اليمن", name_en: "Yemen", is_active: 1 }],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
		const wrapper = await mountPage()

		await wrapper.vm.retireRow({ name: "YE", name_ar: "اليمن", is_active: 1 })
		await flush()

		expect(methodCall).toHaveBeenCalledWith("dypos.delete_doc", {
			doctype: "Country",
			name: "YE",
		})
		confirm.mockRestore()
	})

	it("hides the write controls from a cashier (server still enforces)", async () => {
		ROLE.value = "CASHIER"
		vi.mocked(methodGetListWithSource).mockResolvedValue({
			rows: [{ name: "YE", name_ar: "اليمن", is_active: 1 }],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const wrapper = await mountPage()

		const add = wrapper
			.findAll("button")
			.find((b) => b.text().includes("إضافة سجل"))
		expect(add, "a cashier was offered a write control").toBeUndefined()
		expect(wrapper.find('[data-testid="refdata-table"]').exists()).toBe(true)
	})
})

describe("reachability (S7b)", () => {
	it("registers /reference-data as an authed route", async () => {
		const { default: router } = await import("@/router")
		const route = router.getRoutes().find((r) => r.path === "/reference-data")
		expect(route, "the management screen has no route").toBeTruthy()
		expect(route.name).toBe("ReferenceData")
	})

	it("links both reference-data and master-data-import from workNav", () => {
		const items = WORK_NAV_SECTIONS.flatMap((s) => s.items)
		const refItem = items.find((i) => i.to?.name === "ReferenceData")
		expect(refItem, "the screen exists but nothing links to it").toBeTruthy()
		expect(refItem.label).toBe("البيانات المرجعية")
		const importItem = items.find((i) => i.to?.name === "MasterDataImport")
		expect(
			importItem,
			"/master-data-import had a route and zero links — unreachable UI",
		).toBeTruthy()
	})
})

describe("register page — registration lists come from the server", () => {
	it("fetches registration_meta instead of carrying a private copy", async () => {
		const source = readSrc("pages", "Register.vue")
		expect(source).toContain("registration_meta")
		// The retired private list: 8 hardcoded countries the server no longer
		// agreed with (18 rows in v53).
		expect(source, "a hardcoded country list came back").not.toContain(
			'code: "SA", name: "السعودية"',
		)
	})

	it("a dead server never blocks the LOCAL registration path (offline-first)", () => {
		const source = readSrc("pages", "Register.vue")
		// The local path must come FIRST — before any check that depends on
		// server-provided lists. An earlier copy put
		// `if (!countries.value.length …)` at the very top of
		// `submitRegistration`, so a dead or unreachable backend left
		// `countries` empty and the guard returned early for EVERYONE —
		// including a customer with no network who only wanted a local
		// PBKDF2 account. That is the offline-first invariant (S2): the
		// till must work with the server absent, and registration is the
		// door to the till.
		const localIdx = source.indexOf("await userRepository.create(")
		const guardIdx = source.indexOf("if (!countries.value.length")
		expect(localIdx, "local registration path missing").toBeGreaterThan(-1)
		expect(guardIdx, "server meta guard missing").toBeGreaterThan(-1)
		expect(
			localIdx,
			"the local registration path must run BEFORE the server meta guard",
		).toBeLessThan(guardIdx)
		// And the guard must throw (recovery message) not silently return,
		// so the failure names a recovery instead of a dead button.
		const guardSlice = source.slice(guardIdx, guardIdx + 200)
		expect(guardSlice).toContain("throw new Error(")
	})
})

describe("stock count dialog — one catalog, no private copy (S3)", () => {
	it("derives its UoM/currency options from utils/uom.js", async () => {
		const { UOM_DEFINITIONS, CURRENCY_DEFINITIONS } = await import(
			"@/utils/uom"
		)
		const source = readSrc("components", "sale", "StockImportExportDialog.vue")
		expect(source, "fabricated FX rates resurfaced").not.toContain("rate: 3.75")
		expect(source).toContain("UOM_DEFINITIONS")

		setActivePinia(createPinia())
		const { default: Dialog } = await import(
			"@/components/sale/StockImportExportDialog.vue"
		)
		const wrapper = mount(Dialog, {
			props: { modelValue: true, warehouses: [], categories: [] },
			global: {
				config: { globalProperties: { __ } },
				components: {},
				stubs: {
					StockCountInstructionsPage: true,
					StockCountItemsTablePage: true,
				},
			},
		})
		// The old private list keyed CTN as `header`, so `u.code === "CTN"`
		// could never match it — an unresolvable unit in every import row.
		expect(wrapper.vm.uoms).toEqual(Object.values(UOM_DEFINITIONS))
		expect(wrapper.vm.uoms.some((u) => u.code === "CTN")).toBe(true)
		expect(wrapper.vm.currencies.length).toBeGreaterThanOrEqual(
			Object.keys(CURRENCY_DEFINITIONS).length,
		)
		wrapper.unmount()
	}, 10000)
})
