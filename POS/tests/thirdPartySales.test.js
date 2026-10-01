import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import db from "@/services/db"
import {
	createThirdPartySale,
	getThirdPartySaleEvents,
	listThirdPartySales,
	previewThirdPartySale,
	recordThirdPartySettlement,
} from "@/services/thirdPartySales"

const saleInput = {
	buyerName: "مشتري السوق",
	ownerName: "مالك البضاعة",
	intermediaryName: "وسيط السوق",
	itemName: "طماطم",
	quantity: 2.5,
	uom: "كجم",
	unitPrice: 4.2,
	commissionMode: "percent",
	commissionRate: 10,
	buyerPaid: 5,
	location: "السوق المركزي",
}

describe("third-party sales local ledger", () => {
	beforeEach(async () => {
		localStorage.setItem(
			"dypos_user_session",
			JSON.stringify({ email: "seller@example.test", role: "MANAGER" }),
		)
		await db.open()
		await db.transaction(
			"rw",
			db.thirdPartySales,
			db.thirdPartySaleEvents,
			db.syncQueue,
			async () => {
				await db.thirdPartySales.clear()
				await db.thirdPartySaleEvents.clear()
				await db.syncQueue.clear()
			},
		)
	})

	afterAll(() => db.close())

	it("calculates weight sales and percentage commission in minor units", () => {
		expect(previewThirdPartySale(saleInput)).toMatchObject({
			quantity: 2.5,
			grossMinor: 1050,
			commissionMinor: 105,
			ownerNetMinor: 945,
			buyerPaidMinor: 500,
			buyerDueMinor: 550,
			ownerDueMinor: 945,
		})
	})

	it("supports an editable fixed commission before saving", () => {
		expect(
			previewThirdPartySale({
				...saleInput,
				commissionMode: "fixed",
				commissionAmount: "2.00",
			}),
		).toMatchObject({
			grossMinor: 1050,
			commissionMinor: 200,
			ownerNetMinor: 850,
		})
	})

	it("persists a complete sale, immutable creation event, and deferred sync rows", async () => {
		const sale = await createThirdPartySale(saleInput)
		const events = await getThirdPartySaleEvents(sale.id)
		const queued = await db.syncQueue.toArray()

		expect(sale).toMatchObject({
			sellerId: "seller@example.test",
			buyerName: "مشتري السوق",
			ownerName: "مالك البضاعة",
			intermediaryName: "وسيط السوق",
			grossMinor: 1050,
			commissionMinor: 105,
			ownerDueMinor: 945,
			status: "OPEN",
		})
		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			saleId: sale.id,
			eventType: "sale_created",
			actorId: "seller@example.test",
		})
		expect(queued.map((row) => row.entityType)).toEqual([
			"third_party_sale",
			"third_party_sale_event",
		])
		expect(await listThirdPartySales()).toHaveLength(1)
	})

	it("records partial and final settlements without mutating audit history", async () => {
		const sale = await createThirdPartySale(saleInput)
		const first = await recordThirdPartySettlement({
			saleId: sale.id,
			amount: 3,
			method: "cash",
			idempotencyKey: "settlement-1",
		})
		expect(first.sale).toMatchObject({
			ownerPaidMinor: 300,
			ownerDueMinor: 645,
			status: "PARTIAL",
		})

		const replay = await recordThirdPartySettlement({
			saleId: sale.id,
			amount: 3,
			method: "cash",
			idempotencyKey: "settlement-1",
		})
		expect(replay.replayed).toBe(true)
		expect(replay.sale.ownerDueMinor).toBe(645)

		const final = await recordThirdPartySettlement({
			saleId: sale.id,
			amount: 6.45,
			method: "transfer",
			reference: "TX-42",
			idempotencyKey: "settlement-2",
		})
		expect(final.sale).toMatchObject({ ownerDueMinor: 0, status: "SETTLED" })
		const events = await getThirdPartySaleEvents(sale.id)
		expect(events.map((event) => event.eventType)).toEqual([
			"sale_created",
			"owner_settlement",
			"owner_settlement",
		])
		expect(events[1].details).toMatchObject({
			beforeOwnerDueMinor: 945,
			afterOwnerDueMinor: 645,
			amountMinor: 300,
		})
	})

	it("rejects over-settlement and leaves the ledger unchanged", async () => {
		const sale = await createThirdPartySale(saleInput)
		await expect(
			recordThirdPartySettlement({
				saleId: sale.id,
				amount: 9.46,
				method: "cash",
				idempotencyKey: "too-much",
			}),
		).rejects.toThrow("يتجاوز المستحق")
		expect((await db.thirdPartySales.get(sale.id)).ownerDueMinor).toBe(945)
		expect(await getThirdPartySaleEvents(sale.id)).toHaveLength(1)
	})

	it("rejects invalid commission and buyer payment before writing", async () => {
		expect(() =>
			previewThirdPartySale({ ...saleInput, commissionRate: 101 }),
		).toThrow("100٪")
		expect(() =>
			previewThirdPartySale({ ...saleInput, buyerPaid: 11 }),
		).toThrow("إجمالي البيع")
		expect(await db.thirdPartySales.count()).toBe(0)
	})

	it("does not send network requests while recording locally", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch")
		await createThirdPartySale(saleInput)
		expect(fetchSpy).not.toHaveBeenCalled()
		fetchSpy.mockRestore()
	})
})
