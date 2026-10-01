import { sessionRole, sessionUser } from "@/data/session"
import { toMajor, toMinor } from "@/utils/money"
import { generateUUID } from "@/utils/offline/uuid"
import db from "./db"

const SALE_ENTITY = "third_party_sale"
const EVENT_ENTITY = "third_party_sale_event"

function requiredText(value, label) {
	const text = String(value ?? "").trim()
	if (!text) throw new Error(`${label} مطلوب`)
	return text
}

function finiteNumber(value, label, min = 0) {
	if (value === "" || value === null || value === undefined)
		throw new Error(`${label} مطلوب`)
	const number = Number(value)
	if (!Number.isFinite(number) || number < min)
		throw new Error(`${label} غير صالح`)
	return number
}

function buildSyncRow(entityType, entityId, operation, payload, createdAt) {
	return {
		entityType,
		entityId,
		operation,
		payload: {
			...payload,
			_localRev: createdAt.getTime().toString(),
			_localUpdatedAt: createdAt.toISOString(),
		},
		createdAt,
		attemptCount: 0,
		status: "pending",
	}
}

function buildAuditEvent({
	saleId,
	eventType,
	actorId,
	createdAt,
	details = {},
}) {
	return {
		id: generateUUID(),
		saleId,
		eventType,
		actorId,
		actorRole: sessionRole(),
		createdAt: createdAt.toISOString(),
		details,
		syncStatus: "pending",
	}
}

function calculateAmounts(input) {
	const quantity = finiteNumber(input.quantity, "الكمية", 0.0001)
	const unitPriceMinor = toMinor(finiteNumber(input.unitPrice, "سعر الوحدة"))
	const grossMinor = Math.round(quantity * unitPriceMinor)
	if (
		!Number.isSafeInteger(unitPriceMinor) ||
		!Number.isSafeInteger(grossMinor)
	)
		throw new Error("قيمة البيع تتجاوز الحد المالي الآمن")
	if (grossMinor <= 0) throw new Error("إجمالي البيع يجب أن يكون أكبر من صفر")

	if (
		input.commissionMode &&
		!["fixed", "percent"].includes(input.commissionMode)
	) {
		throw new Error("طريقة احتساب العمولة غير صالحة")
	}
	const commissionMode = input.commissionMode || "percent"
	const commissionRate =
		commissionMode === "percent"
			? finiteNumber(input.commissionRate, "نسبة العمولة")
			: 0
	if (commissionMode === "percent" && commissionRate > 100)
		throw new Error("نسبة العمولة لا يمكن أن تتجاوز 100٪")
	const commissionInputMinor =
		commissionMode === "fixed"
			? toMinor(finiteNumber(input.commissionAmount, "العمولة"))
			: Math.round((grossMinor * commissionRate) / 100)
	if (commissionInputMinor > grossMinor)
		throw new Error("العمولة لا يمكن أن تتجاوز قيمة البيع")

	const buyerPaidMinor = toMinor(
		finiteNumber(input.buyerPaid, "المبلغ المحصل من المشتري"),
	)
	if (!Number.isSafeInteger(buyerPaidMinor))
		throw new Error("المبلغ المحصل يتجاوز الحد المالي الآمن")
	if (buyerPaidMinor > grossMinor)
		throw new Error("المبلغ المحصل لا يمكن أن يتجاوز إجمالي البيع")

	return {
		quantity: Math.round(quantity * 10000) / 10000,
		unitPriceMinor,
		grossMinor,
		commissionMode,
		commissionRate,
		commissionMinor: commissionInputMinor,
		ownerNetMinor: grossMinor - commissionInputMinor,
		buyerPaidMinor,
		buyerDueMinor: grossMinor - buyerPaidMinor,
		ownerPaidMinor: 0,
		ownerDueMinor: grossMinor - commissionInputMinor,
	}
}

function saleStatus(ownerDueMinor, ownerPaidMinor) {
	if (ownerDueMinor === 0) return "SETTLED"
	return ownerPaidMinor > 0 ? "PARTIAL" : "OPEN"
}

export function previewThirdPartySale(input) {
	return calculateAmounts(input)
}

export async function createThirdPartySale(input) {
	const now = new Date()
	const id = generateUUID()
	const actorId = sessionUser()
	if (!actorId) throw new Error("يجب تسجيل الدخول لتسجيل البيع")
	const amounts = calculateAmounts(input)
	const sale = {
		id,
		saleNo: `TP-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
		sellerId: actorId,
		sellerName: String(input.sellerName || actorId).trim(),
		buyerId: String(input.buyerId || "").trim() || null,
		buyerName: requiredText(input.buyerName, "اسم المشتري"),
		ownerId: String(input.ownerId || "").trim() || null,
		ownerName: requiredText(input.ownerName, "اسم المالك أو المورد"),
		intermediaryId: String(input.intermediaryId || "").trim() || null,
		intermediaryName: String(input.intermediaryName || "").trim(),
		itemId: String(input.itemId || "").trim() || null,
		itemName: requiredText(input.itemName, "اسم الصنف"),
		uom: requiredText(input.uom, "الوحدة"),
		location: requiredText(input.location, "مكان البيع"),
		notes: String(input.notes || "").trim(),
		buyerPaymentMethod: String(input.buyerPaymentMethod || "cash").trim(),
		buyerPaymentReference: String(input.buyerPaymentReference || "").trim(),
		...amounts,
		saleDate: now.toISOString(),
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		status: saleStatus(amounts.ownerDueMinor, amounts.ownerPaidMinor),
		syncStatus: "pending",
	}
	const event = buildAuditEvent({
		saleId: id,
		eventType: "sale_created",
		actorId,
		createdAt: now,
		details: {
			grossMinor: sale.grossMinor,
			buyerPaidMinor: sale.buyerPaidMinor,
			buyerPaymentMethod: sale.buyerPaymentMethod,
			buyerPaymentReference: sale.buyerPaymentReference,
			commissionMinor: sale.commissionMinor,
			ownerDueMinor: sale.ownerDueMinor,
		},
	})

	await db.transaction(
		"rw",
		db.thirdPartySales,
		db.thirdPartySaleEvents,
		db.syncQueue,
		async () => {
			await db.thirdPartySales.add(sale)
			await db.thirdPartySaleEvents.add(event)
			await db.syncQueue.add(buildSyncRow(SALE_ENTITY, id, "create", sale, now))
			await db.syncQueue.add(
				buildSyncRow(EVENT_ENTITY, event.id, "create", event, now),
			)
		},
	)
	return sale
}

export async function listThirdPartySales({ status = "" } = {}) {
	const rows = status
		? await db.thirdPartySales.where("status").equals(status).toArray()
		: await db.thirdPartySales.toArray()
	return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getThirdPartySaleEvents(saleId) {
	return db.thirdPartySaleEvents
		.where("saleId")
		.equals(saleId)
		.sortBy("createdAt")
}

export async function recordThirdPartySettlement(input) {
	const saleId = requiredText(input.saleId, "رقم العملية")
	const amountMinor = toMinor(finiteNumber(input.amount, "مبلغ التسوية", 0.01))
	const method = requiredText(input.method, "طريقة الدفع")
	const actorId = sessionUser()
	if (!actorId) throw new Error("يجب تسجيل الدخول لتسجيل التسوية")
	const id = String(input.idempotencyKey || generateUUID())
	const now = new Date()
	let result

	await db.transaction(
		"rw",
		db.thirdPartySales,
		db.thirdPartySaleEvents,
		db.syncQueue,
		async () => {
			const replay = await db.thirdPartySaleEvents.get(id)
			if (replay) {
				result = {
					sale: await db.thirdPartySales.get(replay.saleId),
					event: replay,
					replayed: true,
				}
				return
			}

			const sale = await db.thirdPartySales.get(saleId)
			if (!sale) throw new Error("عملية البيع غير موجودة")
			if (sale.status === "VOIDED") throw new Error("لا يمكن تسوية عملية ملغاة")
			if (amountMinor > sale.ownerDueMinor)
				throw new Error("مبلغ التسوية يتجاوز المستحق للمالك")

			const beforeOwnerDueMinor = sale.ownerDueMinor
			const updated = {
				...sale,
				ownerPaidMinor: sale.ownerPaidMinor + amountMinor,
				ownerDueMinor: beforeOwnerDueMinor - amountMinor,
				status: saleStatus(
					beforeOwnerDueMinor - amountMinor,
					sale.ownerPaidMinor + amountMinor,
				),
				updatedAt: now.toISOString(),
				syncStatus: "pending",
			}
			const event = {
				...buildAuditEvent({
					saleId,
					eventType: "owner_settlement",
					actorId,
					createdAt: now,
					details: {
						amountMinor,
						method,
						reference: String(input.reference || "").trim(),
						beforeOwnerDueMinor,
						afterOwnerDueMinor: updated.ownerDueMinor,
					},
				}),
				id,
			}

			await db.thirdPartySales.put(updated)
			await db.thirdPartySaleEvents.add(event)
			await db.syncQueue.add(
				buildSyncRow(SALE_ENTITY, saleId, "update", updated, now),
			)
			await db.syncQueue.add(
				buildSyncRow(EVENT_ENTITY, event.id, "create", event, now),
			)
			result = { sale: updated, event, replayed: false }
		},
	)
	return result
}

export function formatThirdPartyMoney(minor) {
	return toMajor(minor).toFixed(2)
}
