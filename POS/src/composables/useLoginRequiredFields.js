import { computed, ref } from "vue"

export function useLoginRequiredFields({
	email,
	password,
	emailInput,
	passwordInput,
}) {
	const attempted = ref(false)

	const emailMissing = computed(() => attempted.value && !email.value.trim())
	const passwordMissing = computed(() => attempted.value && !password.value)

	function validate() {
		attempted.value = true

		if (emailMissing.value) {
			emailInput.value?.focus?.()
			return false
		}
		if (passwordMissing.value) {
			passwordInput.value?.focus?.()
			return false
		}

		attempted.value = false
		return true
	}

	return { emailMissing, passwordMissing, validate }
}
