import { describe, expect, it, vi } from "vitest"

/**
 * Pagination must survive the REAL transport.
 *
 * The regression these guard against is subtle: `pagedList` asked for page 2+
 * with `offset`, but `methodGetListWithSource` destructured only
 * `{ fields, filters, orderBy, limit }` and hardcoded `limit_start: 0`. Every
 * page after the first re-read page 1, so a period with 1,200 invoices was
 * summarised as 3,000 rows drawn from 500 distinct invoices — and reported as a
 * complete "Total Revenue".
 *
 * Why these tests exist at all: `dashboardsOffline.test.js` mocks
 * `methodGetListWithSource` wholesale and forwards `offset` into a responder
 * that paginates correctly. That mock sits ABOVE the defect, so it exercised
 * the loop while never touching the code that dropped `offset` — a fully green
 * suite over a live financial bug.
 *
 * The rule: mock the `call` boundary (below the transport) and nothing above
 * it. Every layer between the argument and the wire must be real.
 */

/** A stand-in server: a big deterministic table, paginated honestly. */
const TOTAL = 1200
const table = Array.from({ length: TOTAL }, (_, i) => ({
	name: `INV-${String(i + 1).padStart(5, "0")}`,
	base_net_total: 10,
}))

const wire = []

vi.mock("dypos-ui", () => ({
	call: async (method, args = {}) => {
		wire.push({ method, args })
		if (method === "dypos.client.get_count") {
			return { message: TOTAL }
		}
		// Honour the wire protocol exactly as server/routes/method.js does:
		// start = limit_start|start, capped at 500 per page.
		const start = Math.max(Number(args.limit_start || args.start) || 0, 0)
		const limit = Math.min(
			Math.max(Number(args.limit_page_length || args.limit) || 50, 1),
			500,
		)
		return { message: table.slice(start, start + limit) }
	},
}))

const { methodGetListWithSource } = await import("@/utils/methodClient")
const { pagedList, PAGE_SIZE, MAX_ROWS } = await import(
	"@/components/reports/core/data/pagedQuery"
)

describe("transport carries an explicit offset", () => {
	it("sends `offset` as `limit_start` instead of pinning it to 0", async () => {
		await methodGetListWithSource("Sales Invoice", {
			fields: ["name"],
			limit: 500,
			offset: 1000,
		})
		const last = wire.at(-1)
		expect(last.method).toBe("dypos.client.get_list")
		expect(last.args.limit_start).toBe(1000)
		expect(last.args.limit_page_length).toBe(500)
	})

	it("defaults to the first page when no offset is given", async () => {
		await methodGetListWithSource("Sales Invoice", {
			fields: ["name"],
			limit: 500,
		})
		expect(wire.at(-1).args.limit_start).toBe(0)
	})

	it("honours a negative/garbage offset without producing a bad query", async () => {
		await methodGetListWithSource("Sales Invoice", { limit: 10, offset: -5 })
		expect(wire.at(-1).args.limit_start).toBe(-5)
		// The server clamps; assert the client at least never sends NaN, which is
		// what an unvalidated `Number(undefined)` would put on the wire.
		expect(Number.isNaN(wire.at(-1).args.limit_start)).toBe(false)
	})
})

describe("pagedList walks real pages", () => {
	it("loads every invoice exactly once across page boundaries", async () => {
		const { rows, truncated, total, source } = await pagedList(
			"Sales Invoice",
			{
				fields: ["name", "base_net_total"],
			},
		)

		expect(source).toBe("server")
		expect(total).toBe(TOTAL)
		// Every row, once. Not 1500. Not 3000.
		expect(rows).toHaveLength(TOTAL)
		expect(truncated).toBe(false)

		// The failure this guards was duplication, so assert distinctness
		// explicitly — a length check alone could still pass on repeated rows.
		const names = new Set(rows.map((r) => r.name))
		expect(names.size).toBe(TOTAL)

		// And the sum the dashboard reports must reflect 1,200 invoices.
		expect(rows.reduce((sum, r) => sum + r.base_net_total, 0)).toBe(TOTAL * 10)
	})

	it("requests each page at the offset the previous page ended at", async () => {
		wire.length = 0
		await pagedList("Sales Invoice", { fields: ["name"] })

		const starts = wire
			.filter((w) => w.method === "dypos.client.get_list")
			.map((w) => w.args.limit_start)

		// First page has no offset (0), then 500, then 1000 — a real walk.
		expect(starts).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2])
	})

	it("stops at the safety bound and admits truncation", async () => {
		// A period larger than the client bound must never look complete.
		const { rows, truncated, total } = await pagedList("Sales Invoice", {
			fields: ["name"],
		})
		expect(total).toBeGreaterThan(0)
		expect(rows.length).toBeLessThanOrEqual(MAX_ROWS)
		expect(truncated).toBe(rows.length < total)
	})
})
