/**
 * DyPOS Customer Repository — reads + local registration over Dexie `customers`.
 *
 * Table shape (services/db v1): id, code, name, phone, updatedAt,
 * syncedAt, syncStatus (+ optional loyalty/wallet mirrors).
 *
 * Rules:
 * - name is required (≥ 2 chars); phone optional but normalized for lookup
 * - code, when provided, must be unique (stable sync identity)
 * - phone is NOT unique (shared family/business numbers are real)
 */
import { createRepository } from "./base.js"

const customers = createRepository("customers")

export function normalizePhone(phone) {
	return String(phone || "").replace(/\D/g, "")
}

/**
 * Find by phone: tries the raw trimmed value first, then digits-only,
 * because synced rows mix formatted (`+967...`) and plain numbers.
 */
export async function findByPhone(phone) {
	const raw = String(phone || "").trim()
	if (!raw) return null
	const direct = await customers.findOneBy("phone", raw)
	if (direct) return direct
	// Digits-only fallback: stored rows mix formatted ("+967…") and plain
	// numbers, so compare normalized forms on BOTH sides. An empty digit
	// string must never match ("" is contained in every string).
	const digits = normalizePhone(raw)
	if (!digits) return null
	const all = await customers.all()
	return all.find((row) => normalizePhone(row.phone) === digits) || null
}

export async function search(query, limit = 50) {
	const q = String(query || "")
		.trim()
		.toLowerCase()
	// Digits-only matching must not fire on digitless queries: normalizePhone
	// of such a query is "" and "" is a substring of everything.
	const digitsQuery = normalizePhone(q)
	const all = await customers.all()
	const matches = q
		? all.filter((row) =>
				[String(row.name || "").toLowerCase(), String(row.phone || "")].some(
					(field) =>
						field.includes(q) ||
						(digitsQuery !== "" && normalizePhone(field).includes(digitsQuery)),
				),
			)
		: all
	return matches.slice(0, Math.max(1, Math.min(Number(limit) || 50, 500)))
}

export async function create(input = {}) {
	const name = String(input.name || "").trim()
	if (name.length < 2) throw new Error("اسم العميل مطلوب (حرفان على الأقل)")

	const code = input.code != null ? String(input.code).trim() : ""
	if (code) {
		const clash = await customers.findOneBy("code", code)
		if (clash) throw new Error("رمز العميل مستخدم بالفعل")
	}

	const now = new Date().toISOString()
	const id = await customers.add({
		code: code || null,
		name,
		phone: String(input.phone || "").trim() || null,
		updatedAt: now,
		syncedAt: null,
		syncStatus: "pending",
		...(input.extra || {}),
	})
	return customers.get(id)
}

export async function update(id, patch = {}) {
	const existing = await customers.get(id)
	if (!existing) throw new Error("العميل غير موجود")
	const { id: _drop, ...safe } = patch || {}
	await customers.update(id, {
		...safe,
		updatedAt: new Date().toISOString(),
		syncStatus: "pending",
	})
	return customers.get(id)
}

export const customerRepository = {
	...customers,
	normalizePhone,
	findByPhone,
	search,
	create,
	update,
}

export default customerRepository
