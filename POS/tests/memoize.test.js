/**
 * اختبارات memoizeAsync — دمج نداءات البحث المتزامنة وتخزينها.
 * حماية مباشرة لنقطة البيع من عواصف النقر على البحث.
 */
import { describe, expect, it, vi } from "vitest"

import { memoizeAsync } from "../src/utils/network.js"

describe("memoizeAsync — دمج النداءات المتزامنة والتخزين", () => {
	it("يدمج النداءات المتزامنة بنفس المفتاح في تحميل واحد", async () => {
		const load = vi.fn().mockResolvedValue({ name: "item" })
		const memo = memoizeAsync({ load, ttl: 1000 })

		const [a, b] = await Promise.all([memo.get("k1"), memo.get("k1")])
		expect(a).toEqual({ name: "item" })
		expect(b).toEqual({ name: "item" })
		expect(load).toHaveBeenCalledTimes(1)
	})

	it("يخدم القيمة المخزنة خلال TTL دون تحميل جديد", async () => {
		const load = vi.fn().mockResolvedValueOnce("v1").mockResolvedValue("v2")
		const memo = memoizeAsync({ load, ttl: 10_000 })

		await memo.get("k")
		await memo.get("k")
		expect(load).toHaveBeenCalledTimes(1)
	})

	it("invalidate يجبر على إعادة التحميل", async () => {
		const load = vi.fn().mockResolvedValueOnce("v1").mockResolvedValue("v2")
		const memo = memoizeAsync({ load, ttl: 10_000 })

		await memo.get("k")
		memo.invalidate("k")
		await expect(memo.get("k")).resolves.toBe("v2")
		expect(load).toHaveBeenCalledTimes(2)
	})

	it("shouldCache يستبعد القيم الفارغة من التخزين", async () => {
		const load = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(["a"])
		const memo = memoizeAsync({
			load,
			ttl: 10_000,
			shouldCache: (v) => Array.isArray(v) && v.length > 0,
		})

		await memo.get("k")
		await memo.get("k") // الفارغة لم تُخزَّن → تحميل ثانٍ
		expect(load).toHaveBeenCalledTimes(2)
	})

	it("مفاتيح مختلفة = تحميلات مختلفة", async () => {
		const load = vi.fn((key) => Promise.resolve(`val-${key}`))
		const memo = memoizeAsync({ load, ttl: 10_000 })

		await Promise.all([memo.get("a"), memo.get("b")])
		expect(load).toHaveBeenCalledTimes(2)
	})

	it("clear يمسح كل المفاتيح", async () => {
		const load = vi.fn((key) => Promise.resolve(key))
		const memo = memoizeAsync({ load, ttl: 10_000 })

		await memo.get("a")
		memo.clear()
		await memo.get("a")
		expect(load).toHaveBeenCalledTimes(2)
	})
})
