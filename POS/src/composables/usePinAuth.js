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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * دوال المساعدة (Functions)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * حفظ PIN مرتبط بحساب المستخدم الحالي.
 * يتم تشفيره محليًا ولا يُخزَّن بصيغة النص الواضح.
 */
async function savePin(pinCode, email) {
  try {
    const hash = await window.crypto.subtle
      .importKey('raw', new TextEncoder().encode(pinCode), 'PBKDF2', false, ['deriveBits'])
      .then(key => window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('dypos-pin-salt-v1'), iterations: 100000, hash: 'SHA-256' }, key, 256))
      .then(bits => Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join(''));

    const payload = {
      hash,
      email,
      expiry: Date.now() + PIN_DEFAULT_EXPIRY_MS,
      created: Date.now(),
    };

    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(payload));
    storedPinHash.value = hash;
    storedPinExpiry.value = payload.expiry;
    pinUserEmail.value = email;

    logger.info(`[PinAuth] PIN saved for ${email}`);
    return true;
  } catch (err) {
    logger.error('[PinAuth] Failed to save PIN:', err);
    return false;
  }
}

/**
 * تحقق من PIN مطابق.
 */
async function pinLogin(pinCode) {
  if (!storedPinHash.value) return { success: false, error: 'لا يوجد PIN محفوظ' };
  if (isLocked.value) return { success: false, error: `الحساب مقفل — حاول بعد ${getLockRemainingSeconds()} ثانية` };

  try {
    const hash = await window.crypto.subtle
      .importKey('raw', new TextEncoder().encode(pinCode), 'PBKDF2', false, ['deriveBits'])
      .then(key => window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('dypos-pin-salt-v1'), iterations: 100000, hash: 'SHA-256' }, key, 256))
      .then(bits => Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join(''));

    if (hash !== storedPinHash.value) {
      failedAttempts.value++;
      if (failedAttempts.value >= pinSettings.value.maxAttempts) {
        lockUntil.value = Date.now() + pinSettings.value.lockoutDurationMs;
        localStorage.setItem('dypos_pin_lock', JSON.stringify({ lockedAt: lockUntil.value }));
        logger.warn(`[PinAuth] Account locked after ${failedAttempts.value} failed attempts`);
        return { success: false, error: `الحساب مقفل — حاول بعد ${getLockRemainingSeconds()} ثانية` };
      }
      return { success: false, error: 'PIN غير صحيح' };
    }

    failedAttempts.value = 0;
    isLocked.value = false;
    lockUntil.value = null;
    localStorage.removeItem('dypos_pin_lock');

    logger.info('[PinAuth] PIN accepted');
    return { success: true, email: pinUserEmail.value };
  } catch (err) {
    logger.error('[PinAuth] PIN verification error:', err);
    return { success: false, error: 'خطأ في التحقق' };
  }
}

/**
 * دالة مركبة — مرجع PIN auth الكامل
 */
function usePinAuth() {
  return {
    isPinValid,
    pinExpiry,
    pinSettings,
    failedAttempts,
    isLocked,
    lockUntil,
    loadPinState,
    clearPin,
    savePin,
    pinLogin,
    getLockRemainingSeconds,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * تصدير الجمهور
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { usePinAuth, isPinValid, pinExpiry, pinSettings, failedAttempts, isLocked, lockUntil, loadPinState, savePin, pinLogin, clearPin, getLockRemainingSeconds }
