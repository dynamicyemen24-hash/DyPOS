/**
 * DyPOS User Repository — local offline authentication (Dexie `users`).
 *
 * Single home for the credential logic previously triplicated across
 * Login.vue, Register.vue and data/session.js:
 * - email normalization (lowercase + trim)
 * - SHA-256 password hashing (hex)
 * - duplicate-email guard on registration
 * - Arabic failure reasons (never leak which half failed — callers decide)
 *
 * NOTE on hashing: SHA-256 is a transport-safe digest for the offline cache,
 * not a password-KDF. Server-side verification must use bcrypt/server rules;
 * see docs/MIGRATION_PLAN.md (AuthenticationService phase).
 */
import { createRepository } from "./base.js"

const users = createRepository("users")

export function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase()
}

export async function hashPassword(password) {
	const data = new TextEncoder().encode(String(password))
	const digest = await crypto.subtle.digest("SHA-256", data)
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
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

export async function verifyPassword(user, password) {
	if (!user?.password_hash) return false
	if (user.password_hash === password) return true // legacy plain fallback
	const hash = await hashPassword(password)
	return user.password_hash === hash
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
	return { success: true, user }
}

export const userRepository = {
	...users,
	normalizeEmail,
	hashPassword,
	findByEmail,
	create,
	verifyPassword,
	authenticate,
}

export default userRepository
