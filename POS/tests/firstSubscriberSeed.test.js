import { beforeEach, describe, expect, it } from "vitest"

import {
	ensureFirstSubscriber,
	FIRST_SUBSCRIBER_FLAG,
	FIRST_SUBSCRIBER_STOCK_KEY,
	FIRST_SUBSCRIBER_USERS_KEY,
	FIRST_SUBSCRIBER_KEY,
	FIRST_SUBSCRIBER_VALUE,
	ROYAL_SUBSCRIBER,
} from "@/services/firstSubscriberSeed"
import { db as offlineDb, getSetting } from "@/utils/offline/db"
import { authenticate, findByEmail } from "@/repositories/userRepository"
import { getDb } from "@/repositories/base"

const TEST_EMAIL = "royal.admin@test.local"
const TEST_CODE = "ROYAL-TEST-001"

async function clearSeedState() {
	localStorage.removeItem(FIRST_SUBSCRIBER_KEY)
	localStorage.removeItem(FIRST_SUBSCRIBER_USERS_KEY)
	localStorage.removeItem(FIRST_SUBSCRIBER_STOCK_KEY)
	window.history.replaceState(null, "", "/")
	await offlineDb.settings.delete(FIRST_SUBSCRIBER_FLAG).catch(() => {})
	for (const key of Object.keys(ROYAL_SUBSCRIBER)) {
		await offlineDb.settings.delete(`subscriber.${key}`).catch(() => {})
	}
	await offlineDb.items.delete(TEST_CODE).catch(() => {})
	await offlineDb.stock
		.delete([TEST_CODE, ROYAL_SUBSCRIBER.warehouse])
		.catch(() => {})
	await offlineDb.item_prices.delete(["Standard", TEST_CODE]).catch(() => {})
	const existing = await findByEmail(TEST_EMAIL).catch(() => null)
	if (existing?.id) {
		await getDb()
			.table("users")
			.delete(existing.id)
			.catch(() => {})
	}
}

beforeEach(clearSeedState)

describe("firstSubscriberSeed", () => {
	it("لا يبذر شيئًا دون اشتراك صريح", async () => {
		const result = await ensureFirstSubscriber()
		expect(result).toMatchObject({ applied: false, reason: "not-opted-in" })
		expect(await findByEmail(TEST_EMAIL).catch(() => null)).toBeNull()
	})

	it("يبذر الشركة ويضع علمًا ولا يتكرر", async () => {
		localStorage.setItem(FIRST_SUBSCRIBER_KEY, FIRST_SUBSCRIBER_VALUE)
		const first = await ensureFirstSubscriber()
		expect(first.applied).toBe(true)
		expect(await getSetting("subscriber.company_name", "")).toBe(
			ROYAL_SUBSCRIBER.company_name,
		)
		expect(await getSetting("subscriber.warehouse", "")).toBe("W-01")

		const second = await ensureFirstSubscriber()
		expect(second).toMatchObject({ applied: false, reason: "already-seeded" })
	})

	it("ينشئ المستخدمين بتشفير ولا يبقي سرًا صريحًا", async () => {
		localStorage.setItem(FIRST_SUBSCRIBER_KEY, FIRST_SUBSCRIBER_VALUE)
		localStorage.setItem(
			FIRST_SUBSCRIBER_USERS_KEY,
			JSON.stringify([
				{
					email: TEST_EMAIL,
					fullName: "مدير رويال",
					password: "Royal-2026-Strong",
					role: "ADMIN",
				},
			]),
		)
		const result = await ensureFirstSubscriber()
		expect(result.users.created).toContain(TEST_EMAIL.toLowerCase())

		// المفتاح الصريح حُذف بعد نجاح كامل.
		expect(localStorage.getItem(FIRST_SUBSCRIBER_USERS_KEY)).toBeNull()

		// الدخول يعمل بالكلمة، والمخزن هاش لا نص.
		const login = await authenticate(TEST_EMAIL, "Royal-2026-Strong")
		expect(login.success).toBe(true)
		const row = await findByEmail(TEST_EMAIL)
		expect(row.password_hash).toContain("pbkdf2-sha256")
		expect(row.password_hash).not.toContain("Royal-2026-Strong")
	})

	it("يستورد الأرصدة الافتتاحية ويرفض السالب دون اختراع", async () => {
		localStorage.setItem(FIRST_SUBSCRIBER_KEY, FIRST_SUBSCRIBER_VALUE)
		localStorage.setItem(
			FIRST_SUBSCRIBER_STOCK_KEY,
			JSON.stringify([
				{ item_code: TEST_CODE, item_name: "عطر رويال", qty: 12, rate: 5000 },
				{ item_code: "BAD-ROW", qty: -3, rate: 100 },
				{ qty: 5, rate: 10 },
			]),
		)
		const result = await ensureFirstSubscriber()
		expect(result.stock.rows).toBe(1)
		expect(result.stock.rejected).toBe(2)

		const item = await offlineDb.items.get(TEST_CODE)
		expect(item?.item_name).toBe("عطر رويال")
		const stock = await offlineDb.stock.get({
			item_code: TEST_CODE,
			warehouse: "W-01",
		})
		expect(stock?.qty).toBe(12)
		const price = await offlineDb.item_prices.get(["Standard", TEST_CODE])
		expect(price?.rate).toBe(5000)

		// رُفضت صفوف فالمفتاح بقي ليصلحه المالك.
		expect(localStorage.getItem(FIRST_SUBSCRIBER_STOCK_KEY)).not.toBeNull()
	})

	it("مفتاح JSON تالف لا يكسر الإقلاع", async () => {
		localStorage.setItem(FIRST_SUBSCRIBER_KEY, FIRST_SUBSCRIBER_VALUE)
		localStorage.setItem(FIRST_SUBSCRIBER_USERS_KEY, "{broken")
		localStorage.setItem(FIRST_SUBSCRIBER_STOCK_KEY, "[broken")
		const result = await ensureFirstSubscriber()
		expect(result.applied).toBe(true)
		expect(result.users.note).toBe("users-key-invalid")
		expect(result.stock.note).toBe("stock-key-invalid")
	})

	it("رابط الاشتراك يثبت المفتاح وينظف نفسه", async () => {
		window.history.replaceState(null, "", "/?subscriber=royal-marib")
		const result = await ensureFirstSubscriber()
		expect(result.applied).toBe(true)
		expect(localStorage.getItem(FIRST_SUBSCRIBER_KEY)).toBe(
			FIRST_SUBSCRIBER_VALUE,
		)
		expect(window.location.search).not.toContain("subscriber")
		window.history.replaceState(null, "", "/")
	})

	it("ينظف النسخة المتداخلة داخل redirect حارس الدخول", async () => {
		window.history.replaceState(
			null,
			"",
			"/account/login?redirect=/?subscriber=royal-marib",
		)
		const result = await ensureFirstSubscriber()
		expect(result.applied).toBe(true)
		expect(window.location.href).not.toContain("subscriber")
		window.history.replaceState(null, "", "/")
	})

	it("مشترك ثانٍ لا يرى بيانات رويال إطلاقًا (عزل المستأجر)", async () => {
		localStorage.setItem(FIRST_SUBSCRIBER_KEY, "other-shop")
		localStorage.setItem(
			FIRST_SUBSCRIBER_USERS_KEY,
			JSON.stringify([
				{
					email: TEST_EMAIL,
					fullName: "مدير رويال",
					password: "Royal-2026-Strong",
					role: "ADMIN",
				},
			]),
		)
		const result = await ensureFirstSubscriber()
		expect(result).toMatchObject({ applied: false, reason: "not-opted-in" })
		// لا شركة، لا مستخدم، ومفتاح المستخدم لم يُمس (ليس لنا).
		expect(await getSetting("subscriber.company_name", null)).toBeNull()
		expect(await findByEmail(TEST_EMAIL).catch(() => null)).toBeNull()
		expect(localStorage.getItem(FIRST_SUBSCRIBER_USERS_KEY)).not.toBeNull()
	})

	it("رابط مشترك آخر لا يثبت شيئًا ولا يمس الرابط", async () => {
		window.history.replaceState(null, "", "/?subscriber=other-shop")
		const result = await ensureFirstSubscriber()
		expect(result).toMatchObject({ applied: false, reason: "not-opted-in" })
		expect(window.location.search).toContain("subscriber=other-shop")
		expect(await getSetting("subscriber.company_name", null)).toBeNull()
		window.history.replaceState(null, "", "/")
	})
})
