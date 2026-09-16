/**
 * اختبارات parseError — بوابة رسائل الأخطاء التي يراها الكاشير.
 * تغطي أشكال أخطاء frappe الحقيقية: _server_messages، exc_type، الحالات HTTP.
 */
import { beforeAll, describe, expect, it } from "vitest"

// parseError يعتمد على دالة الترجمة العالمية __ من frappe-ui —
// نوفّر نسخة تحاكي استيفاء {0} حتى تختبر القيم الفعلية لا القوالب.
beforeAll(() => {
	globalThis.__ = (str, args) => {
		if (!Array.isArray(args)) return str
		return str.replace(/\{0\}/g, args[0])
	}
})

import { parseError } from "../src/utils/errorHandler.js"

describe("parseError — الأشكال الأساسية", () => {
	it("يرجع بنية كاملة لخطأ بسيط", () => {
		const ctx = parseError(new Error("Something broke"))
		expect(ctx).toHaveProperty("title")
		expect(ctx).toHaveProperty("message")
		expect(ctx).toHaveProperty("type")
		expect(ctx).toHaveProperty("retryable")
		expect(ctx).toHaveProperty("technicalDetails")
		expect(ctx.message).toBe("Something broke")
	})

	it("يتعامل مع null/undefined دون انفجار", () => {
		expect(() => parseError(null)).not.toThrow()
		expect(() => parseError(undefined)).not.toThrow()
	})

	it("ينظف وسوم HTML من الرسالة", () => {
		const ctx = parseError(new Error("<b>Item</b> not found"))
		expect(ctx.message).not.toContain("<b>")
		expect(ctx.message).toContain("Item")
	})
})

describe("parseError — حالات HTTP", () => {
	it("417 → خطأ تحقق (validation)", () => {
		const ctx = parseError({ httpStatus: 417, message: "qty invalid" })
		expect(ctx.type).toBe("validation")
		expect(ctx.retryable).toBe(true)
	})

	it("403 → رفض صلاحيات", () => {
		const ctx = parseError({ status: 403, message: "not allowed" })
		expect(ctx.title).toBe("Permission Denied")
	})

	it("404 → تحذير غير موجود", () => {
		const ctx = parseError({ httpStatus: 404, message: "missing" })
		expect(ctx.type).toBe("warning")
	})

	it("500+ → خطأ خادم", () => {
		const ctx = parseError({ httpStatus: 500, message: "boom" })
		expect(ctx.title).toBe("Server Error")
	})
})

describe("parseError — رسائل frappe من الخادم", () => {
	it("يفك _server_messages المزدوج الترميز", () => {
		const error = {
			_server_messages: JSON.stringify([
				JSON.stringify({ title: "Stock Error", message: "Not enough stock" }),
			]),
		}
		const ctx = parseError(error)
		expect(ctx.title).toBe("Stock Error")
		expect(ctx.message).toBe("Not enough stock")
	})

	it("يقرأ messages المصفوفة مباشرة", () => {
		const ctx = parseError({ messages: ["first issue", "second issue"] })
		expect(ctx.message).toBe("first issue")
	})

	it("يجمع التفاصيل التقنية (exc_type + status)", () => {
		const ctx = parseError({
			exc_type: "ValidationError",
			status: 417,
			message: "x",
		})
		expect(ctx.technicalDetails).toContain("ValidationError")
		expect(ctx.technicalDetails).toContain("417")
	})
})

describe("parseError — التصنيف الذكي لمشاكل المخزون والبيع", () => {
	it("نقص المخزون → تحذير قابل للإعادة مع رسالة مُفسَّرة", () => {
		const ctx = parseError({
			exc_type: "NegativeStockError",
			message:
				"2.0 units of Item Apple-WHI needed in Warehouse Stores to complete this transaction",
		})
		expect(ctx.type).toBe("warning")
		expect(ctx.title).toBe("Insufficient Stock")
		expect(ctx.retryable).toBe(true)
		expect(ctx.message).toContain("Apple-WHI")
		expect(ctx.message).toContain("2")
	})

	it("خطأ أسعار → تحذير قابل للإعادة", () => {
		const ctx = parseError(new Error("Price List not found for item"))
		expect(ctx.title).toBe("Pricing Error")
		expect(ctx.retryable).toBe(true)
	})

	it("خطأ عميل → تحقق قابل للإعادة", () => {
		const ctx = parseError(new Error("Customer is required"))
		expect(ctx.title).toBe("Customer Error")
		expect(ctx.retryable).toBe(true)
	})

	it("خطأ سلسلة تسمية → خطأ غير قابل للإعادة", () => {
		const ctx = parseError(
			new Error("Naming Series for POS Invoice is missing"),
		)
		expect(ctx.title).toBe("Naming Series Error")
		expect(ctx.retryable).toBe(false)
	})

	it("خطأ صلاحيات بالرسالة → رفض غير قابل للإعادة", () => {
		const ctx = parseError(new Error("You do not have permission to do this"))
		expect(ctx.title).toBe("Permission Denied")
		expect(ctx.retryable).toBe(false)
	})

	it("خطأ اتصال → تحذير شبكي قابل للإعادة برسالة موحدة", () => {
		const ctx = parseError(new Error("Network connection lost"))
		expect(ctx.title).toBe("Connection Error")
		expect(ctx.retryable).toBe(true)
		expect(ctx.message).toContain("connect")
	})
})
