/**
 * هوية المشترك الأول — رويال العالمية (اليمن، مأرب).
 *
 * بيانات علنية هيكلية فقط (اسم/مدينة/عملة/مستودع) — بلا أسرار وبلا أرصدة.
 * الهاتف والبريد والسجل الضريبي فارغة عمدًا: أرقام لا نعرفها تُملأ من
 * الإعدادات لا تُخترع هنا (S1). تُطبق فقط باشتراك صريح على الجهاز
 * (`dypos.first_subscriber=royal-marib`) عبر `firstSubscriberSeed.js`.
 */

/** بوابة التشغيل الصريح على الجهاز. */
export const FIRST_SUBSCRIBER_KEY = "dypos.first_subscriber"
export const FIRST_SUBSCRIBER_VALUE = "royal-marib"
export const FIRST_SUBSCRIBER_USERS_KEY = "dypos.first_subscriber.users"
export const FIRST_SUBSCRIBER_STOCK_KEY = "dypos.first_subscriber.opening_stock"

/** علم منع التكرار في إعدادات IndexedDB. */
export const FIRST_SUBSCRIBER_FLAG = "firstSubscriberSeeded.v1"

export const ROYAL_SUBSCRIBER = Object.freeze({
	company_name: "رويال العالمية لتجارة أدوات التجميل والعطور",
	company_country: "اليمن",
	company_city: "مأرب",
	company_address: "اليمن — محافظة مأرب",
	company_phone: "",
	company_email: "",
	company_tax_id: "",
	currency: "YER",
	locale: "ar-YE",
	branch_name: "فرع مأرب",
	branch_code: "MARIB",
	warehouse: "W-01",
	warehouse_name: "مستودع مأرب الرئيسي",
	pos_profile: "نقطة بيع مأرب",
})

export default ROYAL_SUBSCRIBER

/**
 * اشتراك برابط واحد: `?subscriber=royal-marib` (ولا أسرار في الرابط أبدًا).
 * يثبت المفتاح في localStorage وينظف الرابط — بما فيه نسخة حارس التوجيه
 * داخل `redirect` — فلا لصق ولا أثر في السجل.
 */
export function claimUrlOptIn() {
	try {
		// بلا مضيف احتياطي (`standaloneBoot` ترفض الاسم الحرفي) — وغياب
		// `location` يعني لا متصفح أصلًا فيُرفض بهدوء.
		const url = new URL(globalThis.location?.href || "")
		const scrub = (u) => {
			if (u.searchParams.get("subscriber") !== FIRST_SUBSCRIBER_VALUE)
				return false
			u.searchParams.delete("subscriber")
			return true
		}
		let claimed = scrub(url)
		try {
			const nested = url.searchParams.get("redirect") || ""
			if (nested.includes("subscriber=")) {
				const inner = new URL(nested, url.origin)
				if (scrub(inner)) {
					url.searchParams.set(
						"redirect",
						inner.pathname + inner.search + inner.hash,
					)
					claimed = true
				}
			}
		} catch {
			// redirect تالف — يُتجاهل، الاشتراك المباشر يكفي.
		}
		if (claimed) {
			globalThis.localStorage?.setItem(
				FIRST_SUBSCRIBER_KEY,
				FIRST_SUBSCRIBER_VALUE,
			)
			try {
				globalThis.history?.replaceState?.(
					null,
					"",
					url.pathname + url.search + url.hash,
				)
			} catch {
				// التنظيف تجميلي — الاشتراك نفسه تم.
			}
		}
		return (
			globalThis.localStorage?.getItem(FIRST_SUBSCRIBER_KEY) ===
			FIRST_SUBSCRIBER_VALUE
		)
	} catch {
		return false
	}
}
