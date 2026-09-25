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

	it("hashes passwords deterministically (never plain)", async () => {
		const hash = await hashPassword("secret123")
		expect(hash).toMatch(/^[0-9a-f]{64}$/)
		expect(hash).not.toContain("secret123")
		expect(await hashPassword("secret123")).toBe(hash)
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
