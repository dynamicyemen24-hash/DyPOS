/**
 * مركز تنبيهات التشغيل — حقائق محلية تحتاج تدخلًا.
 *
 * تثبت البوابة أن:
 *  1. الانقطاع يُعلن كحالة (لا أصفار) وبلا رابط وهمي لمركز غير موجود.
 *  2. المزامنة المعلقة برقمها الحقيقي ورابطها نقطة البيع (حيث المركز).
 *  3. نفاد المخزون برقمه وخطورة متدرجة ورابطه إدارة المخزون.
 *  4. البيع غير المكتمل يظهر ورابطه نقطة البيع (حيث الاستئناف تلقائي).
 *  5. فشل القراءة يُعلن ولا يُقدَّم كهدوء.
 *  6. الهدوء يُعلن ("لا تنبيهات") — القسم لا يختفي بصمت.
 */
import { describe, expect, it } from "vitest"

import { loadOpsAlerts } from "@/utils/opsAlerts"

const quiet = () =>
	loadOpsAlerts({
		lowStockFn: async () => [],
		syncFn: async () => ({ pendingCount: 0, isOnline: true }),
		draftFn: () => false,
	})

describe("مركز تنبيهات التشغيل", () => {
	it("الهدوء يُعلن ولا يُخفى", async () => {
		const result = await quiet()
		expect(result.error).toBe("")
		expect(result.alerts).toEqual([])
	})

	it("الانقطاع حالة بلا رابط وهمي", async () => {
		const result = await loadOpsAlerts({
			lowStockFn: async () => [],
			syncFn: async () => ({ pendingCount: 7, isOnline: false }),
			draftFn: () => false,
		})
		expect(result.alerts.map((a) => a.id)).toEqual(["offline"])
		expect(result.alerts[0].to).toBeNull()
	})

	it("المزامنة المعلقة برقمها ورابطها نقطة البيع", async () => {
		const result = await loadOpsAlerts({
			lowStockFn: async () => [],
			syncFn: async () => ({ pendingCount: 5, isOnline: true }),
			draftFn: () => false,
		})
		const alert = result.alerts.find((a) => a.id === "sync-pending")
		expect(alert).toBeTruthy()
		expect(alert.detail).toContain("5")
		expect(alert.to).toEqual({ name: "POSSale" })
	})

	it("نفاد المخزون متدرج الخطورة ورابطه المخزون", async () => {
		const rows = (n) => Array.from({ length: n }, (_, i) => ({ code: `P${i}` }))
		const low = await loadOpsAlerts({
			lowStockFn: async () => rows(3),
			syncFn: async () => ({ pendingCount: 0, isOnline: true }),
			draftFn: () => false,
		})
		expect(low.alerts[0].severity).toBe("warning")
		expect(low.alerts[0].to).toEqual({ name: "StockManagement" })
		const critical = await loadOpsAlerts({
			lowStockFn: async () => rows(11),
			syncFn: async () => ({ pendingCount: 0, isOnline: true }),
			draftFn: () => false,
		})
		expect(critical.alerts[0].severity).toBe("critical")
	})

	it("البيع غير المكتمل يظهر ورابطه نقطة البيع", async () => {
		const result = await loadOpsAlerts({
			lowStockFn: async () => [],
			syncFn: async () => ({ pendingCount: 0, isOnline: true }),
			draftFn: () => true,
		})
		const alert = result.alerts.find((a) => a.id === "unsent-sale")
		expect(alert).toBeTruthy()
		expect(alert.to).toEqual({ name: "POSSale" })
	})

	it("فشل القراءة يُعلن ولا يُقدَّم كهدوء", async () => {
		const result = await loadOpsAlerts({
			lowStockFn: async () => {
				throw new Error("db gone")
			},
			syncFn: async () => ({}),
			draftFn: () => false,
		})
		expect(result.alerts).toEqual([])
		expect(result.error.length).toBeGreaterThan(0)
	})
})
