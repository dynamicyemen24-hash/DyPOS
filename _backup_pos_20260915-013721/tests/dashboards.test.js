import { describe, expect, it } from "vitest";
import { buildSalesModels } from "@/components/reports/dashboards/sales/salesData";
import { buildFinanceModels } from "@/components/reports/dashboards/finance/financeData";
import { buildInventoryModels } from "@/components/reports/dashboards/inventory/inventoryData";
import { buildCustomerModels } from "@/components/reports/dashboards/customers/customersData";
import { buildExecutiveModels } from "@/components/reports/dashboards/executive/executiveData";
import { buildOperationsModels } from "@/components/reports/dashboards/operations/operationsData";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const invoice = (overrides = {}) => ({
	name: "INV-001",
	posting_date: "2026-09-01",
	customer: "CUST-1",
	customer_name: "Customer One",
	company: "Dycos",
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

const prevInvoice = (overrides = {}) => ({
	name: "PREV-001",
	posting_date: "2026-08-01",
	customer: "CUST-2",
	base_net_total: 800,
	base_grand_total: 920,
	base_paid_amount: 920,
	is_return: 0,
	...overrides,
});

const itemRow = (overrides = {}) => ({
	parent: "INV-001",
	item_code: "ITEM-001",
	item_name: "Widget",
	qty: 2,
	base_net_amount: 200,
	...overrides,
});

const payment = (overrides = {}) => ({
	name: "PAY-001",
	posting_date: "2026-09-01",
	paid_amount: 500,
	received_amount: 500,
	...overrides,
});

const receivable = (overrides = {}) => ({
	name: "REC-001",
	posting_date: "2026-08-15",
	customer: "CUST-1",
	outstanding_amount: 300,
	due_date: "2026-09-01",
	...overrides,
});

const payable = (overrides = {}) => ({
	name: "PAY-INV-001",
	posting_date: "2026-08-15",
	supplier: "SUP-1",
	outstanding_amount: 200,
	base_grand_total: 200,
	...overrides,
});

const stockEntry = (overrides = {}) => ({
	posting_date: "2026-09-01",
	item_code: "ITEM-001",
	actual_qty: 10,
	valuation_rate: 50,
	...overrides,
});

const binRecord = (overrides = {}) => ({
	item_code: "ITEM-001",
	warehouse: "WH-1",
	actual_qty: 5,
	valuation_rate: 50,
	...overrides,
});

/* ------------------------------------------------------------------ */
/* Sales Dashboard Tests                                             */
/* ------------------------------------------------------------------ */

describe("Sales Dashboard - buildSalesModels", () => {
	it("returns KPIs for invoices", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", posting_date: "2026-09-02", base_net_total: 2000, base_grand_total: 2300 })],
			prevInvoices: [prevInvoice()],
			items: [itemRow()],
		};
		const models = buildSalesModels(facts);
		expect(models.kpis.length).toBeGreaterThan(0);
		expect(models.dailyTrend.current.length).toBe(2);
		expect(models.categoryBreakdown.length).toBeGreaterThan(0);
		expect(models.topProducts.length).toBeGreaterThan(0);
		expect(models.paymentMethods.length).toBeGreaterThan(0);
		expect(models.hourlyPattern.length).toBe(24);
	});

	it("computes net-sales KPI correctly", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", base_net_total: 2000 })],
			prevInvoices: [],
			items: [],
		};
		const models = buildSalesModels(facts);
		const netSales = models.kpis.find((k) => k.id === "net-sales");
		expect(netSales.value).toBe(3000);
	});
});

/* ------------------------------------------------------------------ */
/* Finance Dashboard Tests                                           */
/* ------------------------------------------------------------------ */

describe("Finance Dashboard - buildFinanceModels", () => {
	it("returns KPIs for all financial metrics", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", base_net_total: 2000 })],
			payments: [payment(), payment({ paid_amount: 300 })],
			receivables: [receivable()],
			payables: [payable()],
			prevInvoices: [prevInvoice()],
			prevPayments: [payment({ paid_amount: 200 })],
		};
		const models = buildFinanceModels(facts);
		expect(models.kpis.length).toBe(8);
		expect(models.cashflowTrend.length).toBeGreaterThan(0);
		expect(models.receivablesAging.length).toBe(4);
		expect(models.payablesAging.length).toBe(4);
		expect(models.paymentDistribution.length).toBeGreaterThan(0);
	});

	it("computes net cashflow", () => {
		const facts = {
			invoices: [invoice()],
			payments: [payment({ payment_type: "Receive", received_amount: 500 }), payment({ payment_type: "Pay", paid_amount: 200 })],
			receivables: [],
			payables: [],
			prevInvoices: [],
			prevPayments: [],
		};
		const models = buildFinanceModels(facts);
		const net = models.kpis.find((k) => k.id === "net");
		expect(net.value).toBe(300);
	});

	it("verifies prevReceivables flows through to receivable KPI", () => {
		const facts = {
			invoices: [invoice()],
			payments: [],
			receivables: [receivable({ outstanding_amount: 300 })],
			payables: [],
			prevInvoices: [],
			prevPayments: [],
			prevReceivables: [receivable({ outstanding_amount: 500, posting_date: "2026-08-01" })],
			prevPayables: [],
		};
		const models = buildFinanceModels(facts);
		const receivableKpi = models.kpis.find((k) => k.id === "receivable");
		expect(receivableKpi.previousValue).toBe(500);
	});
});

/* ------------------------------------------------------------------ */
/* Inventory Dashboard Tests                                         */
/* ------------------------------------------------------------------ */

describe("Inventory Dashboard - buildInventoryModels", () => {
	it("returns KPIs from items and bins", () => {
		const facts = {
			stockEntries: [stockEntry()],
			items: [{ name: "Widget", item_code: "ITEM-001", is_stock_item: 1, disabled: false }],
			binData: [binRecord()],
		};
		const models = buildInventoryModels(facts);
		expect(models.kpis.length).toBe(6);
		expect(models.stockLevels.length).toBeGreaterThan(0);
		expect(models.movementTrend.length).toBeGreaterThan(0);
		expect(models.abcAnalysis.length).toBe(3);
	});

	it("detects low stock items", () => {
		const facts = {
			stockEntries: [],
			items: [{ item_code: "ITEM-001", is_stock_item: 1, disabled: false }],
			binData: [
				binRecord({ item_code: "ITEM-001", actual_qty: 3 }),
				binRecord({ item_code: "ITEM-002", actual_qty: 2 }),
			],
		};
		const models = buildInventoryModels(facts);
		expect(models.lowStockItems.length).toBe(2);
	});

	it("ABC analysis categories sum correctly", () => {
		const facts = {
			stockEntries: [],
			items: [
				{ item_code: "ITEM-A", is_stock_item: 1, disabled: false },
				{ item_code: "ITEM-B", is_stock_item: 1, disabled: false },
				{ item_code: "ITEM-C", is_stock_item: 1, disabled: false },
			],
			binData: [
				binRecord({ item_code: "ITEM-A", actual_qty: 10, valuation_rate: 10 }),
				binRecord({ item_code: "ITEM-B", actual_qty: 5, valuation_rate: 10 }),
				binRecord({ item_code: "ITEM-C", actual_qty: 1, valuation_rate: 10 }),
			],
		};
		const models = buildInventoryModels(facts);
		const abc = models.abcAnalysis;
		const total = abc.reduce((s, c) => s + c.count, 0);
		expect(total).toBe(3);
		expect(abc.length).toBe(3);
	});
});

/* ------------------------------------------------------------------ */
/* Customers Dashboard Tests                                         */
/* ------------------------------------------------------------------ */

describe("Customers Dashboard - buildCustomerModels", () => {
	it("returns KPIs and top customers", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", customer: "CUST-2", base_net_total: 2000 })],
			prevInvoices: [prevInvoice()],
		};
		const models = buildCustomerModels(facts);
		expect(models.kpis.length).toBe(4);
		expect(models.topCustomers.length).toBeGreaterThan(0);
		expect(models.customerTrend.length).toBeGreaterThan(0);
		expect(models.segmentation.length).toBeGreaterThan(0);
		expect(models.lifetimeValue.length).toBeGreaterThan(0);
	});

	it("computes unique customers count", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", customer: "CUST-2" })],
			prevInvoices: [],
		};
		const models = buildCustomerModels(facts);
		const customers = models.kpis.find((k) => k.id === "customer");
		expect(customers.value).toBe(2);
	});

	it("segmentation sums correctly", () => {
		const facts = {
			invoices: [
				invoice({ customer: "CUST-1", base_net_total: 60000 }),
				invoice({ customer: "CUST-1", base_net_total: 1000 }),
				invoice({ customer: "CUST-2", base_net_total: 500 }),
				invoice({ customer: "CUST-3", base_net_total: 100 }),
			],
			prevInvoices: [],
		};
		const models = buildCustomerModels(facts);
		const seg = models.segmentation;
		const total = seg.reduce((s, x) => s + x.count, 0);
		expect(total).toBe(3);
		const segMap = Object.fromEntries(seg.map((s) => [s.label, s.count]));
		expect(segMap["Occasional"]).toBe(1);
		expect(segMap["New"]).toBe(2);
		expect(segMap["VIP"]).toBe(0);
		expect(segMap["Regular"]).toBe(0);
	});
});

/* ------------------------------------------------------------------ */
/* Executive Dashboard Tests                                         */
/* ------------------------------------------------------------------ */

describe("Executive Dashboard - buildExecutiveModels", () => {
	it("returns KPIs and alerts", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", base_net_total: 2000 })],
			payments: [payment()],
			receivables: [receivable()],
			payables: [payable()],
			items: [{ actual_qty: 0 }],
			prevInvoices: [prevInvoice()],
			prevPayments: [],
		};
		const models = buildExecutiveModels(facts);
		expect(models.kpis.length).toBe(8);
		expect(models.dailyTrend.current.length).toBeGreaterThan(0);
		expect(models.categoryPerformance.length).toBeGreaterThan(0);
	});

	it("generates alerts for high receivables", () => {
		const facts = {
			invoices: [invoice({ base_net_total: 100 })],
			payments: [],
			receivables: [receivable({ outstanding_amount: 50000 })],
			payables: [],
			items: [],
			prevInvoices: [],
			prevPayments: [],
		};
		const models = buildExecutiveModels(facts);
		const hasAlert = models.alerts.some((a) => a.id === "high-receivables");
		expect(hasAlert).toBe(true);
	});

	it("generates alerts for low margin", () => {
		const facts = {
			invoices: [invoice({ base_net_total: 100 })],
			payments: [],
			receivables: [],
			payables: [payable({ base_grand_total: 95 })],
			items: [],
			prevInvoices: [],
			prevPayments: [],
		};
		const models = buildExecutiveModels(facts);
		const hasAlert = models.alerts.some((a) => a.id === "low-margin");
		expect(hasAlert).toBe(true);
	});
});

/* ------------------------------------------------------------------ */
/* Operations Dashboard Tests                                        */
/* ------------------------------------------------------------------ */

describe("Operations Dashboard - buildOperationsModels", () => {
	it("returns KPIs and hourly data", () => {
		const facts = {
			invoices: [invoice(), invoice({ name: "INV-002", base_grand_total: 2000 })],
			payments: [payment(), payment({ mode_of_payment: "Cash" })],
		};
		const models = buildOperationsModels(facts);
		expect(models.kpis.length).toBe(6);
		expect(models.hourlyVolume.length).toBe(24);
		expect(models.paymentMethods.length).toBeGreaterThan(0);
		expect(models.statusDistribution.length).toBeGreaterThan(0);
		expect(models.dailyPerformance.length).toBeGreaterThan(0);
		expect(models.shiftAnalysis.length).toBeGreaterThan(0);
	});

	it("computes payment method distribution", () => {
		const facts = {
			invoices: [invoice()],
			payments: [payment({ mode_of_payment: "Cash" }), payment({ mode_of_payment: "Card" })],
		};
		const models = buildOperationsModels(facts);
		expect(models.paymentMethods.length).toBe(2);
		expect(models.paymentMethods[0].sharePercent).toBeGreaterThanOrEqual(0);
	});

	it("hourly data has 24 entries", () => {
		const facts = {
			invoices: [invoice()],
			payments: [payment()],
		};
		const models = buildOperationsModels(facts);
		expect(models.hourlyVolume.length).toBe(24);
		expect(models.hourlyVolume[0].hour).toBe("00:00");
		expect(models.hourlyVolume[23].hour).toBe("23:00");
	});
});
