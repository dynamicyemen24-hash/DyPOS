/**
 * usePasskeyDevices — قراءة وإدارة الأجهزة الموثوقة.
 *
 * منفصل عن `usePasskeyAuth` عن قصد: ذاك **يحفظ** (Ceremonies WebAuthn،
 * تحتاج جهازًا حيويًا)، وهذا **يدير** (قائمة، إبطال، تسمية). دمجهما
 * كان سيجعل شاشة الإعدادات تسحب منطق الـceremony، وشاشة الدخول تسحب
 * استعلامًا لا تحتاجه.
 *
 * كل نداء يذهب عبر جلسة صالحة (`/api/auth/passkeys` محمي بـ
 * `authMiddleware`)، والقائمة تُقرأ من جديد بعد كل إبطال بدل تعديل
 * محلي — لأن الخادم هو من يملك القاعدة.
 */
import { computed, ref } from "vue"

import { logger } from "@/utils/logger"

const log = logger.create("PasskeyDevices")

/**
 * `catch` يعطي `unknown` تحت `useUnknownInCatchVariables`، فلا-smiley
 * الوصول إلى `.message` مباشرة. هذا المستخرج يجعل الرسالة متاحة
 * دون casts متكرّرة.
 */
function messageOf(cause: unknown): string {
	if (cause instanceof Error) return cause.message
	return typeof cause === "string" ? cause : ""
}

/** جهاز موثوق كما يراه العميل. */
export interface TrustedDevice {
	readonly id: string
	readonly label: string
	readonly created_at: string
	readonly last_used_at: string | null
	readonly revoked: boolean
	readonly synced: boolean
}

/** مُلخّص عددي — العدّاد في الشارة، والصفوف في القائمة. */
export interface DeviceSummary {
	readonly total: number
	readonly active: number
	readonly revoked: number
}

export function usePasskeyDevices() {
	const devices = ref<TrustedDevice[]>([])
	const summary = ref<DeviceSummary | null>(null)
	const loading = ref(false)
	const busy = ref(false)
	const error = ref("")
	const success = ref("")

	/** حالة فارغة ≠ لم يُقرأ بعد. الاثنتان تُعرضان بنصّين مختلفين. */
	const isEmpty = computed(() => !loading.value && devices.value.length === 0)

	function reset() {
		error.value = ""
		success.value = ""
	}

	/** طلب JSON مع جلسة صالحة. */
	async function request(path: string, init: RequestInit = {}) {
		const response = await fetch(path, {
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			...init,
		})
		if (!response.ok) {
			const data = await response.json().catch(() => ({}))
			throw new Error(data.message || `HTTP ${response.status}`)
		}
		return response.status === 204 ? null : response.json()
	}

	/** يقرأ القائمة. الفشل **لا** يُعرض كـ«لا أجهزة». */
	async function load(): Promise<boolean> {
		loading.value = true
		try {
			const data = await request("/api/auth/passkeys")
			devices.value = Array.isArray(data?.passkeys) ? data.passkeys : []
			summary.value = data?.summary ?? null
			error.value = ""
			return true
		} catch (cause) {
			// «تعذّر قراءة القائمة» ليست «لا توجد أجهزة» — الفرق يُهمس
			// «تعذّر قراءة القائمة» ليست «لا توجد أجهزة» — الفرق يُهمس
			// بكلمة «لا أجهزة».
			log.warn("passkey device list failed", { message: messageOf(cause) })
			return false
		} finally {
			loading.value = false
		}
	}

	/** إبطال مفتاح جهاز. إبطال لا حذف — الخادم يبقي الأثر. */
	async function revoke(id: string): Promise<boolean> {
		busy.value = true
		try {
			await request(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
				method: "DELETE",
			})
			success.value = "تم إبطال الدخول من هذا الجهاز."
			return true
		} catch (cause) {
			error.value =
				messageOf(cause) ||
				"تعذّر إبطال الجهاز. تحقّق من الاتصال ثم أعد المحاولة."
			return false
		} finally {
			busy.value = false
		}
	}

	/** إعادة تسمية جهاز — للتمييز بين أجهزة متشابهة. */
	async function rename(id: string, label: string): Promise<boolean> {
		busy.value = true
		try {
			await request(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify({ label }),
			})
			success.value = "تم تغيير اسم الجهاز."
			return true
		} catch (cause) {
			error.value = messageOf(cause) || "تعذّر تغيير اسم الجهاز."
			return false
		} finally {
			busy.value = false
		}
	}

	return {
		devices,
		summary,
		isEmpty,
		loading,
		busy,
		error,
		success,
		load,
		revoke,
		rename,
		reset,
	}
}

export default usePasskeyDevices
