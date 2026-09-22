import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

vi.mock("@/utils/printInvoice", () => ({
	buildReceiptHTML: (data) => `<div class="receipt">${data.name}</div>`,
	printInvoiceCustom: vi.fn(),
}))

import {
	applyDeviceAvailability,
	DEVICE_BROWSER,
	PAPER_WIDTH_MM,
	loadLocalRules,
	resolveOutput,
	saveLocalRules,
	clearLocalRules,
} from "@/print/rules/outputDetermination"

describe("PAPER_WIDTH_MM", () => {
	it("maps paper tokens to widths", () => {
		expect(PAPER_WIDTH_MM["58mm"]).toBe(58)
		expect(PAPER_WIDTH_MM["80mm"]).toBe(80)
		expect(PAPER_WIDTH_MM.A4).toBe(210)
		expect(PAPER_WIDTH_MM.default).toBe(80)
	})
})

describe("resolveOutput", () => {
	it("routes silent invoices to QZ with browser fallback", () => {
		const plan = resolveOutput({
			docType: "invoice",
			silentPrint: true,
			posProfile: "Main POS",
		})
		expect(plan.deviceId).toBe("qz")
		expect(plan.fallback).toContain(DEVICE_BROWSER)
		expect(plan.paper).toBe("80mm")
		expect(plan.width).toBe(80)
	})

	it("routes non-silent invoices to the browser", () => {
		const plan = resolveOutput({
			docType: "invoice",
			silentPrint: false,
		})
		expect(plan.deviceId).toBe(DEVICE_BROWSER)
	})

	it("maps EOD to A4 and high priority", () => {
		const plan = resolveOutput({
			docType: "eod",
			silentPrint: true,
		})
		expect(plan.deviceId).toBe("qz")
		expect(plan.paper).toBe("A4")
		expect(plan.width).toBe(210)
		expect(plan.priority).toBe(1)
	})

	it("prefers a profile-specific rule over the wildcard", () => {
		const customRules = [
			{
				docType: "invoice",
				match: { profile: "*" },
				deviceId: DEVICE_BROWSER,
				copies: 1,
				paper: "80mm",
			},
			{
				docType: "invoice",
				match: { profile: "Special" },
				deviceId: "qz",
				copies: 2,
				paper: "58mm",
				priority: 1,
				fallback: [],
			},
		]
		const plan = resolveOutput({
			docType: "invoice",
			posProfile: "Special",
			customRules,
		})
		expect(plan.deviceId).toBe("qz")
		expect(plan.copies).toBe(2)
		expect(plan.width).toBe(58)
	})

	it("matches the wildcard rule when no profile rule exists", () => {
		const customRules = [
			{
				docType: "invoice",
				match: { profile: "*" },
				deviceId: "qz",
				copies: 1,
				paper: "80mm",
			},
		]
		const plan = resolveOutput({
			docType: "invoice",
			posProfile: "Other",
			customRules,
		})
		expect(plan.deviceId).toBe("qz")
	})

	it("clamps copies into a sane range", () => {
		const plan = resolveOutput({
			docType: "invoice",
			silentPrint: true,
			customRules: [
				{
					docType: "invoice",
					match: { profile: "*" },
					deviceId: "qz",
					copies: 0,
					paper: "80mm",
				},
			],
		})
		expect(plan.copies).toBe(1)
	})

	it("falls back to the invoice default for unknown docTypes", () => {
		const plan = resolveOutput({ docType: "mystery" })
		expect(plan.deviceId).toBe(DEVICE_BROWSER)
	})
})

describe("applyDeviceAvailability", () => {
	it("falls back to the browser when QZ is down and fallback exists", () => {
		const plan = applyDeviceAvailability(
			{ deviceId: "qz", fallback: [DEVICE_BROWSER], dwimon: true },
			{ qzReady: false },
		)
		expect(plan.deviceId).toBe(DEVICE_BROWSER)
		expect(plan.fellBack).toBe(true)
	})

	it("keeps QZ when it is ready", () => {
		const plan = applyDeviceAvailability(
			{ deviceId: "qz", fallback: [DEVICE_BROWSER] },
			{ qzReady: true },
		)
		expect(plan.deviceId).toBe("qz")
		expect(plan.fellBack).toBe(false)
	})
})

describe("local rules persistence", () => {
	beforeEach(() => {
		if (globalThis.localStorage) globalThis.localStorage.clear()
	})

	it("round-trips through localStorage", () => {
		const rules = [{ docType: "invoice", match: { profile: "*" } }]
		expect(saveLocalRules(rules)).toBe(true)
		expect(loadLocalRules()).toEqual(rules)
	})

	it("clears stored rules", () => {
		saveLocalRules([{ docType: "invoice" }])
		clearLocalRules()
		expect(loadLocalRules()).toBeNull()
	})

	it("ignores corrupted JSON", () => {
		globalThis.localStorage.setItem("dypos.print.rules.v1", "{not json")
		expect(loadLocalRules()).toBeNull()
	})
})