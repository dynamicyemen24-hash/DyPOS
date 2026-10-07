import { ref, onMounted } from "vue"
import { methodGetList } from "@/utils/methodClient"
import { endpoints } from "@/utils/apiEndpoints"
import { useBiometric } from "@/composables/useBiometric"
import { logger } from "@/utils/logger"
import { isLinkEnabled } from "@/services/link-consent"

const log = logger.create("useLoginMethods")

export function useLoginMethods({
	selectedMethod,
	showKeyboard,
	biometricResult,
	biometricAvailable,
	branches,
	selectedBranchId,
	subscriberCode,
	touchKeyboardRef,
}) {
	async function selectMethod(key) {
		if (touchKeyboardRef.value) {
			touchKeyboardRef.value.stopScan?.()
			touchKeyboardRef.value = null
		}
		showKeyboard.value = false
		biometricResult.value = null

		selectedMethod.value = key

		if (key === "keyboard") {
			showKeyboard.value = true
		} else if (key === "biometric") {
			biometricResult.value = { processing: true }
			const { verify } = useBiometric()
			verify()
				.then((res) => {
					biometricResult.value = {
						success: res.success,
						...(res.error ? { error: res.error } : {}),
					}
					if (res.success) return true
				})
				.catch((err) => {
					biometricResult.value = {
						success: false,
						error: err.message ?? "حدث خطأ غير متوقع",
					}
				})
		}
	}

	async function loadBranches() {
		if (!isLinkEnabled()) return
		try {
			const response = await methodGetList(endpoints.branches.list, {
				fields: ["name"],
				limit: 200,
			})
			if (Array.isArray(response.message)) {
				branches.value = response.message
				if (!selectedBranchId.value && response.message.length > 0) {
					selectedBranchId.value = response.message[0].id
				}
			}
		} catch (e) {
			log.warn("Failed to load branches", e)
		}
	}

	async function checkBiometricAvailability() {
		try {
			const { isAvailable } = useBiometric()
			const available = await isAvailable()
			biometricAvailable.value = available
		} catch (e) {
			biometricAvailable.value = false
		}
	}

	function onBranchChange() {
		if (selectedBranchId.value) {
			localStorage.setItem("dypos.lastBranchId", selectedBranchId.value)
			log.info("Branch selected", { branchId: selectedBranchId.value })
		}
	}

	/**
	 * Read the subscription code the login screen displays.
	 *
	 * This used to fall back to `session.value?.subscriber_code` /
	 * `?.company_code`, but there is no `session` binding in this module at all —
	 * the identifier was never declared, so the reference threw a `ReferenceError`
	 * that the `catch` swallowed into a warn log. The effect was that the code
	 * could ONLY ever come from `localStorage`, and the dead branch advertised a
	 * fallback the function never had. Neither field exists anywhere in the app
	 * (`session` in `@/data/session` carries `user`/`isLoggedIn` only), so the
	 * honest implementation reads the one source that really holds it.
	 *
	 * No placeholder: an empty code simply hides the row (`v-if="subscriberCode"`).
	 */
	function loadSubscriberCode() {
		try {
			const code = localStorage.getItem("dypos.subscriberCode")
			if (code) {
				subscriberCode.value = code
			}
		} catch (e) {
			log.warn("Failed to load subscriber code", e)
		}
	}

	async function initializeLoginData() {
		await Promise.all([
			loadBranches(),
			checkBiometricAvailability(),
			loadSubscriberCode(),
		])
	}

	return {
		selectMethod,
		loadBranches,
		checkBiometricAvailability,
		onBranchChange,
		loadSubscriberCode,
		initializeLoginData,
	}
}
