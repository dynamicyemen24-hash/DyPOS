/**
 * أنواع الأخطاء ومفهوم إعادة المحاولة للسحب والند للدفع
 */

export const SyncErrorKind = {
	// شبكة واتصال
	NETWORK_UNAVAILABLE: "NETWORK_UNAVAILABLE",
	TIMEOUT: "TIMEOUT",
	DNS_FAIL: "DNS_FAIL",

	// مصادقة
	AUTH_EXPIRED: "AUTH_EXPIRED",
	AUTH_REVOKED: "AUTH_REVOKED",
	AUTH_REQUIRED: "AUTH_REQUIRED",

	// منصة الرئيسية
	REMOTE_NOT_FOUND: "REMOTE_NOT_FOUND",
	REMOTE_CONFLICT: "REMOTE_CONFLICT",
	REMOTE_FORBIDDEN: "REMOTE_FORBIDDEN",
	REMOTE_SERVER_ERROR: "REMOTE_SERVER_ERROR",

	// بيانات محلية
	LOCAL_VALIDATION_FAILED: "LOCAL_VALIDATION_FAILED",
	LOCAL_INTEGRITY_CHECK_FAIL: "LOCAL_INTEGRITY_CHECK_FAIL",
	MISSING_REQUIRED_DATA: "MISSING_REQUIRED_DATA",

	// نزاعات
	CONFLICT_UNRESOLVED: "CONFLICT_UNRESOLVED",
	CONFLICT_AUTO_RESOLVED: "CONFLICT_AUTO_RESOLVED",

	// نظام
	DB_ERROR: "DB_ERROR",
	UNKNOWN: "UNKNOWN",
}

const KIND_TO_LABEL = {
	[SyncErrorKind.NETWORK_UNAVAILABLE]: "شبكة غير متاحة — جارٍ الانتظار",
	[SyncErrorKind.TIMEOUT]: "انتهت مهلة الاتصال — جارٍ إعادة المحاولة",
	[SyncErrorKind.AUTH_EXPIRED]: "انتهت صلاحية المصادقة — جارٍ التحديث",
	[SyncErrorKind.AUTH_REVOKED]: "تم إبطال المصادقة — يحتاج إعادة تسجيل الدخول",
	[SyncErrorKind.REMOTE_CONFLICT]: "تعارض مع المنصة الرئيسية — جارٍ حل النزاع",
	[SyncErrorKind.REMOTE_NOT_FOUND]: "عنصر غير موجود على المنصة الرئيسية",
	[SyncErrorKind.LOCAL_VALIDATION_FAILED]:
		"بيانات محلية غير صحيحة — تم رفض المزامنة",
	[SyncErrorKind.CONFLICT_UNRESOLVED]:
		"نزاع لم يُحل تلقائيًا — يحتاج مراجعة يدوية",
	[SyncErrorKind.DB_ERROR]: "خطأ في قاعدة البيانات المحلية",
	[SyncErrorKind.UNKNOWN]: "خطأ غير متوقع",
}

export function getSyncErrorLabel(kind) {
	return KIND_TO_LABEL[kind] || KIND_TO_LABEL[SyncErrorKind.UNKNOWN]
}

/**
 * هل الخطأ يعيد المحاولة تلقائيًا؟
 */
export function isRetryable(kind) {
	return [
		SyncErrorKind.NETWORK_UNAVAILABLE,
		SyncErrorKind.TIMEOUT,
		SyncErrorKind.REMOTE_SERVER_ERROR,
		SyncErrorKind.DNS_FAIL,
		SyncErrorKind.REMOTE_CONFLICT,
		SyncErrorKind.CONFLICT_UNRESOLVED,
		SyncErrorKind.DB_ERROR,
	].includes(kind)
}

/**
 * بنّاء خطأ موحّد
 */
export class SyncError extends Error {
	constructor(kind, message, details = {}) {
		super(message)
		this.name = "SyncError"
		this.kind = kind
		this.details = details
		this.statusCode = details.statusCode || 0
		this.entityType = details.entityType || null
		this.entityId = details.entityId || null
	}

	toJSON() {
		return {
			kind: this.kind,
			message: this.message,
			details: this.details,
			timestamp: new Date().toISOString(),
		}
	}
}

// ثوابت زمن الانتظار
export const RETRY_BASE_DELAY = 1000 // ms
export const RETRY_MAX_DELAY = 30000 // ms
export const RETRY_MAX_ATTEMPTS = 5
export const SYNC_POLL_INTERVAL = 15000 // ms — كل 15 ثانية تتحقق من اتصال جديد
export const CONNECTIVITY_CHECK_INTERVAL = 3000 // ms — فحص سريع وصول الشبكة

export default {
	SyncErrorKind,
	SyncError,
	getSyncErrorLabel,
	isRetryable,
	RETRY_BASE_DELAY,
	RETRY_MAX_DELAY,
	RETRY_MAX_ATTEMPTS,
	SYNC_POLL_INTERVAL,
	CONNECTIVITY_CHECK_INTERVAL,
}
