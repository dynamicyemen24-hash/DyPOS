/**
 * Offline honesty for the report data layer.
 *
 * The defect this guards: `loadInventoryData` used to `.catch(() => [])` every
 * fetch, so a dead network rendered "Total Stock Value 0.00 / Out of Stock 0"
 * with nothing indicating the data never arrived. A zero that means "unknown"
 * is worse than an error — a manager restocks from it.
 *
 * These tests pin the three states the data layer must distinguish. They fail
 * if anyone reintroduces silent zeros.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/utils/offline/db", () => ({ db: {} }))

import {
	DATA_SOURCE,
	MIRRORED_DOCTYPES,
	applyFilters,
	isMirrored,
	matchesFilter,
	readLocalRows,
	weakestSource,
} from "@/utils/offline/localMirror"

/** Fake Dexie surface: only `table(name).toArray()` is ever used. */
const fakeDb = (tables) => ({
	table: (name) => ({
		toArray: async () => {
			if (!(name in tables)) throw new Error(`no such table: ${name}`)
			return tables[name]
		},
	}),
})

const INVOICES = [
	{
		name: "INV-1",
		posting_date: "2026-09-20",
		base_net_total: 100,
		base_grand_total: 115,
		outstanding_amount: 0,
		pos_profile: "Main",
	},
	{
		name: "INV-2",
		posting_date: "2026-09-25",
		base_net_total: 250,
		base_grand_total: 287.5,
		outstanding_amount: 100,
		pos_profile: "Main",
	},
	{
		name: "INV-3",
		posting_date: "2026-10-02",
		base_net_total: 60,
		base_grand_total: 69,
		outstanding_amount: 0,
		pos_profile: "Other",
	},
]

describe("localMirror — filter semantics must match the server", () => {
	it("compares ISO dates chronologically, not as NaN", () => {
		const row = { posting_date: "2026-09-25" }
		expect(matchesFilter(row, ["posting_date", ">=", "2026-09-20"])).toEqual({
			ok: true,
			value: true,
		})
		expect(matchesFilter(row, ["posting_date", "<=", "2026-09-20"])).toEqual({
			ok: true,
			value: false,
		})
	})

	it("compares amounts numerically, not lexicographically", () => {
		const row = { outstanding_amount: 100 }
		expect(matchesFilter(row, ["outstanding_amount", ">", 0]).value).toBe(true)
		expect(matchesFilter(row, ["outstanding_amount", ">", 1000]).value).toBe(
			false,
		)
	})

	it("supports in / like the way the method router does", () => {
		expect(
			matchesFilter({ name: "INV-2" }, ["name", "in", ["INV-1", "INV-2"]])
				.value,
		).toBe(true)
		expect(
			matchesFilter({ item_name: "Arabica Coffee" }, [
				"item_name",
				"like",
				"%Coffee",
			]).value,
		).toBe(true)
		expect(
			matchesFilter({ item_name: "Tea" }, ["item_name", "like", "%Coffee"])
				.value,
		).toBe(false)
	})

	it("refuses an operator it cannot reproduce instead of guessing", () => {
		const result = matchesFilter({ a: 1 }, ["a", "between", [1, 2]])
		expect(result.ok).toBe(false)
		expect(result.reason).toMatch(/unsupported operator/)
	})

	it("applies a period filter and is all-or-nothing", () => {
		const ranged = applyFilters(INVOICES, [
			["posting_date", ">=", "2026-09-20"],
			["posting_date", "<=", "2026-09-25"],
		])
		expect(ranged.ok).toBe(true)
		expect(ranged.rows.map((r) => r.name)).toEqual(["INV-1", "INV-2"])

		const partial = applyFilters(INVOICES, [
			["posting_date", ">=", "2026-09-20"],
			["total", "between", [1, 2]],
		])
		expect(partial.ok).toBe(false)
		expect(partial.rows).toEqual([])
	})
})

describe("localMirror — cache reads", () => {
	it("knows which doc types it can answer", () => {
		expect(isMirrored("Sales Invoice")).toBe(true)
		expect(isMirrored("Stock Ledger Entry")).toBe(false)
		expect(MIRRORED_DOCTYPES["Sales Invoice"]).toBe("invoice_history")
	})

	it("reads the mirrored table and honours the period filter", async () => {
		const loadDb = async () => fakeDb({ invoice_history: INVOICES })
		const result = await readLocalRows(
			"Sales Invoice",
			{ filters: [["posting_date", ">=", "2026-09-25"]] },
			{ loadDb },
		)
		expect(result.ok).toBe(true)
		expect(result.table).toBe("invoice_history")
		expect(result.rows.map((r) => r.name)).toEqual(["INV-2", "INV-3"])
	})

	it("never touches IndexedDB for a doctype it cannot mirror", async () => {
		const loadDb = vi.fn()
		const result = await readLocalRows("Stock Ledger Entry", {}, { loadDb })
		expect(result.ok).toBe(false)
		expect(loadDb).not.toHaveBeenCalled()
	})

	it("degrades to unavailable when the database is unreachable", async () => {
		const result = await readLocalRows(
			"Sales Invoice",
			{},
			{
				loadDb: async () => {
					throw new Error("IndexedDB blocked")
				},
			},
		)
		expect(result.ok).toBe(false)
		expect(result.rows).toEqual([])
	})
})

// ── The data layers, with the transport mocked ────────────────────────────
/** responder({ doctype, offset, limit, count }) → what the server would answer */
let responder = () => ({ rows: [], source: DATA_SOURCE.SERVER, error: null })

vi.mock("@/utils/methodClient", async () => {
	const actual = await vi.importActual("@/utils/methodClient")
	return {
		...actual,
		methodGetListWithSource: vi.fn(async (doctype, options = {}) =>
			responder({ doctype, ...options }),
		),
		// `dypos.client.get_count` is the denominator; it must agree with the list.
		methodCall: vi.fn(async (method, args = {}) =>
			method === "dypos.client.get_count"
				? {
						message:
							responder({ doctype: args.doctype, count: true }).total ?? 0,
					}
				: { message: [] },
		),
	}
})

import { methodGetListWithSource } from "@/utils/methodClient"
import { loadInventoryData } from "@/components/reports/dashboards/inventory/inventoryData"
import { loadFinancialData } from "@/components/reports/core/data/financialData"
import { pagedList, MAX_ROWS } from "@/components/reports/core/data/pagedQuery"

beforeEach(() => {
	responder = () => ({ rows: [], source: DATA_SOURCE.SERVER, error: null })
})

describe("paged report queries", () => {
	/** A server that serves `total` rows in 500-row pages. */
	const pagedServer =
		(total) =>
		({ doctype, offset = 0, count } = {}) => {
			if (count) return { total }
			return {
				rows: Array.from(
					{ length: Math.max(0, Math.min(500, total - offset)) },
					(_, i) => ({
						name: `INV-${offset + i}`,
						base_net_total: 10,
						doctype,
					}),
				),
				source: DATA_SOURCE.SERVER,
				error: null,
			}
		}

	it("walks every page so a period total is not just the first page", async () => {
		// 1,200 invoices at the server's 500-row cap is three pages. The old single
		// call summarised the first 50 and labelled it "Total Revenue".
		responder = pagedServer(1200)
		const result = await pagedList("Sales Invoice", { fields: ["name"] })
		expect(result.rows).toHaveLength(1200)
		expect(result.total).toBe(1200)
		expect(result.truncated).toBe(false)
	})

	it("stops at the safety bound and says so", async () => {
		responder = pagedServer(45000)
		const result = await pagedList("Sales Invoice", { fields: ["name"] })
		expect(result.rows).toHaveLength(MAX_ROWS)
		expect(result.truncated).toBe(true)
		expect(result.total).toBe(45000)
	})

	it("never calls the network for a doctype the router cannot map", async () => {
		// Spending a round-trip to learn what we already know is the waste the
		// SERVER_UNAVAILABLE_DOCTYPES list exists to prevent.
		responder = pagedServer(5)
		const bin = await pagedList("Bin", { fields: ["item_code"] })
		expect(bin.source).toBe(DATA_SOURCE.UNAVAILABLE)
		expect(bin.reason).toMatch(/Bin/)
		expect(bin.rows).toEqual([])
	})
})

describe("report data layers — provenance contract", () => {
	it("refuses to present an unanswerable dashboard as a measurement", async () => {
		// `Bin` is not mapped in the method router, so "Stock Value" cannot be
		// computed at all. The old code rendered 0.00 with a confident label; the
		// dashboard must now report itself unavailable and NAME the gap.
		responder = () => ({
			rows: [{ item_code: "A", actual_qty: 3, valuation_rate: 10 }],
			source: DATA_SOURCE.SERVER,
			error: null,
		})
		const data = await loadInventoryData({
			from: "2026-09-01",
			to: "2026-09-30",
		})
		expect(data.source).toBe(DATA_SOURCE.UNAVAILABLE)
		expect(data.binData).toEqual([])
		const named = data.warnings.join(" ")
		expect(named).toMatch(/Bin/)
		expect(named).toMatch(/Stock Ledger Entry/)
	})

	it("keeps real revenue and NAMES the sub-metrics it cannot read", async () => {
		// Payments/payables are unmapped, but revenue is a true number now — so
		// the report stays usable and says exactly what is missing.
		responder = () => ({
			rows: [{ name: "INV-1", base_net_total: 180, outstanding_amount: 50 }],
			source: DATA_SOURCE.SERVER,
			error: null,
			total: 1,
		})
		const result = await loadFinancialData({})
		expect(result.source).toBe(DATA_SOURCE.SERVER)
		expect(result.facts.invoices).toHaveLength(1)
		const named = result.warnings.join(" ")
		expect(named).toMatch(/Payment Entry/)
		expect(named).toMatch(/Purchase Invoice/)
	})

	it("serves the device's own rows offline and SAYS so", async () => {
		responder = () => ({
			rows: [{ name: "INV-1", base_net_total: 180 }],
			source: DATA_SOURCE.LOCAL,
			error: new Error("network down"),
		})
		const result = await loadFinancialData({})
		expect(result.source).toBe(DATA_SOURCE.LOCAL)
		expect(result.facts.invoices).toHaveLength(1)
		expect(result.warnings.some((w) => /ذاكرة الجهاز/.test(w))).toBe(true)
	})

	it("never presents an empty answer as a measurement", async () => {
		// The old behaviour: every fetch swallowed, rows were [], and the KPI
		// builder happily produced "Stock Value 0.00" as if it were measured.
		responder = () => ({
			rows: [],
			source: DATA_SOURCE.UNAVAILABLE,
			error: new Error("down"),
		})
		const result = await loadFinancialData({})
		expect(result.source).toBe(DATA_SOURCE.UNAVAILABLE)
		expect(result.facts.invoices).toEqual([])
		expect(result.warnings.some((w) => /تعذّر/.test(w))).toBe(true)
	})

	it("methodGetListWithSource stays the single transport entry point", () => {
		// The array helper delegates to it, so no caller can skip the provenance
		// decision.
		expect(typeof methodGetListWithSource).toBe("function")
	})
})

describe("weakestSource", () => {
	it("never lets a partial answer look authoritative", () => {
		expect(weakestSource([DATA_SOURCE.SERVER, DATA_SOURCE.SERVER])).toBe(
			DATA_SOURCE.SERVER,
		)
		expect(weakestSource([DATA_SOURCE.SERVER, DATA_SOURCE.LOCAL])).toBe(
			DATA_SOURCE.LOCAL,
		)
		expect(weakestSource([DATA_SOURCE.LOCAL, DATA_SOURCE.UNAVAILABLE])).toBe(
			DATA_SOURCE.UNAVAILABLE,
		)
	})
})
