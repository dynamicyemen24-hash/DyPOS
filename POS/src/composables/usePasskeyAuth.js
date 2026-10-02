/**
 * usePasskeyAuth — تسجيل ودخول بالبصمة (WebAuthn / FIDO2).
 *
 * ما لا يفعله هذا الملف ولا الخادم ولا المتصفح: **لا يلمس البصمة ولا
 * الوجه ولا الصورة**. المطابقة تجري داخل وحدة حماية النظام، وما يصل
 * التطبيق توقيع بمفتاح عام فقط. لذلك لا تخزين بيانات بيولوجية، ولا
 * نموذج وجه، ولا `getUserMedia` — كلها تعني مسؤولية خصوصية وقانونية
 * لا نحتاجها. هذه هي الفكرة كلها خلف WebAuthn.
 *
 * المنطق مقسوم عمدًا: `available` (هل المتصفح يدعم) منفصل عن
 * `canRegister` (هل يوجد مستشعر حيوي في الجهاز). الزر «تسجيل» يظهر
 * بعد الدخول و«دخول» يظهر قبله — دمجهما يجعل أحدهما يظهر حيث لا يعمل.
 *
 * الفشل **لا يسدّ الطريق**: أي استثناء يُترجم إلى رسالة عربية ويبقى
 * بكلمة المرور متاحًا. الدخول الحيوي إضافة لا بديل.
 */
import { computed, ref } from "vue"

import { logger } from "@/utils/logger"

const log = logger.create("PasskeyAuth")

/** base64url → ArrayBuffer (ما يرسله المتصفح). */
function fromB64u(value) {
	const padded = String(value).replace(/-/g, "+").replace(/_/g, "/")
	const binary = atob(
		padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="),
	)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
	return bytes.buffer
}

/** ArrayBuffer → base64url. */
function toB64u(buffer) {
	const bytes = new Uint8Array(buffer)
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** هل المتصفح supports الحفارة أصلًا؟ */
const supported = typeof globalThis.PublicKeyCredential !== "undefined"

/** هل يوجد مستشعر حيوي (بصمة/وجه) في هذا الجهاز؟ */
const platformAvailable = ref(false)
if (supported) {
	// الاستعلام غير متاح في كل المتصفحات؛ غيابه لا يعني «لا» — поэтому
	// نبدأ بـ`false` ولا نُظهر زر التسجيل على أساسه وحده.
	globalThis.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
		.then((ok) => {
			platformAvailable.value = Boolean(ok)
		})
		.catch(() => {
			platformAvailable.value = false
		})
}

/**
 * @param {(user: object) => Promise<boolean>|boolean} onAuthenticated
 *   يُستدعى بعد نجاح التحقق على السيرفر ليُكمل نفس مسار الدخول
 *   (`completeAuthentication` في `Login.vue`). **ممرَّر من الخارج لا
 *   مُستورد**: هذا الملف لا يعرف الشاشة، فيصلح لشاشة القفل أيضًا.
 */
export function usePasskeyAuth(onAuthenticated) {
	const busy = ref(false)
	const error = ref("")
	const success = ref("")

	const available = computed(() => supported)
	const canRegister = computed(() => supported && platformAvailable.value)

	function reset() {
		error.value = ""
		success.value = ""
	}

	/** يترجم الاستثناء إلى رسالة عربية. الإلغاء ليس خطأ. */
	function fail(cause, fallback) {
		const name = cause?.name || ""
		if (name === "NotAllowedError" || name === "AbortError") {
			error.value = "أُلغيت العملية. يمكنك المتابعة بكلمة المرور."
			return
		}
		log.warn("passkey ceremony failed", { name, message: cause?.message })
		error.value = fallback
	}

	/** POST JSON مع بيانات الاعتماد (نفس النطاق). */
	async function post(path, payload) {
		const response = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			body: JSON.stringify(payload),
		})
		if (!response.ok) {
			const data = await response.json().catch(() => ({}))
			throw new Error(data.message || `HTTP ${response.status}`)
		}
		return response.json()
	}

	// -----------------------------------------------------------------
	// التسجيل (بعد تسجيل الدخول)
	// -----------------------------------------------------------------

	/**
	 * يسجّل هذا الجهاز للدخول السريع.
	 * @param {string} email - بريد المستخدم المسجَّل حاليًا
	 * @param {string} [deviceLabel] - اسم يظهر في قائمة الأجهزة
	 * @returns {Promise<boolean>}
	 */
	async function register(email, deviceLabel = "") {
		if (!canRegister.value) {
			error.value = "هذا الجهاز لا يدعم التسجيل بالبصمة."
			return false
		}
		if (!email) {
			error.value = "سجّل الدخول أولًا لتسجيل البصمة."
			return false
		}
		reset()
		busy.value = true
		try {
			const options = await post("/api/auth/passkeys/register/options", {
				email,
				deviceLabel,
			})
			const credential = await navigator.credentials.create({
				publicKey: {
					challenge: fromB64u(options.challenge),
					rp: { id: options.rp?.id, name: options.rp?.name },
					user: {
						id: fromB64u(options.user?.id),
						name: options.user?.name,
						displayName: options.user?.displayName,
					},
					pubKeyCredParams: options.pubKeyCredParams || [],
					timeout: options.timeout || 60000,
					// `userVerification: required` ليس اختياريًا هنا: بدونه
					// يقبل المتصفح PIN ويصبح الوسم «بصمة» غير صحيح.
					authenticatorSelection: {
						authenticatorAttachment: "platform",
						userVerification: "required",
						residentKey: "preferred",
					},
					excludeCredentials: options.excludeCredentials || [],
				},
			})
			if (!credential) {
				error.value = "لم يتم تسجيل أي بصمة."
				return false
			}
			const assertion = credential.response
			await post("/api/auth/passkeys/register", {
				challenge: options.challenge,
				clientDataJSON: toB64u(assertion.clientDataJSON),
				attestationObject: toB64u(assertion.attestationObject),
				deviceLabel,
				response: { transports: assertion.getTransports?.() || [] },
			})
			success.value = "تم تسجيل هذا الجهاز للدخول السريع."
			return true
		} catch (cause) {
			fail(cause, "تعذّر تسجيل البصمة على هذا الجهاز.")
			return false
		} finally {
			busy.value = false
		}
	}

	// -----------------------------------------------------------------
	// الدخول (قبل تسجيل الدخول)
	// -----------------------------------------------------------------

	/**
	 * يدخل بالبصمة.
	 * @param {string} email - البريد (يُستخدم لاختيار المفتاح)
	 * @returns {Promise<boolean>} نجاح يعني: الجلسة مفتوحة
	 */
	async function login(email) {
		if (!available.value) {
			error.value = "المتصفح لا يدعم الدخول بالبصمة."
			return false
		}
		if (!email) {
			error.value = "أدخل البريد الإلكتروني أولًا."
			return false
		}
		reset()
		busy.value = true
		try {
			const options = await post("/api/auth/passkeys/login/options", { email })
			const assertion = await navigator.credentials.get({
				publicKey: {
					challenge: fromB64u(options.challenge),
					// قائمة فارغة = اكتشاف تلقائي لكل مفاتيح الجهاز،
					// وهو السلوك الذي يتوقعه المستخدم من «البصمة».
					allowCredentials: options.allowCredentials || [],
					userVerification: "required",
					timeout: options.timeout || 60000,
				},
			})
			if (!assertion) {
				error.value = "أُلغي طلب البصمة."
				return false
			}
			const result = assertion.response
			const data = await post("/api/auth/passkeys/login", {
				challenge: options.challenge,
				id: assertion.id,
				clientDataJSON: toB64u(result.clientDataJSON),
				authenticatorData: toB64u(result.authenticatorData),
				signature: toB64u(result.signature),
				userHandle: result.userHandle ? toB64u(result.userHandle) : null,
			})
			// نفس مسار الدخول بكلمة المرور: `Login.vue` يملك الجلسة
			// والعدّادات والانت redirections، فلا يُكرَّر أيٌّ منها هنا.
			return typeof onAuthenticated === "function"
				? Boolean(await onAuthenticated(data.user))
				: true
		} catch (cause) {
			fail(cause, "تعذّر التحقق من البصمة. استخدم كلمة المرور.")
			return false
		} finally {
			busy.value = false
		}
	}

	return {
		available,
		canRegister,
		busy,
		error,
		success,
		register,
		login,
		reset,
	}
}

export default usePasskeyAuth
