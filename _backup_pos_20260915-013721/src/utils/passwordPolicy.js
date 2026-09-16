/**
 * Password Policy — Industry-standard validation aligned with:
 *   - NIST SP 800-63B (Digital Identity Guidelines)
 *   - OWASP ASVS 5.0 (V2 — Authentication)
 *   - OWASP Password Storage Cheat Sheet
 *   - PCI DSS 4.0 (Requirement 8.3)
 *
 * Design principles:
 *   1. Reject known-compromised passwords (top breach list)
 *   2. Minimum length 8 — NIST SP 800-63B §5.1.1.2
 *   3. Maximum length 128 — prevents DoS on server-side hashing (bcrypt ~72B)
 *   4. No mandatory composition rules beyond breach/sequence checks —
 *      NIST 800-63B §5.1.1.2 (forces Symbol+UpperLowerDigit hurts usability)
 *   5. Blacklist user-specific identifiers (email local-part, full name)
 *   6. Reject sequential and repeated-character patterns
 *   7. Entropy estimation via Shannon entropy for strength meter
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MIN_LENGTH = 8
const MAX_LENGTH = 128
const MAX_ENTROPY_CHARS = 50

/**
 * Top common passwords (client-side subset for immediate feedback).
 * Server performs the full k-anonymity breach check via HaveIBeenPwned API.
 */
const COMMON_PASSWORDS = new Set([
	"password", "password1", "password123", "12345678", "123456789",
	"1234567890", "qwerty12", "qwertyuiop", "qwerty123", "abc12345",
	"abc123456", "abcdefg1", "password12", "password1234", "letmein1",
	"letmein123", "welcome1", "welcome123", "admin123", "admin1234",
	"iloveyou", "iloveyou1", "iloveyou123", "monkey1", "monkey123",
	"dragon1", "dragon123", "master1", "master123", "football1",
	"football123", "shadow1", "shadow123", "sunshine1", "sunshine123",
	"princess1", "princess123", "trustno1", "trustno123", "1234qwer",
	"1234qwer1234", "qwerty1234", "qwerty12345", "password12345",
	"changeme", "changeme1", "changeme123", "P@ssw0rd", "P@ssw0rd1",
	"P@ssw0rd123", "passw0rd", "passw0rd1", "baseball1", "baseball123",
	"superman1", "superman123", "michael1", "michael123", "ashley1",
	"ashley123", "bailey1", "bailey123", "passw0rd123",
].map((p) => p.toLowerCase()))

/**
 * Sequential key sequences to reject.
 */
const SEQUENTIAL_PATTERNS = [
	"0123456789",
	"abcdefghijklmnopqrstuvwxyz",
	"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
	"`1234567890-=",
	"!@#$%^&*()_+-=[]{}",
]

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function hasSequentialRun(pwd, minRun = 4) {
	const lower = pwd.toLowerCase()
	for (const pattern of SEQUENTIAL_PATTERNS) {
		for (let i = 0; i <= pattern.length - minRun; i++) {
			if (lower.includes(pattern.slice(i, i + minRun))) return true
		}
		const reversed = pattern.split("").reverse().join("")
		for (let i = 0; i <= reversed.length - minRun; i++) {
			if (lower.includes(reversed.slice(i, i + minRun))) return true
		}
	}
	return false
}

function hasRepeatedChar(pwd, minRun = 5) {
	if (!pwd) return false
	let count = 1
	for (let i = 1; i < pwd.length; i++) {
		if (pwd[i] === pwd[i - 1]) {
			count++
			if (count >= minRun) return true
		} else {
			count = 1
		}
	}
	return false
}

/** Shannon entropy estimation (bits) over character distribution. */
function estimateEntropy(pwd) {
	if (!pwd || pwd.length === 0) return 0
	const sample = pwd.slice(0, MAX_ENTROPY_CHARS)
	const freq = {}
	for (const ch of sample) {
		freq[ch] = (freq[ch] || 0) + 1
	}
	const len = sample.length
	let entropy = 0
	for (const ch in freq) {
		const p = freq[ch] / len
		entropy -= p * Math.log2(p)
	}
	return Math.round(entropy * len)
}

function isValidEmail(email) {
	if (typeof email !== "string" || email.length === 0) return false
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a password against NIST SP 800-63B / OWASP ASVS 5.0 requirements.
 *
 * @param {string} password - The password to validate
 * @param {Object} [userInfo] - Optional user context for user-specific checks
 * @param {string} [userInfo.email] - User's email (to reject as password)
 * @param {string} [userInfo.fullName] - User's full name (to reject as password)
 * @returns {{ valid: boolean, errors: string[], warnings: string[], score: number, entropy: number }}
 */
export function validatePassword(password, userInfo = {}) {
	const errors = []
	const warnings = []

	if (typeof password !== "string") {
		return {
			valid: false,
			errors: ["كلمة المرور مطلوبة."],
			warnings: [],
			score: 0,
			entropy: 0,
		}
	}

	const pwd = password
	const pwdLower = pwd.toLowerCase().trim()
	const entropy = estimateEntropy(pwd)

	/* --- Length requirements (NIST SP 800-63B §5.1.1.2) --- */
	if (pwd.length < MIN_LENGTH) {
		errors.push(`كلمة المرور يجب أن تكون ${MIN_LENGTH} أحرف على الأقل.`)
	}
	if (pwd.length > MAX_LENGTH) {
		errors.push(`كلمة المرور يجب أن تكون ${MAX_LENGTH} حرفًا على الأكثر.`)
	}

	/* --- Reject known-compromised / common passwords --- */
	if (pwdLower.length >= 4 && COMMON_PASSWORDS.has(pwdLower)) {
		errors.push("كلمة المرور شائعة ويمكن تخمينها بسهولة. يرجى اختيار أخرى.")
	}

	/* --- Reject sequential patterns --- */
	if (hasSequentialRun(pwd, 4)) {
		errors.push("كلمة المرور تحتوي على تسلسل متتالي (مثل 1234 أو abcd). يرجى تجنّبها.")
	}

	/* --- Reject repeated single characters --- */
	if (hasRepeatedChar(pwd, 5)) {
		errors.push("كلمة المرور تتكرر فيها أحرف متكررة. يرجى استخدام تباين أكبر.")
	}

	/* --- Reject user-specific identifiers (NIST) --- */
	if (userInfo.email && isValidEmail(userInfo.email)) {
		const localPart = userInfo.email.split("@")[0].toLowerCase()
		if (localPart.length >= 3 && pwdLower.includes(localPart)) {
			errors.push("لا يمكن استخدام بريدك الإلكتروني ككلمة مرور.")
		}
	}
	if (userInfo.fullName) {
		const nameParts = userInfo.fullName
			.toLowerCase()
			.split(/\s+/)
			.filter((p) => p.length >= 3)
		for (const part of nameParts) {
			if (pwdLower.includes(part)) {
				errors.push("لا يمكن استخدام اسمك كجزء من كلمة المرور.")
				break
			}
		}
	}

	/* --- Warnings (guidance, not hard errors) --- */
	if (pwd.length < 12 && errors.length === 0) {
		warnings.push("كلمة المرور معتمدة، لكنها قصيرة. استخدام 12+ حرفًا يزيد الأمان.")
	}
	if (entropy < 28 && errors.length === 0) {
		warnings.push("استخدم مزيجًا من الحروف والأرقام والرموز لزيادة الأمان.")
	}

	/* --- Strength score (0–5) for meter --- */
	let score = 0
	if (pwd.length >= 8) score++
	if (pwd.length >= 12) score++
	if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
	if (/\d/.test(pwd)) score++
	if (/[^A-Za-z\d]/.test(pwd)) score++
	if (score === 1) score = 0
	score = Math.max(0, Math.min(5, score))

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		score,
		entropy,
	}
}

/**
 * Quick password strength estimate (0–5) without full validation.
 * @param {string} password
 * @returns {{ level: number, label: string, color: string, percent: number, entropy: number }}
 */
export function getPasswordStrength(password) {
	const { score, entropy } = validatePassword(password)
	const levels = [
		{ label: "", color: "", percent: 0 },
		{ label: "ضعيف", color: "#DC2626", percent: 20 },
		{ label: "ضعيف", color: "#EA580C", percent: 40 },
		{ label: "متوسط", color: "#CA8A04", percent: 60 },
		{ label: "قوي", color: "#16A34A", percent: 80 },
		{ label: "قوي جداً", color: "#059669", percent: 100 },
	]
	const lvl = levels[Math.min(score, 5)]
	return { ...lvl, level: score, entropy }
}

/**
 * Check if a password passes the minimum acceptable threshold.
 * @param {string} password
 * @param {Object} [userInfo]
 * @returns {boolean}
 */
export function isPasswordAcceptable(password, userInfo = {}) {
	return validatePassword(password, userInfo).valid
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH
export const PASSWORD_MAX_LENGTH = MAX_LENGTH

export default {
	validatePassword,
	getPasswordStrength,
	isPasswordAcceptable,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH,
}
/* -------------------------------------------------------------------------- */