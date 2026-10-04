/**
 * بذر المشترك الأول — رويال العالمية (اليمن، مأرب) في IndexedDB.
 *
 * ## لماذا هذه الوحدة موجودة
 *
 * المشترك الأول يشغّل متجره على جهاز دون خادم (الخلفية التزامنية 503)،
 * فقاعدة بياناته المحلية تبدأ فارغة: لا شركة في التقارير، ولا مستخدمون
 * للدخول، ولا أرصدة افتتاحية للبيع. التسجيل اليدوي سطرًا سطرًا على شاشة
 * كاشير هو الجدار نفسه الذي بُني `localUserSeed` لهدمه.
 *
 * ## لماذا الاشتراك الصريح (opt-in) لا التشغيل التلقائي
 *
 * هذا الملف يحمل هوية متجر حقيقي واحد. تشغيله تلقائيًا لكل تثبيت في العالم
 * سيزرع «رويال العالمية» في متاجر لا علاقة لها بها — عكس S0 تمامًا. لذلك
 * لا يعمل إلا ومفتاح `dypos.first_subscriber` في localStorage يساوي
 * `royal-marib`، وهو مفتاح يضعه المالك بيده مرة واحدة على جهازه فقط.
 *
 * ## ما يُبذر وما لا يُبذر (S1 — لا بيانات ملفقة)
 *
 * - يُبذر: الهيكل الذي قدّمه المالك — الشركة/الفرع/المستودع/العملة،
 *   وحسابات المستخدمين الذين سمّاهم بكلمات مرور **هو اختارها**، وأرصدة
 *   الافتتاح من **جرده الفعلي** الذي لصقه هو.
 * - لا يُبذر أبدًا: كميات أو أسعار من عندنا. صف بكمية سالبة أو بلا رمز
 *   يُرفض ويُذكر في التحذيرات بدل أن يُخترع له رقم.
 *
 * ## الأسرار (S4)
 *
 * كلمات المرور تصل عبر مفتاح localStorage لمرة واحدة
 * (`dypos.first_subscriber.users`)، تُخزَّن PBKDF2 عبر `userRepository`
 * فقط، ثم **يُحذف المفتاح** بعد نجاح كامل. لا سرّ في المستودع، ولا نص
 * صريح يبقى في المتصفح.
 */

import { db, getSetting, setSetting } from "@/utils/offline/db"
import { create as createLocalUser } from "@/repositories/userRepository"
import { logger } from "@/utils/logger"
import {
	FIRST_SUBSCRIBER_FLAG,
	FIRST_SUBSCRIBER_KEY,
	FIRST_SUBSCRIBER_STOCK_KEY,
	FIRST_SUBSCRIBER_USERS_KEY,
	FIRST_SUBSCRIBER_VALUE,
	ROYAL_SUBSCRIBER,
} from "./firstSubscriberProfile"

export {
	FIRST_SUBSCRIBER_FLAG,
	FIRST_SUBSCRIBER_KEY,
	FIRST_SUBSCRIBER_STOCK_KEY,
	FIRST_SUBSCRIBER_USERS_KEY,
	FIRST_SUBSCRIBER_VALUE,
	ROYAL_SUBSCRIBER,
}

const log = logger.create("FirstSubscriberSeed")

/** سقف أمان: استيراد واحد لا يغرق الجهاز. */
const MAX_STOCK_ROWS = 5000
const MAX_USERS = 10

function readKey(key) {
	try {
		return globalThis.localStorage?.getItem(key) ?? null
	} catch {
		return null
	}
}

function removeKey(key) {
	try {
		globalThis.localStorage?.removeItem(key)
	} catch {
		// التخزين غير متاح — لا شيء نحذفه.
	}
}

/** البوابة: لا مفتاح صريح = لا بذر إطلاقًا. */
export function isFirstSubscriberOptedIn() {
	try {
		return readKey(FIRST_SUBSCRIBER_KEY) === FIRST_SUBSCRIBER_VALUE
	} catch {
		return false
	}
}

async function alreadySeeded() {
	try {
		return Boolean(await getSetting(FIRST_SUBSCRIBER_FLAG, false))
	} catch (error) {
		log.warn("could not read the seed flag", error)
		// عند الشك لا نكرر: التكرار قد يضاعف الأرصدة.
		return true
	}
}

/**
 * الشركة/الفرع/العملة إلى إعدادات الجهاز المحلية + مخزن الإعدادات الحي.
 * تُقرأ التقارير من مخزن `posSettings`، والخادم (متى عاد) هو المرجع الأعلى.
 */
async function seedCompany() {
	const rows = {
		"subscriber.company_name": ROYAL_SUBSCRIBER.company_name,
		"subscriber.company_country": ROYAL_SUBSCRIBER.company_country,
		"subscriber.company_city": ROYAL_SUBSCRIBER.company_city,
		"subscriber.company_address": ROYAL_SUBSCRIBER.company_address,
		"subscriber.branch_name": ROYAL_SUBSCRIBER.branch_name,
		"subscriber.branch_code": ROYAL_SUBSCRIBER.branch_code,
		"subscriber.warehouse": ROYAL_SUBSCRIBER.warehouse,
		"subscriber.warehouse_name": ROYAL_SUBSCRIBER.warehouse_name,
		"subscriber.pos_profile": ROYAL_SUBSCRIBER.pos_profile,
		"subscriber.currency": ROYAL_SUBSCRIBER.currency,
	}
	for (const [key, value] of Object.entries(rows)) {
		await setSetting(key, value)
	}

	// طبّق على مخزن الإعدادات الحي حتى تقرأه التقارير فورًا دون انتظار الخادم.
	try {
		const { usePOSSettingsStore } = await import("@/stores/posSettings")
		const store = usePOSSettingsStore()
		const patch = {
			company_name: ROYAL_SUBSCRIBER.company_name,
			company_address: ROYAL_SUBSCRIBER.company_address,
			company_phone: ROYAL_SUBSCRIBER.company_phone,
			branch_name: ROYAL_SUBSCRIBER.branch_name,
			branch_code: ROYAL_SUBSCRIBER.branch_code,
			currency: ROYAL_SUBSCRIBER.currency,
		}
		if (typeof store.applySubscriberProfile === "function") {
			store.applySubscriberProfile(patch)
		}
	} catch {
		// المخزن غير جاهز (اختبار/إقلاع مبكر) — صفوف الإعدادات تكفي.
	}

	try {
		const { configureCurrency } = await import("@/utils/currency")
		configureCurrency({
			currency: ROYAL_SUBSCRIBER.currency,
			locale: ROYAL_SUBSCRIBER.locale,
		})
	} catch {
		// التنسيق الافتراضي يبقى صالحًا.
	}
	return Object.keys(rows).length
}

function parseJsonKey(key) {
	const raw = readKey(key)
	if (!raw) return { present: false, value: null }
	try {
		return { present: true, value: JSON.parse(raw) }
	} catch {
		return { present: true, value: null, invalid: true }
	}
}

/**
 * المستخدمون من مفتاح المالك لمرة واحدة — يُحذف بعد نجاح كامل فقط.
 * كل مستخدم: { email, fullName, password (6+), role?, phone? }.
 */
async function seedUsers() {
	const { present, value, invalid } = parseJsonKey(FIRST_SUBSCRIBER_USERS_KEY)
	if (!present) return { created: [], skipped: [], note: "no-users-key" }
	if (invalid || !Array.isArray(value)) {
		return { created: [], skipped: [], note: "users-key-invalid" }
	}

	const created = []
	const skipped = []
	for (const entry of value.slice(0, MAX_USERS)) {
		const email = String(entry?.email || "")
		try {
			await createLocalUser({
				fullName: entry?.fullName || "",
				email,
				password: entry?.password || "",
				phone: entry?.phone || "",
				company: ROYAL_SUBSCRIBER.company_name,
				role: entry?.role || "CASHIER",
			})
			created.push(email)
		} catch (error) {
			// موجود مسبقًا أو مدخل ضعيف — يُتجاوز ويُذكر، لا يوقف البقية.
			skipped.push({ email, reason: String(error?.message || error) })
		}
	}

	// نجاح كامل (لا متخطَّى) = المفتاح يُحذف فلا يبقى سرّ صريح في المتصفح.
	if (skipped.length === 0) removeKey(FIRST_SUBSCRIBER_USERS_KEY)
	return { created, skipped, note: "ok" }
}

function isValidStockRow(row) {
	if (!row || typeof row !== "object") return false
	const code = String(row.item_code || "").trim()
	const qty = Number(row.qty)
	const rate = Number(row.rate ?? 0)
	if (!code) return false
	if (!Number.isFinite(qty) || qty < 0) return false
	if (!Number.isFinite(rate) || rate < 0) return false
	return true
}

/**
 * الأرصدة الافتتاحية من جرد المالك — تُكتب بنفس شكل كاش الخادم فيقرأها
 * البحث والمخزون والبيع فورًا. تُحذف من localStorage بعد نجاح كامل.
 * الصف: { item_code, item_name?, qty (>=0), rate (>=0), barcode? }.
 */
async function seedOpeningStock() {
	const { present, value, invalid } = parseJsonKey(FIRST_SUBSCRIBER_STOCK_KEY)
	if (!present) return { rows: 0, rejected: 0, note: "no-stock-key" }
	if (invalid || !Array.isArray(value)) {
		return { rows: 0, rejected: 0, note: "stock-key-invalid" }
	}

	const valid = []
	let rejected = 0
	for (const row of value.slice(0, MAX_STOCK_ROWS)) {
		if (isValidStockRow(row)) valid.push(row)
		else rejected += 1
	}

	const warehouse = ROYAL_SUBSCRIBER.warehouse
	const now = Date.now()
	await db.transaction("rw", db.items, db.stock, db.item_prices, async () => {
		if (valid.length > 0) {
			await db.items.bulkPut(
				valid.map((row) => ({
					item_code: String(row.item_code).trim(),
					item_name: String(row.item_name || row.item_code).trim(),
					item_group: String(row.item_group || "عام"),
					barcodes: row.barcode ? [String(row.barcode)] : [],
					opening_stock: true,
				})),
			)
			await db.stock.bulkPut(
				valid.map((row) => ({
					item_code: String(row.item_code).trim(),
					warehouse,
					qty: Number(row.qty),
					updated_at: now,
				})),
			)
			await db.item_prices.bulkPut(
				valid.map((row) => ({
					price_list: "Standard",
					item_code: String(row.item_code).trim(),
					rate: Number(row.rate ?? 0),
					timestamp: now,
				})),
			)
		}
	})

	if (rejected === 0) removeKey(FIRST_SUBSCRIBER_STOCK_KEY)
	return { rows: valid.length, rejected, note: "ok" }
}

/**
 * يضمن بيانات المشترك الأول — آمن للتكرار، صامت دون اشتراك صريح.
 * @returns {Promise<Object>} ملخص ما طُبق (للتشخيص لا للعرض).
 */
export async function ensureFirstSubscriber() {
	if (!isFirstSubscriberOptedIn()) {
		return { applied: false, reason: "not-opted-in" }
	}
	if (await alreadySeeded()) {
		return { applied: false, reason: "already-seeded" }
	}

	const summary = { applied: true, company: 0, users: null, stock: null }
	try {
		summary.company = await seedCompany()
		summary.users = await seedUsers()
		summary.stock = await seedOpeningStock()
		await setSetting(FIRST_SUBSCRIBER_FLAG, true)
		log.info("first subscriber provisioned", {
			company: summary.company,
			users: summary.users?.created?.length ?? 0,
			stock: summary.stock?.rows ?? 0,
		})
		return summary
	} catch (error) {
		log.error("first subscriber seed failed", error)
		return {
			applied: false,
			reason: "failed",
			error: String(error?.message || error),
		}
	}
}

export default ensureFirstSubscriber
