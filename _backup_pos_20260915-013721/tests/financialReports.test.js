import { describe, it, expect } from "vitest";
import { buildCashflowModel } from "@/components/reports/financial/cashflow/cashflowCalc";
import { buildPayablesModel } from "@/components/reports/financial/payables/payablesCalc";
import { buildProfitabilityModel } from "@/components/reports/financial/profitability/profitabilityCalc";
import {
	buildAgingBuckets,
	buildReceivablesModel,
	daysOverdue,
} from "@/components/reports/financial/receivables/receivablesCalc";
import { buildRevenueModel } from "@/components/reports/financial/revenue/revenueCalc";
import { buildTaxModel } from "@/components/reports/financial/tax/taxCalc";

const invoice = (overrides = {}) => ({
	name: "INV-001",
	posting_date: "2026-09-01",
	due_date: "2026-09-15",
	customer: "CUST-1",
	customer_name: "Customer One",
	company: "DyPOS",
	pos_profile: "POS-1",
	status: "Paid",
	is_return: 0,
	base_grand_total: 1150,
	base_net_total: 1000,
	base_total_taxes_and_charges: 150,
	base_discount_amount: 50,
	base_paid_amount: 1150,
	outstanding_amount: 0,
	...overrides,
});

const item = (overrides = {}) => ({
	parent: "INV-001",
	item_code: "ITEM-1",
	item_name: "Item One",
	qty: 2,
	base_net_amount: 500,
	valuation_rate: 200,
	...overrides,
});

const NOW = new Date("2026-09-25T12:00:00Z");

describe("revenueCalc", () => {
	it("sums revenue KPIs including returns netting", () => {
		const model = buildRevenueModel([
			invoice(),
			invoice({ name: "INV-002", base_net_total: 500, base_grand_total: 575, base_paid_amount: 575, base_discount_amount: 0, base_total_taxes_and_charges: 75 }),
			invoice({ name: "INV-R1", is_return: 1, base_net_total: -200, base_grand_total: -230, base_paid_amount: -230, base_discount_amount: 0, base_total_taxes_and_charges: -30 }),
		]);

		const net = model.kpis.find((kpi) => kpi.id === "net-sales");
		const gross = model.kpis.find((kpi) => kpi.id === "gross-sales");
		const transactions = model.kpis.find((kpi) => kpi.id === "transactions");

		expect(net.value).toBe(1300);
		expect(gross.value).toBe(1495);
		expect(transactions.value).toBe(2);
	});

	it("computes average ticket from non-return transactions", () => {
		const model = buildRevenueModel([invoice(), invoice({ name: "INV-002", base_net_total: 500 })]);
		const average = model.kpis.find((kpi) => kpi.id === "average-ticket");
		expect(average.value).toBe(750);
	});

	it("groups daily rows by posting date and ranks customers", () => {
		const model = buildRevenueModel([
			invoice(),
			invoice({ name: "INV-002", posting_date: "2026-09-01", customer: "CUST-2", customer_name: "Customer Two", base_net_total: 500 }),
			invoice({ name: "INV-003", posting_date: "2026-09-02" }),
		]);

		expect(model.daily).toHaveLength(2);
		expect(model.daily[0].date).toBe("2026-09-01");
		expect(model.daily[0].transactions).toBe(2);
		expect(model.topCustomers[0].customer).toBe("CUST-1");
		expect(model.topCustomers[0].sharePercent).toBeCloseTo(80, 5);
	});
});

describe("taxCalc", () => {
	it("computes totals and effective rate", () => {
		const model = buildTaxModel([invoice(), invoice({ name: "INV-002", base_net_total: 500, base_total_taxes_and_charges: 75 })]);

		const totalTax = model.kpis.find((kpi) => kpi.id === "total-tax");
		const rate = model.kpis.find((kpi) => kpi.id === "effective-rate");

		expect(totalTax.value).toBe(225);
		expect(rate.value).toBeCloseTo(15, 5);
	});

	it("builds account breakdown when tax lines exist", () => {
		const model = buildTaxModel(
			[invoice()],
			[
				{ parent: "INV-001", account_head: "VAT 15%", description: "VAT", rate: 15, base_tax_amount: 100 },
				{ parent: "INV-001", account_head: "VAT 15%", description: "VAT", rate: 15, base_tax_amount: 50 },
			],
		);

		expect(model.breakdownAvailable).toBe(true);
		expect(model.byAccount).toHaveLength(1);
		expect(model.byAccount[0].amount).toBe(150);
		expect(model.byAccount[0].sharePercent).toBe(100);
	});

	it("flags breakdown unavailable when no tax lines", () => {
		const model = buildTaxModel([invoice()], []);
		expect(model.breakdownAvailable).toBe(false);
		expect(model.byAccount).toHaveLength(0);
	});
});



describe("profitabilityCalc", () => {
	it("computes COGS, profit and margin from valuation rates", () => {
		const model = buildProfitabilityModel([invoice()], [item(), item({ parent: "INV-001" })]);

		const cogs = model.kpis.find((kpi) => kpi.id === "cogs");
		const profit = model.kpis.find((kpi) => kpi.id === "gross-profit");
		const margin = model.kpis.find((kpi) => kpi.id === "gross-margin");

		expect(model.costDataAvailable).toBe(true);
		expect(cogs.value).toBe(800);
		expect(profit.value).toBe(200);
		expect(margin.value).toBeCloseTo(20, 5);
		expect(model.items[0].marginPercent).toBeCloseTo(20, 5);
	});

	it("degrades gracefully without valuation data", () => {
		const model = buildProfitabilityModel([invoice()], [item({ valuation_rate: null })]);

		expect(model.costDataAvailable).toBe(false);
		expect(model.items[0].marginPercent).toBeNull();
	});
});

describe("cashflowCalc", () => {
	it("computes inflow, outflow, net and running balance", () => {
		const model = buildCashflowModel([
			{ name: "PE-1", posting_date: "2026-09-01", payment_type: "Receive", mode_of_payment: "Cash", received_amount: 1000, paid_amount: 0 },
			{ name: "PE-2", posting_date: "2026-09-02", payment_type: "Pay", mode_of_payment: "Cash", received_amount: 0, paid_amount: 300 },
			{ name: "PE-3", posting_date: "2026-09-02", payment_type: "Receive", mode_of_payment: "Card", received_amount: 500, paid_amount: 0 },
			{ name: "PE-4", posting_date: "2026-09-02", payment_type: "Internal Transfer", received_amount: 900, paid_amount: 900 },
		]);

		const net = model.kpis.find((kpi) => kpi.id === "net-cash");
		expect(net.value).toBe(1200);

		expect(model.daily).toHaveLength(2);
		expect(model.daily[1].balance).toBe(1200);
		expect(model.byMode).toHaveLength(2);
		const cash = model.byMode.find((row) => row.mode === "Cash");
		expect(cash.net).toBe(700);
	});

describe("receivablesCalc", () => {
	const receivableRows = [
		invoice({ outstanding_amount: 600, due_date: "2026-10-05" }),
		invoice({ name: "INV-002", outstanding_amount: 400, due_date: "2026-08-01" }),
		invoice({ name: "INV-003", outstanding_amount: 0 }),
	];

	it("computes days overdue from due date", () => {
		expect(daysOverdue("2026-09-20", NOW)).toBe(5);
		expect(daysOverdue("2026-10-01", NOW)).toBe(0);
		expect(daysOverdue(null, NOW)).toBe(0);
	});

	it("builds party ledger and aging buckets", () => {
		const model = buildReceivablesModel(receivableRows, NOW);

		const outstanding = model.kpis.find((kpi) => kpi.id === "total-outstanding");
		const overdue = model.kpis.find((kpi) => kpi.id === "overdue-amount");

		expect(outstanding.value).toBe(1000);
		expect(overdue.value).toBe(400);
		// All three invoices belong to the same party (CUST-1); the ledger
		// aggregates their outstanding amounts into a single party row.
		expect(model.parties).toHaveLength(1);
		expect(model.parties[0].outstanding).toBe(1000);
		// Oldest due date (2026-08-01) is 55 days past NOW → party is overdue.
		expect(model.parties[0].status).toBe("overdue");
		expect(model.parties[0].overdueDays).toBeGreaterThan(30);

		const buckets = buildAgingBuckets(receivableRows, NOW);
		const notDue = buckets.find((bucket) => bucket.label === "Not Due");
		const mid = buckets.find((bucket) => bucket.label === "31-60 Days");
		expect(notDue.amount).toBe(600);
		expect(mid.amount).toBe(400);
	});
});

describe("payablesCalc", () => {
	it("mirrors the receivables ledger for suppliers", () => {
		const model = buildPayablesModel(
			[
				{
					name: "PINV-1",
					posting_date: "2026-09-01",
					due_date: "2026-08-15",
					supplier: "SUP-1",
					supplier_name: "Supplier One",
					outstanding_amount: 2500,
				},
			],
			NOW,
		);

		expect(model.kpis.find((kpi) => kpi.id === "total-outstanding").value).toBe(2500);
		expect(model.parties[0].partyName).toBe("Supplier One");
		expect(model.parties[0].status).toBe("overdue");
	});
});

});
