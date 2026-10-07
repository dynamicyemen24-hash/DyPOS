import { ref } from "vue"
import { __ } from "@/utils/translation"

/**
 * useLoginEmail — منطق معالجة البريد الإلكتروني في شاشة الدخول
 *
 * يستخرج منطق إكمال البريد الإلكتروني من Login.vue ليبقي الصفحة تحت رافعة الحجم.
 */
export function useLoginEmail({ email, emailInput, showEmailSuggestions }) {
	function completeEmail(domain) {
		email.value = `${email.value}@${domain}`
		showEmailSuggestions.value = false
		emailInput.value?.focus()
	}

	return {
		completeEmail,
	}
}

export default useLoginEmail
