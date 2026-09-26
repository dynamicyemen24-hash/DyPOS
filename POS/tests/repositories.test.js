/**
 * Repository layer regression gate (Phase 1 of the Frappe-removal plan).
 *
 * Covers the Dexie-backed repositories with in-memory fakes (same pattern
 * as offlineStore.test.js — no network, no IndexedDB):
 * - userRepository: normalize/hash/create/verify/authenticate
 * - saleRepository: OPEN → COMPLETED → VOIDED with payment integrity
 * - inventoryRepository: availability = stock − active reservations
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

const mocks = vi.hoisted(() => {
	const createTable = (rows = new Map()) => {
		let seq = 0
		return {
			rows,
			get: async (key) => rows.get(key) ?? null,
			put: async (row) => {
				const id = row.id ?? ++seq
				rows.set(id, { ...row, id })
				return id
			},
			add: async (row) => {
				const id = row.id ?? ++seq
				rows.set(id, { ...row, id })
				return id
			},
			update: async (id, patch) => {
				const current = rows.get(id)
				if (!current) return 0
				rows.set(id, { ...current, ...patch })
				return 1
			},
			delete: async (id) => (rows.delete(id) ? 1 : 0),
			toArray: async () => Array.from(rows.values()),
			where(field) {
				return {
					equals(value) {
						return {
							toArray: async () =>
								Array.from(rows.values()).filter((row) => row[field] === value),
						}
					},
				}
			},
		}
	}

	const tables = {
		users: createTable(),
		invoices: createTable(),
		payments: createTable(),
		stock: createTable(),
		reservations: createTable(),
		items: createTable(),
		customers: createTable(),
	}

	const fakeDb = {
		...tables,
		table: (name) => tables[name],
		transaction: async (_mode, _t, fn) => fn(),
	}

	return { tables, fakeDb }
})

vi.mock("@/services/db", () => ({
	default: mocks.fakeDb,
}))

import {
	userRepository,
	normalizeEmail,
	hashPassword,
	needsRehash,
} from "@/repositories/userRepository"
import {
	saleRepository,
	SALE_STATUS,
	createSale,
	addPayment,
	voidSale,
} from "@/repositories/saleRepository"
import {
	inventoryRepository,
	availableQty,
	checkAvailability,
} from "@/repositories/inventoryRepository"
import {
	productRepository,
	findByBarcode,
	listByCategory,
	lowStock,
} from "@/repositories/productRepository"
import {
	customerRepository,
	normalizePhone,
	findByPhone,
} from "@/repositories/customerRepository"

function clearTables() {
	for (const table of Object.values(mocks.tables)) {
		table.rows.clear()
	}
}

describe("userRepository", () => {
	beforeEach(clearTables)

	it("normalizes emails (trim + lowercase)", () => {
		expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com")
	})

	it("hashes passwords with salted PBKDF2 (never plain, never deterministic)", async () => {
		const hash = await hashPassword("secret123")
		// Self-describing record: pbkdf2-sha256$<iterations>$<salt>$<hash>
		expect(hash).toMatch(
			/^pbkdf2-sha256-\d+|^pbkdf2-sha256\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/,
		)
		expect(hash).not.toContain("secret123")
		// Salting: the same password must never produce the same stored string.
		expect(await hashPassword("secret123")).not.toBe(hash)
	})

	it("creates a user and finds it case-insensitively", async () => {
		const user = await userRepository.create({
			fullName: "أحمد محمد",
			email: "AHMED@example.com",
			password: "secret123",
			phone: "0501234567",
		})
		expect(user.email).toBe("ahmed@example.com")
		expect(user.password_hash).not.toContain("secret123")
		expect(await userRepository.findByEmail("ahmed@EXAMPLE.com")).toMatchObject(
			{ email: "ahmed@example.com" },
		)
	})

	it("rejects duplicates, bad emails, short passwords and names", async () => {
		await userRepository.create({
			fullName: "سارة",
			email: "sara@example.com",
			password: "secret123",
		})
		await expect(
			userRepository.create({
				fullName: "سارة",
				email: "Sara@Example.com",
				password: "secret123",
			}),
		).rejects.toThrow("موجود بالفعل")
		await expect(
			userRepository.create({
				fullName: "سارة",
				email: "not-an-email",
				password: "secret123",
			}),
		).rejects.toThrow()
		await expect(
			userRepository.create({
				fullName: "سارة",
				email: "new@example.com",
				password: "123",
			}),
		).rejects.toThrow()
		await expect(
			userRepository.create({
				fullName: "س",
				email: "new2@example.com",
				password: "secret123",
			}),
		).rejects.toThrow()
	})

	it("authenticates with Arabic failure reasons", async () => {
		await userRepository.create({
			fullName: "كاشير",
			email: "cashier@example.com",
			password: "secret123",
		})
		const ok = await userRepository.authenticate(
			"cashier@example.com",
			"secret123",
		)
		expect(ok.success).toBe(true)
		expect(ok.user.email).toBe("cashier@example.com")

		expect(
			await userRepository.authenticate("cashier@example.com", "wrong"),
		).toMatchObject({ success: false, error: "كلمة المرور غير صحيحة" })
		expect(
			await userRepository.authenticate("ghost@example.com", "secret123"),
		).toMatchObject({ success: false, error: "المستخدم غير موجود محليًا" })
		expect(await userRepository.authenticate("", "")).toMatchObject({
			success: false,
		})
	})
})

/**
 * The local `users` table holds real terminal credentials, so the hash must be
 * a slow KDF — not a fast digest. These cases pin the PBKDF2 contract AND the
 * legacy-upgrade path: rows written by older builds (bare SHA-256 hex, or
 * plaintext) must still unlock, then be rewritten as PBKDF2 so the weak
 * formats drain away without a manual migration.
 */
describe("userRepository credential hardening", () => {
	beforeEach(clearTables)

	const legacySha256Hex = async (password) => {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(password),
		)
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	}

	const seedLegacy = async (email, passwordHash) =>
		mocks.tables.users.add({
			email,
			full_name: "Legacy",
			phone: "",
			company: "",
			role: "POS User",
			password_hash: passwordHash,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
		})

	it("unlocks a bare SHA-256 row and rewrites it as PBKDF2", async () => {
		const email = "sha.legacy@example.com"
		const password = "Legacy123!"
		const legacyHash = await legacySha256Hex(password)
		await seedLegacy(email, legacyHash)
		expect(needsRehash(legacyHash)).toBe(true)

		const result = await userRepository.authenticate(email, password)
		expect(result.success).toBe(true)
		expect(result.user.password_hash).toMatch(/^pbkdf2-sha256\$/)

		// The upgrade is persisted, not merely returned to the caller.
		const persisted = await userRepository.findByEmail(email)
		expect(persisted.password_hash).toMatch(/^pbkdf2-sha256\$/)
		expect(needsRehash(persisted.password_hash)).toBe(false)
	})

	it("unlocks a legacy plaintext row and rewrites it as PBKDF2", async () => {
		const email = "plain.legacy@example.com"
		const password = "Plain123!"
		await seedLegacy(email, password)

		const result = await userRepository.authenticate(email, password)
		expect(result.success).toBe(true)
		expect(result.user.password_hash).not.toBe(password)

		const persisted = await userRepository.findByEmail(email)
		expect(persisted.password_hash).toMatch(/^pbkdf2-sha256\$/)
	})

	it("never upgrades a row when the legacy password is wrong", async () => {
		const email = "sha.wrong@example.com"
		const legacyHash = await legacySha256Hex("Legacy123!")
		await seedLegacy(email, legacyHash)

		const result = await userRepository.authenticate(email, "nope-not-it")
		expect(result.success).toBe(false)
		const persisted = await userRepository.findByEmail(email)
		expect(persisted.password_hash).toBe(legacyHash)
	})

	it("rejects a wrong password against a current PBKDF2 row", async () => {
		const created = await userRepository.create({
			fullName: "مستخدم",
			email: "pbkdf2@example.com",
			password: "Correct123!",
		})
		expect(await userRepository.verifyPassword(created, "Correct123!")).toBe(
			true,
		)
		expect(await userRepository.verifyPassword(created, "correct123!")).toBe(
			false,
		)
		expect(await userRepository.verifyPassword(created, "")).toBe(false)
		expect(await userRepository.verifyPassword(null, "x")).toBe(false)
	})
})

describe("saleRepository", () => {
	beforeEach(clearTables)

	const line = { itemId: "ITEM-1", qty: 2, rate: 50 }

	it("rejects sales without items, numbers or with bad totals", async () => {
		await expect(createSale({ invoiceNo: "INV-1", items: [] })).rejects.toThrow(
			"بدون أصناف",
		)
		await expect(createSale({ items: [line] })).rejects.toThrow("رقم الفاتورة")
		await expect(
			createSale({ invoiceNo: "INV-1", items: [line], total: -5 }),
		).rejects.toThrow()
	})

	it("creates OPEN sales with paid=0 and full balance", async () => {
		const sale = await createSale({ invoiceNo: "INV-1", items: [line] })
		expect(sale).toMatchObject({
			status: SALE_STATUS.OPEN,
			total: 100,
			paid: 0,
			balance: 100,
		})
		expect(await saleRepository.getSaleByInvoiceNo("INV-1")).toMatchObject({
			invoiceNo: "INV-1",
		})
		expect(await saleRepository.listOpenSales()).toHaveLength(1)
	})

	it("applies payments atomically and completes on full payment", async () => {
		const sale = await createSale({ invoiceNo: "INV-2", items: [line] })
		const partial = await addPayment(sale.id, { method: "cash", amount: 40 })
		expect(partial.invoice).toMatchObject({
			paid: 40,
			balance: 60,
			status: SALE_STATUS.OPEN,
		})
		const full = await addPayment(sale.id, { method: "cash", amount: 60 })
		expect(full.invoice).toMatchObject({
			paid: 100,
			balance: 0,
			status: SALE_STATUS.COMPLETED,
		})
		expect(await saleRepository.listPayments(sale.id)).toHaveLength(2)
	})

	it("rejects payments without a live sale", async () => {
		await expect(addPayment(9999, { amount: 10 })).rejects.toThrow("غير موجودة")
		await expect(addPayment(1, { amount: 0 })).rejects.toThrow()
		await expect(addPayment(1, { amount: Number.NaN })).rejects.toThrow()
	})

	it("void keeps the row and blocks further payments", async () => {
		const sale = await createSale({ invoiceNo: "INV-3", items: [line] })
		const voided = await voidSale(sale.id, "خطأ إدخال")
		expect(voided.status).toBe(SALE_STATUS.VOIDED)
		expect(voided.voidReason).toBe("خطأ إدخال")
		// Still stored (audit) — never deleted.
		expect(await saleRepository.getSale(sale.id)).not.toBeNull()
		expect(await saleRepository.listOpenSales()).toHaveLength(0)
		await expect(addPayment(sale.id, { amount: 10 })).rejects.toThrow("ملغاة")
		// Second void is idempotent.
		expect((await voidSale(sale.id)).status).toBe(SALE_STATUS.VOIDED)
	})
})

describe("inventoryRepository", () => {
	beforeEach(async () => {
		clearTables()
		await mocks.fakeDb.stock.add({ itemId: "ITEM-1", qty: 10, location: "A" })
		await mocks.fakeDb.stock.add({ itemId: "ITEM-1", qty: 5, location: "B" })
		await mocks.fakeDb.reservations.add({
			itemId: "ITEM-1",
			qty: 4,
			status: "active",
		})
		await mocks.fakeDb.reservations.add({
			itemId: "ITEM-1",
			qty: 100,
			status: "released",
		})
		await mocks.fakeDb.reservations.add({
			itemId: "ITEM-1",
			qty: 100,
			status: "committed",
		})
	})

	it("availability = on-hand − active reservations only", async () => {
		expect(await availableQty("ITEM-1")).toBe(11)
		expect(await availableQty("ITEM-1", "A")).toBe(6)
		expect(await availableQty("MISSING")).toBe(0)
	})

	it("checkAvailability reports insufficiencies per line", async () => {
		const ok = await checkAvailability([{ itemId: "ITEM-1", qty: 5 }])
		expect(ok).toMatchObject({ ok: true, insufficiencies: [] })

		const short = await checkAvailability([
			{ itemId: "ITEM-1", qty: 5 },
			{ itemId: "ITEM-1", qty: 20 },
			{ itemId: "MISSING", qty: 1 },
		])
		expect(short.ok).toBe(false)
		expect(short.insufficiencies).toHaveLength(2)
		expect(short.insufficiencies[0]).toMatchObject({
			itemId: "ITEM-1",
			requested: 20,
			available: 11,
		})
	})

	it("skips lines without item or quantity", async () => {
		expect(
			await checkAvailability([
				{ itemId: null, qty: 5 },
				{ itemId: "ITEM-1", qty: 0 },
			]),
		).toMatchObject({ ok: true, insufficiencies: [] })
	})

	it("exposes the tables through the barrel", async () => {
		const { userRepository: u, saleRepository: s } = await import(
			"@/repositories/index.js"
		)
		expect(typeof u.authenticate).toBe("function")
		expect(typeof s.createSale).toBe("function")
		expect(typeof inventoryRepository.checkAvailability).toBe("function")
	})
})

describe("productRepository", () => {
	beforeEach(async () => {
		clearTables()
		await mocks.fakeDb.items.add({
			id: "P1",
			code: "PF-W001",
			name: "Chanel N°5",
			barcode: "628100010000",
			category: "عطور نسائية",
			price: 890,
			stock: 14,
			stockWarn: 5,
		})
		await mocks.fakeDb.items.add({
			id: "P2",
			code: "LIP-001",
			name: "Matte Liquid Lipstick",
			barcode: "628100010032",
			category: "مكياج شفاه",
			price: 45,
			stock: 0,
			stockWarn: 5,
		})
	})

	it("finds by exact barcode and code", async () => {
		expect(await findByBarcode("628100010000")).toMatchObject({ id: "P1" })
		expect(await findByBarcode("  628100010000  ")).toMatchObject({ id: "P1" })
		expect(await findByBarcode("missing")).toBeNull()
		expect(await findByBarcode("")).toBeNull()
		expect(await productRepository.findByCode("LIP-001")).toMatchObject({
			id: "P2",
		})
	})

	// NOTE: the local Dexie `items` table carries no name_ar/brand columns
	// (server catalog does) — Arabic-name search is a documented schema gap
	// (see docs/MIGRATION_PLAN.md), so this asserts current-schema behavior.
	it("searches across name/code/barcode", async () => {
		expect(await productRepository.search("chanel")).toHaveLength(1)
		expect(await productRepository.search("LIP-")).toHaveLength(1)
		expect(await productRepository.search("PF-")).toHaveLength(1)
		expect(await productRepository.search("00")).toHaveLength(2)
		expect(await productRepository.search("PF-", 1)).toHaveLength(1)
		expect(await productRepository.search("")).toHaveLength(2)
	})

	it("lists by category and flags low stock", async () => {
		expect(await listByCategory("عطور نسائية")).toHaveLength(1)
		expect(await listByCategory("مفقودة")).toHaveLength(0)
		const low = await lowStock()
		expect(low.map((r) => r.id)).toEqual(["P2"])
	})

	it("upserts catalog rows, skipping invalid ones", async () => {
		const applied = await productRepository.upsertCatalog([
			{ id: "P1", code: "PF-W001", name: "Chanel N°5", price: 900 },
			{ id: "P3", code: "NEW-1", name: "New Item" },
			{ id: "BAD" },
			null,
		])
		expect(applied).toBe(2)
		expect((await productRepository.findByCode("NEW-1")).price).toBeUndefined()
		expect(await productRepository.findByCode("PF-W001")).toMatchObject({
			price: 900,
			syncStatus: "synced",
		})
	})
})

describe("customerRepository", () => {
	beforeEach(async () => {
		clearTables()
		await mocks.fakeDb.customers.add({
			id: "C1",
			code: "CASH-000",
			name: "عميل نقدي",
			phone: "000000000",
		})
		await mocks.fakeDb.customers.add({
			id: "C2",
			name: "أم محمد",
			phone: "+967770111222",
		})
	})

	it("normalizes phones to digits", () => {
		expect(normalizePhone("+967 770-111-222")).toBe("967770111222")
	})

	it("finds by phone raw or digits-only", async () => {
		expect(await findByPhone("+967770111222")).toMatchObject({ id: "C2" })
		expect(await findByPhone("967770111222")).toMatchObject({ id: "C2" })
		expect(await findByPhone("000000000")).toMatchObject({ id: "C1" })
		expect(await findByPhone("nope")).toBeNull()
		expect(await findByPhone("")).toBeNull()
	})

	it("searches names and phones", async () => {
		expect(await customerRepository.search("محمد")).toHaveLength(1)
		expect(await customerRepository.search("967770111222")).toHaveLength(1)
		expect(await customerRepository.search("")).toHaveLength(2)
	})

	it("creates with validation and unique codes", async () => {
		const created = await customerRepository.create({
			name: "صالون لمسة",
			phone: "+967777777888",
			code: "SALON-1",
		})
		expect(created).toMatchObject({ name: "صالون لمسة", syncStatus: "pending" })
		await expect(
			customerRepository.create({ name: "تكرار", code: "SALON-1" }),
		).rejects.toThrow("مستخدم بالفعل")
		await expect(customerRepository.create({ name: "س" })).rejects.toThrow(
			"حرفان",
		)
	})

	it("updates without touching the id and flags pending sync", async () => {
		const updated = await customerRepository.update("C1", {
			id: "HACK",
			phone: "+967700000001",
		})
		expect(updated.id).toBe("C1")
		expect(updated.phone).toBe("+967700000001")
		expect(updated.syncStatus).toBe("pending")
		await expect(customerRepository.update("GHOST", {})).rejects.toThrow(
			"غير موجود",
		)
	})

	it("exposes the new repositories through the barrel", async () => {
		const barrel = await import("@/repositories/index.js")
		expect(typeof barrel.productRepository.search).toBe("function")
		expect(typeof barrel.customerRepository.create).toBe("function")
		expect(typeof barrel.findByBarcode).toBe("function")
		expect(typeof barrel.findByPhone).toBe("function")
	})
})
