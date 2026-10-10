import { ref, computed } from "vue"
import { useBiometric } from "@/composables/useBiometric"
import { getPasswordStrength } from "@/utils/passwordPolicy"
import { methodGetList } from "@/utils/methodClient"
import { isLinkEnabled } from "@/services/link-consent"
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
		// Login screen must be interactive immediately. Branch discovery is
		// secondary data and must never delay the credential form.
		try {
			biometricAvailable.value = await useBiometric().available()
		} catch {
			biometricAvailable.value = false
		}

		try {
			const persistedBranch = localStorage.getItem("dypos.lastBranchId") || ""
			selectedBranchId.value = persistedBranch
		} catch {
			selectedBranchId.value = ""
		}

		subscriberCode.value = ""
		void loadRemoteBranches()
	}

	async function loadRemoteBranches() {
		// بلا موافقة ربط: صفر شبكة — قائمة الفروع البعيدة لا تُطلب أصلًا،
		// والدخول المحلي لا يحتاجها (الفرع اختياري في submitLogin).
		if (!isLinkEnabled()) return
		if (typeof navigator !== "undefined" && navigator.onLine === false) return
		try {
			const response = await methodGetList(endpoints.branches.list, {
				fields: ["name"],
				limit: 200,
			})
			branches.value = Array.isArray(response.message) ? response.message : []
		} catch {
			// Branch discovery is optional before authentication.
			branches.value = []
		}
	}

	function handleGlobalKeydown(event) {
		if (event.key !== "Enter" || event.shiftKey) return
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
		selectBranch,
	}
}
