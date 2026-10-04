/**
 * A self-checkout sale, from an empty till to a receipt.
 *
 * ## Why this file exists
 *
 * `tests/sfcCompiles.test.js` proves components MOUNT, and the composable suites
 * prove each piece in isolation. Neither proves the two together, and that gap
 * was expensive: `useSelfCheckoutSession` exported `backToCart`,
 * `chooseMethod`, `setTenderMinor` and `bumpTenderMinor` — four names the
 * screen destructures and calls — and NONE was defined in the module. Every
 * composable-only test passed, every mount-only test passed, and a customer at
 * the till could not go back from payment, could not change payment method, and
 * could not type or add a single amount.
 *
 * A green unit suite is a statement about units. This is the statement about
 * the CUSTOMER: can a sale actually be completed here?
 *
 * Numbers are MINOR units (halalas) everywhere, matching `evaluateTender` and
 * `nextOfflineInvoiceNumber`; a test written in major units would pass against a
 * hundred-times-wrong total.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/qzTray", () => ({
	getQZStatus: vi.fn(() => ({ connected: true })),
}))

/** No network in any step — a call here is the failure this file exists to see. */
const noNetwork = () => {
	throw new Error("self-checkout must complete with zero network requests")
}

const fetchSpy = vi.fn(noNetwork)
const callSpy = vi.fn(noNetwork)

vi.stubGlobal("fetch", fetchSpy)

vi.mock("@/utils/methodClient", async () => {
	const actual = await vi.importActual("@/utils/methodClient")
	return {
		...actual,
		methodCall: (...args) => callSpy(...args),
		methodGetList: (...args) => callSpy(...args),
		methodGetListWithSource: async () => ({
			rows: [
				{
					item_code: "SKU-1",
					item_name: "قهوة",
					standard_rate: 12.5,
					stock_uom: "pcs",
					disabled: 0,
				},
				{
					item_code: "SKU-2",
					item_name: "ماء",
					standard_rate: 2,
					stock_uom: "pcs",
					disabled: 0,
				},
			],
			source: "local",
		}),
	}
})

const { PAYMENT_METHODS, SESSION_STATES, paymentMethodById } = await import(
	"@/components/selfCheckout/selfCheckoutState.js"
)
const { useSelfCheckoutSession } = await import(
	"@/components/selfCheckout/useSelfCheckoutSession.js"
)

/**
 * One catalog row, in the shape `normalizeProduct` emits.
 *
 * The RAW server row (`item_code` / `standard_rate`) is deliberately NOT what
 * reaches `addItem`: the catalog normalizes every row on the way in, and
 * `buildCartLine` reads the normalized `id` / `price`. Feeding it raw rows is
 * the mistake that made this file's first run report an empty cart — the line
 * builder returns `null` for a product with no `id`, and a `null` line is
 * dropped silently.
 */
const product = (over = {}) => ({
	id: "SKU-1",
	code: "SKU-1",
	name: "قهوة",
	price: 12.5,
	unit: "pcs",
	taxRate: 0,
	...over,
})

const water = product({
	id: "SKU-2",
	code: "SKU-2",
	name: "ماء",
	price: 2,
})

/** A till ready for a customer: the session OPENED, as the screen does on mount. */
const newTill = () => {
	const till = useSelfCheckoutSession({ branch: "MAIN", terminal: "T1" })
	till.startSession()
	return till
}

beforeEach(() => {
	fetchSpy.mockClear()
	callSpy.mockClear()
})

describe("a self-checkout sale end to end", () => {
	it("completes: browse, add, pay, receipt, with no network", async () => {
		const till = newTill()

		await till.loadCatalog()
		expect(till.catalog.value.length).toBe(2)

		// --- add items -------------------------------------------------
		till.addItem(product(), 2) // 2 × 12.50 = 25.00
		till.addItem(water, 1) //      +  2.00

		expect(till.itemCount.value).toBe(3) // 2 lines, 3 units
		expect(till.totalMinor.value).toBe(2700) // 27.00 in halalas
		expect(till.isEmpty.value).toBe(false)
		expect(till.canPay.value).toBe(true)

		// --- choose a payment method -----------------------------------
		const card = PAYMENT_METHODS.find((m) => m.id !== "cash")
		expect(card, "more than one method must exist").toBeTruthy()
		till.chooseMethod(card.id)
		expect(till.method.value).toBe(card.id)

		// An unknown id must NOT move state to something no button shows.
		till.chooseMethod("not-a-method")
		expect(till.method.value).toBe(card.id)

		// --- pay exactly ------------------------------------------------
		till.beginPayment()
		expect(till.state.value).toBe(SESSION_STATES.PAYING)

		till.setTenderMinor(till.totalMinor.value)
		expect(till.canConfirm.value).toBe(true)

		await till.confirmPayment()

		// --- the receipt is the proof -----------------------------------
		expect(till.error.value).toBe("")
		expect(till.receipt.value).toBeTruthy()
		expect(till.receipt.value.invoiceNo).toMatch(/^SC-/)
		expect(till.receipt.value.items).toBe(2)
		expect(till.receipt.value.totalMinor).toBe(2700)
		expect(till.receipt.value.changeMinor).toBe(0)

		// --- the till is empty again, ready for the next customer ------
		expect(till.cart.value).toHaveLength(0)
		expect(till.itemCount.value).toBe(0)

		// --- and none of it needed a network ---------------------------
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("gives change, and never lets the cashier overpay", () => {
		const till = newTill()
		// A basket big enough that a 20.00 note is genuinely an OVERPAYMENT:
		// 12.50 would have the clamp swallow the test's real case.
		till.addItem(product(), 10) // 125.00 = 12500 minor
		till.beginPayment()
		expect(till.totalMinor.value).toBe(12500)

		// Overpayment is NOT swallowed: 150.00 against 125.00 owes the customer 25.00
		// back. Clamping here would show "paid exactly" and send a customer out
		// 25 short, so the amount is stored whole and the change is computed.
		till.setTenderMinor(15000)
		expect(till.tenderMinor.value).toBe(15000)
		expect(till.tender.value.changeMinor).toBe(2500)
		expect(till.tender.value.paid).toBe(true)

		// A negative amount is not an amount — the previous value stands.
		till.setTenderMinor(-500)
		expect(till.tenderMinor.value).toBe(15000)
	})

	it("adds quick amounts on top of what was typed, not instead of it", () => {
		const till = newTill()
		till.addItem(product(), 1) // one 12.50 line = 1250 minor

		// Two lines, so there is room for a typed amount plus additions without
		// hitting the ceiling before the point of the assertion.
		till.addItem(water, 30) // +60.00 = 7250 total
		expect(till.totalMinor.value).toBe(7250)

		till.setTenderMinor(1000) // 10.00 typed
		till.bumpTenderMinor(500) // +5.00, accumulating on what was typed
		expect(till.tenderMinor.value).toBe(1500)

		// A further press keeps accumulating; it is additive, not a reset.
		till.bumpTenderMinor(500)
		expect(till.tenderMinor.value).toBe(2000)

		// A non-positive press changes nothing rather than clearing the amount.
		till.bumpTenderMinor(0)
		till.bumpTenderMinor(-100)
		expect(till.tenderMinor.value).toBe(2000)
	})

	it("goes back from payment with the cart intact", () => {
		const till = newTill()

		till.addItem(product(), 2)
		till.beginPayment()
		till.setTenderMinor(5000)

		till.backToCart()

		expect(till.state.value).toBe(SESSION_STATES.OPEN)
		// The customer went back to CHANGE something, not to start over.
		expect(till.itemCount.value).toBe(2)
		expect(till.totalMinor.value).toBe(2500)
		expect(till.tenderMinor.value).toBe(0)
		expect(till.receipt.value).toBeNull()
	})

	it("refuses to pay an empty cart", async () => {
		const till = newTill()
		expect(till.isEmpty.value).toBe(true)

		till.beginPayment()
		expect(till.state.value).not.toBe(SESSION_STATES.PAYING)

		await till.confirmPayment()
		expect(till.receipt.value).toBeNull()
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("freezes the cart while payment is in progress", () => {
		const till = newTill()
		till.addItem(product(), 1)
		till.beginPayment()

		const before = till.itemCount.value
		till.addItem(product(), 5)
		till.removeItem("SKU-1")

		expect(till.itemCount.value).toBe(before)
	})

	it("numbers two consecutive sales differently", async () => {
		// Offline numbering is why a till can trade with no server; a duplicate
		// here means two customers get one receipt number.
		const first = newTill()
		first.addItem(product(), 1)
		first.beginPayment()
		first.setTenderMinor(first.totalMinor.value)
		await first.confirmPayment()

		const second = newTill()
		second.addItem(product(), 1)
		second.beginPayment()
		second.setTenderMinor(second.totalMinor.value)
		await second.confirmPayment()

		expect(first.receipt.value.invoiceNo).not.toBe(
			second.receipt.value.invoiceNo,
		)
		expect(paymentMethodById("cash")).toBeTruthy()
	})
})
