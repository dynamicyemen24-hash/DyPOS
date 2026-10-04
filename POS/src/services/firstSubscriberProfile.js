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
