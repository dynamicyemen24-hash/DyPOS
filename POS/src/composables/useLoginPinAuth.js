import { ref, computed } from "vue"
import { usePinAuth } from "@/composables/usePinAuth"
import { sanitizePin, validatePinPair } from "@/composables/usePinAuthRules"
import { __ } from "@/utils/translation"
import { logger } from "@/utils/logger"

const log = logger.create("useLoginPin")

/** نصوص زر «إنشاء رمز دخول سريع» المعطّل. */
const PIN_DEVICE_HINT = "اضبط رمز دخول سريع لهذا الجهاز"
const PIN_EMAIL_TOO_SHORT = "أدخل بريدك أولًا"
const PIN_EMAIL_REQUIRED = "أدخل بريدك الإلكتروني أولًا لتمكين إنشاء رمز PIN"

export function useLoginPinAuth({ email } = {}) {
	/**
	 * `showPinSetup` and `pinModeActive` are OWNED here, not injected.
	 *
	 * They used to be both parameters and return values: the page declared no
	 * refs, passed the two names in, and destructured the same two names back out
	 * of the SAME `const` statement. Reading a `const`'s own initializer is a
	 * temporal-dead-zone hit, so `setup()` threw before the page ever painted:
	 *
	 *     ReferenceError: Cannot access 'showPinSetup' before initialization
	 *
	 * That is a blank login screen for every user, and it is exactly the
	 * "Cannot read properties of undefined (reading 'value')" family of crash —
	 * the ref never arrives, so `.value` is read off `undefined`. `vite build`
	 * cannot see it, and a text-assertion test cannot see it either.
	 *
	 * A composable that owns a piece of state takes it as input; one that does
	 * not own it creates it. These two are decided HERE, so they are created
	 * here and returned once.
	 */
	const showPinSetup = ref(false)
	const pinModeActive = ref(false)

	const pinCode = ref("")
	const pinConfirm = ref("")
	const pinLoginInProgress = ref(false)
	const pinError = ref("")
	const pinSetupError = ref("")

	/** Enter PIN sign-in from the quick actions. Mirrors the old page function. */
	function enterPinMode() {
		pinModeActive.value = true
		showPinSetup.value = false
		pinError.value = ""
		pinSetupError.value = ""
	}

	/** Leave PIN sign-in and hand the page back to the password form. */
	function exitPinMode() {
		pinModeActive.value = false
		showPinSetup.value = false
		pinCode.value = ""
		pinError.value = ""
		pinSetupError.value = ""
	}

	/** Close the "create a quick code" sub-form without leaving PIN mode. */
	function cancelPinSetup() {
		showPinSetup.value = false
		pinSetupError.value = ""
	}

	const {
		isPinValid: pinAvailable,
		pinLogin: attemptPinLogin,
		savePin: storePin,
		clearPin: wipePin,
		loadPinState,
	} = usePinAuth()

	// Expose raw functions for LoginPinForm component
	const rawAttemptPinLogin = attemptPinLogin
	const rawStorePin = storePin

	/** يقبل الحقل أرقامًا فقط — يمنع الحروف قبل أن تصل إلى PBKDF2. */
	function sanitizePinInput(event) {
		pinCode.value = sanitizePin(event.target.value)
		pinError.value = ""
	}

	function onPinSetupInput(field, event) {
		const digits = sanitizePin(event.target.value)

		if (field === "code") pinCode.value = digits
		else pinConfirm.value = digits

		pinSetupError.value = ""
	}

	function clearPinSetup() {
		pinCode.value = ""
		pinConfirm.value = ""
		pinSetupError.value = ""
	}

	async function handlePinLogin() {
		if (!pinAvailable.value || pinLoginInProgress.value) return

		pinLoginInProgress.value = true
		pinError.value = ""

		try {
			const result = await attemptPinLogin(pinCode.value)

			if (result?.success) {
				pinCode.value = ""
				return true
			}

			pinError.value = result?.error || __("كود PIN غير صحيح")
		} catch (error) {
			log.warn("DyPOS PIN login failed", error)
			pinError.value = __("كود PIN غير صحيح")
		} finally {
			pinLoginInProgress.value = false
		}

		return false
	}

	async function handlePinSetup() {
		if (pinModeActive.value) return

		pinModeActive.value = true
		pinSetupError.value = ""

		try {
			const validation = validatePinPair(pinCode.value, pinConfirm.value)

			if (!validation.valid) {
				pinSetupError.value = __("رمز PIN غير متطابق")
				return false
			}

			if (!email.value || email.value.length < 3) {
				pinSetupError.value = __(
					"أدخل بريدك الإلكتروني أولًا لتمكين إنشاء رمز PIN",
				)
				return false
			}

			const result = await storePin(email.value, pinCode.value)

			if (result?.success) {
				clearPinSetup()
				showPinSetup.value = false
				return true
			}

			pinSetupError.value = result?.error || __("فشل إعداد كود PIN")
		} catch (error) {
			log.warn("DyPOS PIN setup failed", error)
			pinSetupError.value = __("فشل إعداد كود PIN")
		} finally {
			pinModeActive.value = false
		}

		return false
	}

	const pinSetupDisabled = computed(
		() =>
			!pinCode.value ||
			!pinConfirm.value ||
			!email?.value ||
			pinCode.value.length < 4 ||
			pinModeActive.value,
	)

	const pinLoginDisabled = computed(
		() => !pinAvailable.value || !pinCode.value || pinLoginInProgress.value,
	)

	const pinDeviceHint = PIN_DEVICE_HINT

	return {
		// State
		pinCode,
		pinConfirm,
		pinLoginInProgress,
		pinError,
		pinSetupError,
		pinAvailable,
		pinModeActive,
		pinSetupDisabled,
		pinLoginDisabled,
		pinDeviceHint,
		PIN_EMAIL_TOO_SHORT,
		PIN_EMAIL_REQUIRED,
		showPinSetup,

		// Methods
		sanitizePinInput,
		onPinSetupInput,
		clearPinSetup,
		handlePinLogin,
		handlePinSetup,
		enterPinMode,
		exitPinMode,
		cancelPinSetup,
		loadPinState,
		wipePin,
		// Raw functions for LoginPinForm
		attemptPinLogin: rawAttemptPinLogin,
		storePin: rawStorePin,
	}
}
