import {
	buildReorderPlan,
	summarizeReorderPlan,
} from "@/components/sale/reorderPlanning";
import { describe, expect, it } from "vitest";

describe("reorder planning", () => {
	it("suggests only the shortage to the configured point using available stock", () => {
		const items = buildReorderPlan(
			[
				{
					id: "low",
					code: "LOW",
					stock_qty: 8,
					reserved_qty: 3,
					reorder_point: 10,
					cost: 4,
					unit_price: 20,
				},
				{
					id: "healthy",
					code: "OK",
					stock_qty: 15,
					reserved_qty: 0,
					reorder_point: 10,
					cost: 5,
				},
			],
			"Main",
		);

		expect(items[0]).toMatchObject({
			id: "low",
			warehouse: "Main",
			available_qty: 5,
			suggested_qty: 5,
			unit_cost: 4,
			status: "suggested",
		});
		expect(items[1].status).toBe("ok");
		expect(summarizeReorderPlan(items)).toEqual({
			belowReorder: 0,
			suggested: 1,
			reorderValue: 20,
		});
	});

	it("does not invent a threshold for unconfigured products", () => {
		const items = buildReorderPlan(
			[{ id: "unset", stock_qty: 0, reorder_point: 0 }],
			"Main",
		);

		expect(items[0].status).toBe("unconfigured");
		expect(items[0].suggested_qty).toBe(0);
		expect(summarizeReorderPlan(items)).toEqual({
			belowReorder: 0,
			suggested: 0,
			reorderValue: 0,
		});
	});

	it("treats fully reserved and out-of-stock items as below threshold", () => {
		const items = buildReorderPlan(
			[
				{
					id: "reserved",
					stock_qty: 7,
					reserved_qty: 7,
					reorder_point: 5,
					cost: 2,
				},
			],
			"Main",
		);

		expect(items[0]).toMatchObject({
			available_qty: 0,
			suggested_qty: 5,
			status: "below_reorder",
		});
		expect(summarizeReorderPlan(items).reorderValue).toBe(10);
	});
});
