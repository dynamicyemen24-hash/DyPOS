import { nextTick } from "vue"
import { logger } from "@/utils/logger"

/**
 * useLoginErrorHandling — معالجات أخطاء شاشة الدخول
 *
 * يستخرج منطق معالجة الأخطاء من Login.vue ليبقي الصفحة تحت رافعة الحجم.
 * يوفر دوالاً موحدة لـ:
 * - مسح الخطأ
 * - التركيز على حقول الإدخال
 * - معالجة الدخول في وضع عدم الاتصال
 */
export function useLoginErrorHandling({
	loginError,
	emailInput,
	passwordInput,
	clearLoginError,
}) {
	/** معالج الدخول في وضع عدم الاتصال: يمسح الخطأ ويسمح للمستخدم بالمحاولة محلياً. */
	function handleOfflineLogin() {
		clearLoginError()
		log.info("User chose to continue in offline mode")
	}

	/** تركيز حقل البريد الإلكتروني لتصحيح البيانات. */
	function focusEmailField() {
		clearLoginError()
		nextTick(() => {
			emailInput.value?.focus?.()
		})
	}

	/** تركيز حقل كلمة المرور لتصحيح البيانات. */
	function focusPasswordField() {
		clearLoginError()
		nextTick(() => {
			passwordInput.value?.focus?.()
		})
	}

	return {
		handleOfflineLogin,
		focusEmailField,
		focusPasswordField,
	}
}

export default useLoginErrorHandling
