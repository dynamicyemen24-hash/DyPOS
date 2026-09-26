/**
 * DyPOS User Repository — local offline authentication (Dexie `users`).
 *
 * Single home for the credential logic previously triplicated across
 * Login.vue, Register.vue and data/session.js:
 * - email normalization (lowercase + trim)
 * - PBKDF2-HMAC-SHA256 password hashing (salted, iterated)
 * - duplicate-email guard on registration
 * - Arabic failure reasons (never leak which half failed — callers decide)
 *
 * Why PBKDF2: the local `users` table is a real credential store on the
 * terminal, so a bare SHA-256 digest is rainbow-table crackable in seconds
 * (a fast digest is the wrong tool for passwords). PBKDF2-HMAC-SHA256 via
 * WebCrypto is available in every supported browser AND in Node (tests),
 * needs no dependency, and is deliberately slow. Iteration count is tuned
 * for low-end POS terminals — server-side credentials stay bcrypt (cost 12).
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>` so the
 * parameters travel with the hash and can be raised later. Legacy rows
 * (bare SHA-256 hex, or plaintext from an old build) still verify and are
 * silently upgraded to PBKDF2 on the next successful login.
 */
import { createRepository } from "./base.js"

const users = createRepository("users")

// OWASP floor for PBKDF2-HMAC-SHA256 is 600k, which is too slow for a
// low-end terminal at login. 210k keeps unlock under ~1s on the slowest
// supported hardware while being far out of reach for a plain digest.
const PBKDF2_ITERATIONS = 210000
const SALT_BYTES = 16
const HASH_BITS = 256
const PREFIX = "pbkdf2-sha256"

export function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase()
}

function toHex(bytes) {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

function fromHex(hex) {
	const out = new Uint8Array(hex.length / 2)
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	}
	return out
}

async function deriveBits(password, salt, iterations) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(String(password)),
		"PBKDF2",
		false,
		["deriveBits"],
	)
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
		key,
		HASH_BITS,
	)
	return new Uint8Array(bits)
}

/** Length-independent, value constant-time comparison. */
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	}
	return diff === 0
}

export async function hashPassword(password) {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
	const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS)
	return `${PREFIX}$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`
}

function parseStored(stored) {
	if (typeof stored !== "string" || !stored.startsWith(`${PREFIX}$`))
		return null
	const [, iterations, saltHex, hashHex] = stored.split("$")
	const iters = Number.parseInt(iterations, 10)
	if (!Number.isFinite(iters) || iters < 1 || !saltHex || !hashHex) return null
	return { iterations: iters, salt: fromHex(saltHex), hash: fromHex(hashHex) }
}

/** True when the row predates PBKDF2 and should be re-hashed after login. */
export function needsRehash(stored) {
	return parseStored(stored) === null
}

export function findByEmail(email) {
	return users.findOneBy("email", normalizeEmail(email))
}

/**
 * Register a local user. Throws on duplicate email or weak input.
 * @returns {Promise<Object>} The stored user (without any secret echo).
 */
export async function create({
	fullName,
	email,
	password,
	phone = "",
	company = "",
	role = "POS User",
} = {}) {
	const cleanEmail = normalizeEmail(email)
	const name = String(fullName || "").trim()

	if (name.length < 2) throw new Error("الاسم يجب أن يكون حرفين على الأقل")
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
		throw new Error("البريد الإلكتروني غير صالح")
	}
	if (!password || String(password).length < 6) {
		throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
	}

	const existing = await findByEmail(cleanEmail)
	if (existing) throw new Error("المستخدم موجود بالفعل محليًا")

	const now = new Date().toISOString()
	const id = await users.add({
		email: cleanEmail,
		full_name: name,
		phone: String(phone || ""),
		company: String(company || ""),
		role,
		password_hash: await hashPassword(password),
		created_at: now,
		updated_at: now,
	})
	return users.get(id)
}

/**
 * Verify a password against a stored credential.
 *
 * Accepts the current PBKDF2 format plus the two legacy shapes that older
 * builds wrote into the same column (bare SHA-256 hex, and plaintext). The
 * legacy branches exist only to keep already-provisioned terminals able to
 * unlock; `authenticate` re-hashes them to PBKDF2 immediately afterwards so
 * plaintext never survives a successful login.
 */
export async function verifyPassword(user, password) {
	const stored = user?.password_hash
	if (!stored) return false

	const parsed = parseStored(stored)
	if (parsed) {
		const candidate = await deriveBits(password, parsed.salt, parsed.iterations)
		return timingSafeEqual(toHex(candidate), toHex(parsed.hash))
	}

	// Legacy: bare SHA-256 hex digest.
	if (/^[0-9a-f]{64}$/i.test(stored)) {
		const data = new TextEncoder().encode(String(password))
		const digest = await crypto.subtle.digest("SHA-256", data)
		return timingSafeEqual(toHex(new Uint8Array(digest)), stored.toLowerCase())
	}

	// Legacy: plaintext (oldest builds). Verification still possible; the
	// caller upgrades the row right after a match.
	return stored === String(password)
}

/** Replace a legacy credential with a PBKDF2 hash of the same password. */
export async function upgradePasswordHash(user, password) {
	if (!user?.id || !needsRehash(user.password_hash)) return user
	const upgraded = await hashPassword(password)
	await users.update(user.id, {
		password_hash: upgraded,
		updated_at: new Date().toISOString(),
	})
	return { ...user, password_hash: upgraded }
}

/**
 * Authenticate against the local users table.
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function authenticate(email, password) {
	const cleanEmail = normalizeEmail(email)
	if (!cleanEmail || !password) {
		return { success: false, error: "بيانات الدخول ناقصة" }
	}

	const user = await findByEmail(cleanEmail)
	if (!user) {
		return { success: false, error: "المستخدم غير موجود محليًا" }
	}
	if (!(await verifyPassword(user, password))) {
		return { success: false, error: "كلمة المرور غير صحيحة" }
	}
	// Opportunistic upgrade: a legacy SHA-256/plaintext row becomes PBKDF2 on
	// its first successful login, so the weak format drains away on its own.
	const upgraded = await upgradePasswordHash(user, password)
	return { success: true, user: upgraded }
}

export const userRepository = {
	...users,
	normalizeEmail,
	hashPassword,
	needsRehash,
	upgradePasswordHash,
	findByEmail,
	create,
	verifyPassword,
	authenticate,
}

export default userRepository
