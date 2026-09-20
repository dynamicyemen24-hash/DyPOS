/**
 * =============================================================================
 * pinCrypto.js
 * تشفير وفك تشفير PIN محليًا باستخدام Web Crypto API فقط.
 * =============================================================================
 *
 * المبادئ:
 * - لا يُخزَّن الـ PIN بصيغة النص الواضح.
 * - نستخدم PBKDF2 مع SHA-256 و salt عشوائي.
 * - التحقق يتم بمقارنة الـ hash.
 * - يعمل في المتصفح فقط (لا يعتمد على Node.js crypto).
 *
 * =============================================================================
 */
const SALT_LENGTH = 32
const ITERATIONS = 100000
const KEY_LENGTH = 256

/**
 * توليد salt عشوائي.
 */
function generateSalt() {
	const array = new Uint8Array(SALT_LENGTH)
	window.crypto.getRandomValues(array)
	return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * تشفير PIN باستخدام Web Crypto API (PBKDF2 + SHA-256).
 *
 * @param {string} plainPin - الـ PIN النصي.
 * @returns {Promise<string>} salt:hash بصيغة hex.
 */
async function encryptPin(plainPin) {
	const enc = new TextEncoder()
	const salt = generateSalt()

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(plainPin),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	)

	const derivedKey = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: enc.encode(salt),
			iterations: ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		KEY_LENGTH,
	)

	const hashArray = Array.from(new Uint8Array(derivedKey))
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
	return `${salt}:${hashHex}`
}

/**
 * التحقق من PIN مقابل الـ hash المخزن.
 *
 * @param {string} plainPin - الـ PIN المدخل.
 * @param {string} storedHash - الـ hash المخزن (salt:hash).
 * @returns {Promise<boolean>} صحيح أم خطأ.
 */
async function decryptPin(plainPin, storedHash) {
	try {
		const computed = await encryptPin(plainPin)
		const [, computedHashHex] = computed.split(":")
		const [, storedHashHex] = storedHash.split(":")
		return computedHashHex === storedHashHex
	} catch {
		return false
	}
}

/**
 * هل الـ PIN منتهي الصلاحية.
 */
function isPinExpired(expiryTimestamp) {
	if (!expiryTimestamp) return true
	return Date.now() > expiryTimestamp
}

/**
 * تحويل hex إلى Uint8Array.
 */
function hexToUint8(hex) {
	const bytes = []
	for (let i = 0; i < hex.length; i += 2) {
		bytes.push(parseInt(hex.substr(i, 2), 16))
	}
	return new Uint8Array(bytes)
}

/**
 * تحويل Uint8Array إلى hex string.
 */
function uint8ToHex(bytes) {
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export { encryptPin, decryptPin, isPinExpired, generateSalt, hexToUint8, uint8ToHex }
