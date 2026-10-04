import { ref, computed } from "vue"
import { useBiometric } from "@/composables/useBiometric"
import { getPasswordStrength } from "@/utils/passwordPolicy"
import { methodGetList } from "@/utils/methodClient"
import { endpoints } from "@/utils/apiEndpoints"
import { __ } from "@/utils/translation"
import { logger } from "@/utils/logger"

const log = logger.create("useLoginForm")

export function useLoginForm({
	email,
	password,
	showPassword,
	isSubmitting,
	loginError,
	selectedMethod,
	biometricResult,
	biometricAvailable,
	touchKeyboardRef,
	showKeyboard,
	branches,
	selectedBranchId,
	subscriberCode,
	loginForm,
}) {
	const passwordStrength = computed(() => getPasswordStrength(password.value))

	async function attemptBiometricLogin() {
		if (!biometricResult.value?.processing) return

		try {
			const res = await useBiometric().verify()

			if (res.success) {
				return { success: true, method: "biometric" }
			}

			biometricResult.value = { error: res.error ?? __("فشل التحقق من البصمة") }
		} catch (err) {
			biometricResult.value = { error: err.message ?? __("خطأ غير متوقع") }
		}

		return { success: false }
	}

	async function handleSubmitLogin({ submitLogin }) {
		if (isSubmitting.value) return false

		isSubmitting.value = true
		loginError.value = ""

		try {
			await submitLogin()
			return true
		} catch (error) {
			log.warn("DyPOS login failed", error)
			return false
		} finally {
			isSubmitting.value = false
		}
	}

	async function initializeLoginData() {
		try {
			biometricAvailable.value = await useBiometric().available()
		} catch {
			biometricAvailable.value = false
		}

		try {
			const response = await methodGetList(endpoints.branches.list, {
				fields: ["name"],
				limit: 200,
			})
			branches.value = response.message || []
		} catch {
			branches.value = []
		}

		subscriberCode.value = ""
		selectedBranchId.value = ""
	}

	function handleGlobalKeydown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			if (selectedMethod.value === "keyboard" && touchKeyboardRef.value) {
				touchKeyboardRef.value.close?.()
			}
		}
	}

	function onMethodSelect(method) {
		selectedMethod.value = method

		if (method === "keyboard" && !showKeyboard.value) {
			showKeyboard.value = true
		} else if (method !== "keyboard") {
			showKeyboard.value = false
		}
	}

	function selectBranch(branchId) {
		selectedBranchId.value = branchId
	}

	return {
		passwordStrength,
		attemptBiometricLogin,
		handleSubmitLogin,
		initializeLoginData,
		handleGlobalKeydown,
		onMethodSelect,
		selectBranch,
	}
}
