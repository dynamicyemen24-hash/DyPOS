/**
 * =============================================================================
 * usePinAuth.js
 * تسجيل دخول سريع عبر PIN للمستخدمين المتكررين.
 * =============================================================================
 *
 * المبادئ:
 * - PIN يُستخدم فقط بعد تسجيل دخول حسابي ناجح.
 * - PIN مُشفَّر محليًا + expiration.
 * - لا يُخزَّن PIN بصيغة النص الواضح.
 *
 * =============================================================================
 */
import { ref, computed, onMounted } from "vue"
import { session } from "@/stores/session"
import { logger } from "@/utils/logger"

const PIN_STORAGE_KEY = "dypos_pin_v1"
const PIN_DEFAULT_EXPIRY_MS = 60 * 60 * 1000

const storedPinHash = ref(null)
const storedPinExpiry = ref(0)
const pinUserEmail = ref(null)

const isPinValid = computed(() => storedPinHash.value && pinUserEmail.value)

const pinExpiry = computed(() => storedPinExpiry.value ? new Date(storedPinExpiry.value) : null)

const pinSettings = ref({
	enabled: true,
	maxAttempts: 5,
	lockoutDurationMs: 15 * 60 * 1000,
	defaultExpiryMs: PIN_DEFAULT_EXPIRY_MS,
})

const failedAttempts = ref(0)
const isLocked = ref(false)
const lockUntil = ref(null)

function getLockRemainingSeconds() {
	if (!lockUntil.value) return 0
	return Math.max(0, Math.ceil((lockUntil.value - Date.now()) / 1000))
}

function loadPinState() {
	try {
		const raw = localStorage.getItem(PIN_STORAGE_KEY)
		if (!raw) { storedPinHash.value = null; storedPinExpiry.value = 0; pinUserEmail.value = null; return }
		const parsed = JSON.parse(raw)
		if (parsed?.hash && parsed?.email && parsed?.expiry) {
			storedPinHash.value = parsed.hash; pinUserEmail.value = parsed.email; storedPinExpiry.value = parsed.expiry
		} else { clearPin() }
	} catch { clearPin() }
}

function clearPin() {
	localStorage.removeItem(PIN_STORAGE_KEY)
	sessionStorage.removeItem("dypos_pin_lock")
	storedPinHash.value = null; storedPinExpiry.value = 0; pinUserEmail.value = null
	failedAttempts.value = 0; isLocked.value = false; lockUntil.value = null
}

export { isPinValid, pinExpiry, pinSettings, failedAttempts, isLocked, lockUntil, loadPinState, clearPin, getLockRemainingSeconds }
