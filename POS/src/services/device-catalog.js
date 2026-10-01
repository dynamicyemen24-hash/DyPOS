/**
 * كتالوج الجهاز — مصدر الحقيقة الوحيد لشاشة البيع، محلي 100%.
 *
 * يجمع مصدرين محليين لا ثالث لهما (بلا أي شبكة):
 *   1) مستودعات الجهاز (`repositories/*` فوق Dexie `DyPOS-Offline-v1`):
 *      إدخال المالك اليدوي + ما طبّقه السحب الأولي المُوافَق من SQLite.
 *   2) الكاش القديم (`utils/offline/cache` فوق Dexie `DyPOS_offline`):
 *      لقطات مسحوبة من السيرفر سابقًا.
 * إزالة التكرار بالرمز/الباركود، وصفوف الجهاز أولًا. أي صف يُباع هنا
 * يُحفظ في الطابور المحلي؛ المزامنة للسيرفر طلب مستقل تمامًا.
 */

import { productRepository } from "@/repositories/productRepository"
import { customerRepository } from "@/repositories/customerRepository"
import { searchCachedCustomers, searchCachedItems } from "@/utils/offline/cache"

const DEFAULT_PRODUCT_LIMIT = 500
const DEFAULT_CUSTOMER_LIMIT = 100

function normKey(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
}

function productKey(row) {
	return (
		normKey(row?.barcode) ||
		normKey(row?.bar_code) ||
		normKey(row?.code) ||
		normKey(row?.item_code) ||
		normKey(row?.id)
	)
}

function customerKey(row) {
	return (
		normKey(row?.phone) ||
		normKey(row?.mobile_no) ||
		normKey(row?.name) ||
		normKey(row?.customer_name) ||
		normKey(row?.id)
	)
}

/**
 * كل أصناف الجهاز (صفوف المستودعات أولًا، ثم تتمة الكاش بلا تكرار).
 * @param {number} [limit]
 * @returns {Promise<Array<Object>>}
 */
export async function listDeviceProducts(limit = DEFAULT_PRODUCT_LIMIT) {
	const cap = Math.max(
		1,
		Math.min(Number(limit) || DEFAULT_PRODUCT_LIMIT, 2000),
	)
	const [repoRows, cachedRows] = await Promise.all([
		productRepository.search("", cap).catch(() => []),
		searchCachedItems("", cap).catch(() => []),
	])
	const seen = new Set()
	const merged = []
	for (const row of [...(repoRows || []), ...(cachedRows || [])]) {
		if (!row) continue
		const key = productKey(row)
		if (key && seen.has(key)) continue
		if (key) seen.add(key)
		merged.push(row)
		if (merged.length >= cap) break
	}
	return merged
}

/**
 * عدد أصناف الجهاز (للحالات الصادقة: فارغ = بلا بيانات لا بلا شبكة).
 * @returns {Promise<number>}
 */
export async function countDeviceProducts() {
	const [repoRows, cachedRows] = await Promise.all([
		productRepository.search("", 2000).catch(() => []),
		searchCachedItems("", 2000).catch(() => []),
	])
	const seen = new Set()
	for (const row of [...(repoRows || []), ...(cachedRows || [])]) {
		const key = productKey(row)
		if (key) seen.add(key)
		else seen.add(`row:${seen.size}`)
	}
	return seen.size
}

/**
 * عملاء الجهاز (المستودع المحلي أولًا ثم الكاش، بلا تكرار).
 * @param {string} [query]
 * @param {number} [limit]
 * @returns {Promise<Array<Object>>}
 */
export async function searchDeviceCustomers(
	query = "",
	limit = DEFAULT_CUSTOMER_LIMIT,
) {
	const cap = Math.max(
		1,
		Math.min(Number(limit) || DEFAULT_CUSTOMER_LIMIT, 500),
	)
	const [repoRows, cachedRows] = await Promise.all([
		customerRepository.search(query, cap).catch(() => []),
		searchCachedCustomers(query, cap).catch(() => []),
	])
	const seen = new Set()
	const merged = []
	for (const row of [...(repoRows || []), ...(cachedRows || [])]) {
		if (!row) continue
		const key = customerKey(row)
		if (key && seen.has(key)) continue
		if (key) seen.add(key)
		merged.push(row)
		if (merged.length >= cap) break
	}
	return merged
}

/** حدث يُبث عند تغيّر الكتالوج المحلي (إدخال صنف) فتُعيد الشاشات القراءة. */
export const CATALOG_CHANGED_EVENT = "dypos:catalog-changed"

export function notifyCatalogChanged(detail = {}) {
	try {
		if (
			typeof window !== "undefined" &&
			typeof window.dispatchEvent === "function"
		) {
			window.dispatchEvent(new CustomEvent(CATALOG_CHANGED_EVENT, { detail }))
			return true
		}
	} catch {
		/* بيئة بلا window (اختبارات SSR) — لا حدث */
	}
	return false
}
