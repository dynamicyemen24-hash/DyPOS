/**
 * DyPOS Sale Repository — invoice lifecycle over Dexie `invoices` + `payments`.
 *
 * Local status vocabulary (never persisted verbatim to the server; the sync
 * layer maps it): OPEN → COMPLETED → VOIDED.
 *
 * Integrity rules (enforced here, not in Vue):
 * - no sale without at least one item with qty > 0
 * - totals are finite numbers ≥ 0
 * - no payment without an existing, non-voided sale
 * - payment amounts are finite numbers > 0
 * - void keeps the row (audit) — never deletes
 */
import { createRepository, getDb, runTransaction } from "./base.js"
import { upsertQueueRow } from "@/services/offline-store"
import { sessionRole, sessionUser } from "@/data/session"

const invoices = createRepository("invoices")
const payments = createRepository("payments")

export const SALE_STATUS = Object.freeze({
	OPEN: "OPEN",
	COMPLETED: "COMPLETED",
	VOIDED: "VOIDED",
})

function assertFiniteNonNegative(value, label) {
	const n = Number(value)
	if (!Number.isFinite(n) || n < 0) {
		throw new Error(`${label} غير صالح`)
	}
	return n
}

function normalizeItems(items) {
	if (!Array.isArray(items)) throw new Error("أصناف الفاتورة مطلوبة")
	const lines = items
		.map((line) => ({
			...line,
			qty: Number(line?.qty ?? line?.quantity ?? 0),
			rate: Number(line?.rate ?? line?.unitPrice ?? line?.price ?? 0),
		}))
		.filter((line) => line.qty > 0)
	if (lines.length === 0) throw new Error("لا يمكن إنشاء فاتورة بدون أصناف")
	return lines
}

/**
 * Create an OPEN sale with embedded items. Payments are added separately
 * via addPayment() so partial/offline payment flows stay explicit.
 */
export async function createSale(input = {}) {
	const items = normalizeItems(input.items)
	const total = assertFiniteNonNegative(
		input.total ?? items.reduce((sum, l) => sum + l.qty * l.rate, 0),
		"إجمالي الفاتورة",
	)
	if (!input.invoiceNo) throw new Error("رقم الفاتورة مطلوب")

	const now = new Date().toISOString()
	const id = await invoices.add({
		invoiceNo: String(input.invoiceNo),
		customerId: input.customerId ?? null,
		status: SALE_STATUS.OPEN,
		items,
		total,
		paid: 0,
		balance: total,
		date: input.date || now,
		dueDate: input.dueDate || null,
		terminalId: input.terminalId || null,
		shiftId: input.shiftId || null,
		updatedAt: now,
		syncedAt: null,
		syncStatus: "pending",
	})
	return invoices.get(id)
}

export function getSale(id) {
	return invoices.get(id)
}

export function getSaleByInvoiceNo(invoiceNo) {
	return invoices.findOneBy("invoiceNo", String(invoiceNo))
}

export function listOpenSales() {
	return invoices.findBy("status", SALE_STATUS.OPEN)
}

export function listSalesByStatus(status) {
	return invoices.findBy("status", status)
}

/**
 * Record a payment against an OPEN sale. Recomputes paid/balance and flips
 * the sale to COMPLETED once fully paid. Runs in one Dexie transaction.
 */
export async function addPayment(invoiceId, payment = {}) {
	const amount = Number(payment.amount)
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error("مبلغ الدفع غير صالح")
	}

	return runTransaction(["invoices", "payments"], async () => {
		const invoice = await invoices.get(invoiceId)
		if (!invoice) throw new Error("الفاتورة غير موجودة")
		if (invoice.status === SALE_STATUS.VOIDED) {
			throw new Error("لا يمكن الدفع على فاتورة ملغاة")
		}

		const now = new Date().toISOString()
		const paymentId = await payments.add({
			invoiceId,
			method: payment.method || "cash",
			amount,
			date: payment.date || now,
			reference: payment.reference || null,
			updatedAt: now,
			syncedAt: null,
			syncStatus: "pending",
		})

		const paid = Number(invoice.paid || 0) + amount
		const patch = {
			paid,
			balance: Math.max(0, Number(invoice.total || 0) - paid),
			updatedAt: now,
			syncStatus: "pending",
		}
		if (patch.balance <= 0) patch.status = SALE_STATUS.COMPLETED
		await invoices.update(invoiceId, patch)

		return {
			payment: await payments.get(paymentId),
			invoice: await invoices.get(invoiceId),
		}
	})
}

/**
 * Void a sale — status transition only, never a delete. The row, its
 * payments and its reason stay for audit, and an `update` op is queued so
 * the server learns the void (a local-only void would resurrect the sale
 * on the next pull).
 *
 * Permission control (enforced here, not in Vue):
 * - reason is required (empty reason = rejected);
 * - a signed-in user is required (actor recorded);
 * - CASHIER may void only OPEN (unpaid) sales on this device;
 * - voiding a COMPLETED (money-moved) sale requires MANAGER or ADMIN;
 * - AUDITOR is read-only and can void nothing (default-deny).
 *
 * The server re-checks `pos.void_invoice` on its own side when the void
 * op syncs; this gate is the offline twin, driven by the local session
 * role so it works with no network.
 */
export async function voidSale(invoiceId, reason = "") {
	const cleanReason = String(reason || "").trim()
	if (!cleanReason) throw new Error("سبب الإلغاء مطلوب")
	const actor = sessionUser()
	if (!actor) throw new Error("تسجيل الدخول مطلوب للإلغاء")
	const role = String(sessionRole() || "POS User").toUpperCase()
	const privileged = role === "ADMIN" || role === "MANAGER"

	return runTransaction(
		["invoices", "payments", "syncQueue", "syncAudit"],
		async () => {
			const database = getDb()
			const invoice = await database.invoices.get(invoiceId)
			if (!invoice) throw new Error("الفاتورة غير موجودة")
			if (invoice.status === SALE_STATUS.VOIDED) return invoice
			const completed = invoice.status === SALE_STATUS.COMPLETED
			if (completed && !privileged) {
				throw new Error("إلغاء فاتورة مدفوعة يتطلب مشرفًا (مدير/مسؤول)")
			}

			const now = new Date().toISOString()
			await database.invoices.update(invoiceId, {
				status: SALE_STATUS.VOIDED,
				voidReason: cleanReason,
				voidedBy: actor,
				voidedAt: now,
				updatedAt: now,
				syncStatus: "pending",
			})
			await database.syncAudit.add({
				entityType: "invoice",
				entityId: invoice.invoiceNo || String(invoiceId),
				localRev: invoice.updatedAt || null,
				remoteRev: null,
				conflictType: "status",
				resolution: "voided",
				details: { reason: cleanReason, actor, role },
				createdDate: new Date(),
			})
			await upsertQueueRow(database, {
				entityType: "invoice",
				entityId: invoice.invoiceNo || String(invoiceId),
				operation: "update",
				payload: {
					invoiceNo: invoice.invoiceNo,
					voided: true,
					voidReason: cleanReason,
					voidedBy: actor,
					customerId: invoice.customerId ?? null,
					items: invoice.items || [],
					total: invoice.total ?? 0,
				},
			})
			return database.invoices.get(invoiceId)
		},
	)
}

export function listPayments(invoiceId) {
	return payments.findBy("invoiceId", invoiceId)
}

export const saleRepository = {
	...invoices,
	SALE_STATUS,
	createSale,
	getSale,
	getSaleByInvoiceNo,
	listOpenSales,
	listSalesByStatus,
	addPayment,
	voidSale,
	listPayments,
	getDb,
}

export default saleRepository
