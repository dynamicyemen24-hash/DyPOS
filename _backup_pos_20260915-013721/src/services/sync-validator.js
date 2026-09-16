/**
 * التحقق من صحة البيانات قبل إرسالها للمنصة الرئيسية
 * وكذلك التحقق من صحة البيانات المسترجعة من الردود.
 */

import { SyncError, SyncErrorKind } from "./sync-error.js"
import db from "./db.js"

const REQUIRED_FIELDS = {
	customer: ["code", "name"],
	item: ["code", "name", "price"],
	invoice: ["customerId", "items", "total"],
	payment: ["invoiceId", "method", "amount"],
	stock: ["itemId", "qty"],
	session: ["cashierId", "registerId", "shiftNo"],
}

function missingFields(fields, data) {
	return fields.filter(
		(f) => data[f] === undefined || data[f] === null || data[f] === "",
	)
}

/**
 * التحقق من صحة كيان قبل الإرسال
 */
export function validateBeforeSync(entityType, data) {
	const required = REQUIRED_FIELDS[entityType]
	if (!required) return { ok: true }

	const missing = missingFields(required, data)
	if (missing.length) {
		throw new SyncError(
			SyncErrorKind.LOCAL_VALIDATION_FAILED,
			`بيانات "${entityType}" ناقصة الحقول: ${missing.join(", ")}`,
			{ entityType, missing },
		)
	}

	return { ok: true }
}

/**
 * التحقق من الدقة العددية للأسعار والمبالغ
 */
export function validateCurrencyFields(entityType, data) {
	const currencyFields = [
		"price",
		"cost",
		"total",
		"paid",
		"balance",
		"amount",
		"qty",
	]
	for (const field of currencyFields) {
		if (data[field] !== undefined && data[field] !== null) {
			const val = Number(data[field])
			if (Number.isNaN(val) || !Number.isFinite(val)) {
				throw new SyncError(
					SyncErrorKind.LOCAL_VALIDATION_FAILED,
					`"${field}" قيمة عددية غير صالحة: ${data[field]}`,
					{ entityType, field, value: data[field] },
				)
			}
		}
	}
	return { ok: true }
}

/**
 * التحقق من السعة العظمى للكميات (لمنع الـ double-opt-in)
 */
export function validateQuantities(data, maxStock) {
	const qty = Number(data.qty)
	if (Number.isNaN(qty) || qty < 0) {
		throw new SyncError(
			SyncErrorKind.LOCAL_VALIDATION_FAILED,
			"الكمية سالبة أو غير عددية",
			{ entityType: "stock", value: data.qty },
		)
	}
	if (maxStock !== null && qty > maxStock) {
		throw new SyncError(
			SyncErrorKind.LOCAL_VALIDATION_FAILED,
			"الكمية أكبر من المخزون الإجمالي",
			{ entityType: "stock", overStockBy: qty - maxStock },
		)
	}
	return { ok: true }
}

/**
 * التحقّق من سلامة الردود القادمة من المنصة
 */
export function validateRemoteResponse(entityType, remoteData) {
	// نتحقق من أن الرد يحتوي على الحقول الأساسية المطلوبة
	const required = REQUIRED_FIELDS[entityType]
	if (!required) return { ok: true }

	const missing = missingFields(required, remoteData)
	if (missing.length) {
		throw new SyncError(
			SyncErrorKind.REMOTE_SERVER_ERROR,
			`رد غير مكتمل من المنصة: ناقص ${entityType} الحقول: ${missing.join(", ")}`,
			{ entityType, missing },
		)
	}

	return { ok: true }
}

/**
 * فحص التكامل المحلي: هل كل العناصر المرجعية موجودة؟
 * مثال: هل الفاتورة تشير إلى عميل موجود محليًا؟
 */
export async function checkLocalIntegrity(invoiceData) {
	if (!invoiceData.customerId) return { ok: true, missing: [] }
	const customer = await db.customers.get(invoiceData.customerId)
	if (!customer) {
		throw new SyncError(
			SyncErrorKind.MISSING_REQUIRED_DATA,
			"العميل غير موجود محليًا",
			{
				entityType: "invoice",
				missing: "customerId",
				customerId: invoiceData.customerId,
			},
		)
	}
	return { ok: true }
}

/**
 * التحقق من صحة التواريخ
 */
export function validateDates(data) {
	const dateFields = ["date", "dueDate", "expiryDate", "openedAt", "closedAt"]
	for (const field of dateFields) {
		if (data[field] !== undefined && data[field] !== null) {
			const d = new Date(data[field])
			if (Number.isNaN(d.getTime())) {
				throw new SyncError(
					SyncErrorKind.LOCAL_VALIDATION_FAILED,
					`"${field}" تاريخ غير صالح: ${data[field]}`,
					{ entityType: "generic", field, value: data[field] },
				)
			}
		}
	}
	return { ok: true }
}

export default {
	validateBeforeSync,
	validateCurrencyFields,
	validateQuantities,
	validateRemoteResponse,
	checkLocalIntegrity,
	validateDates,
}
