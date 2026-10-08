/**
 * Cart-line rules gate.
 *
 * The rules this file pins were lifted verbatim out of `POSSale.vue` into
 * `composables/useCartLines.js`. Nothing about the behaviour changed, so these
 * tests are about FREEZING it: each one is a rule a cashier would notice
 * immediately if a refactor altered it.
 *
 *   - quantity never goes below 1 (a zero line is a removed line, not a free
 *     item)
 *   - "quantity <= 1" then decrement REMOVES the line rather than parking it
 *   - an emptied or non-numeric quantity field REMOVES the line — a cashier
 *     who clears a field means "take it out", and a silent clamp to 1 leaves
 *     them selling something they tried to delete
 *   - quantities are floored (no 2.5 units) and clamped at 9999
 *   - adding the same product twice increments ONE line, and line ids stay
 *     unique across two taps in the same millisecond
 *   - a disabled product is never added, and never tracked as a preference
 */
import { describe, expect, it, vi } from "vitest"

const { createCartLines, MAX_LINE_QUANTITY } = await import(
	"@/composables/useCartLines"
)
const { normalizeProduct } = await import("@/utils/posSalePure")

const product = { item_code: "A1", item_name_ar: "قلم", rate: "5.5" }

function setup(overrides = {}) {
	const cart = []
	const onProductAdded = vi.fn()
	const lines = createCartLines({
		normalizeProduct,
		onProductAdded,
		isEmpty: () => cart.length === 0,
		...overrides,
	})
	return { cart, lines, onProductAdded }
}

describe("addToCart", () => {
	it("adds a new line from a catalog row", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		expect(cart).toHaveLength(1)
		expect(cart[0]).toMatchObject({
			productId: "A1",
			name: "قلم",
			quantity: 1,
			unitPrice: 5.5,
		})
	})

	it("increments ONE line when the same product is added twice", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.addToCart(product, cart)
		expect(cart).toHaveLength(1)
		expect(cart[0].quantity).toBe(2)
	})

	it("gives two lines distinct ids even within the same millisecond", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.addToCart({ item_code: "B2", item_name_ar: "دفتر", rate: 3 }, cart)
		// A duplicate id would make `removeItem` delete the WRONG line.
		expect(cart[0].id).not.toBe(cart[1].id)
	})

	it("refuses a product without a real selling price", () => {
		const notify = vi.fn()
		const { cart, lines, onProductAdded } = setup({ notify })
		lines.addToCart({ item_code: "NP", item_name_ar: "بدون سعر" }, cart)
		expect(cart).toHaveLength(0)
		expect(onProductAdded).not.toHaveBeenCalled()
		expect(notify).toHaveBeenCalledWith(
			"لا يمكن بيع الصنف قبل تحديد سعر بيع صالح.",
			"warning",
		)
	})

	it("refuses a disabled product and does not learn from it", () => {
		const { cart, lines, onProductAdded } = setup()
		lines.addToCart({ ...product, disabled: true }, cart)
		expect(cart).toHaveLength(0)
		expect(onProductAdded).not.toHaveBeenCalled()
	})
})

describe("quantity rules", () => {
	it("never decrements below one", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.incrementItem(cart[0])
		lines.decrementItem(cart[0], cart)
		expect(cart[0].quantity).toBe(1)
	})

	it("removes the line when decrementing at quantity 1", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.decrementItem(cart[0], cart)
		expect(cart).toHaveLength(0)
	})

	it("REMOVES the line when the quantity field is emptied", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.setItemQuantity(cart[0], "", cart)
		// Clamping to 1 here would sell an item the cashier tried to delete.
		expect(cart).toHaveLength(0)
	})

	it("removes the line for a non-numeric quantity", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.setItemQuantity(cart[0], "abc", cart)
		expect(cart).toHaveLength(0)
	})

	it("floors a fractional quantity", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.setItemQuantity(cart[0], 2.9, cart)
		expect(cart[0].quantity).toBe(2)
	})

	it("clamps at the documented maximum", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.setItemQuantity(cart[0], 999999, cart)
		expect(cart[0].quantity).toBe(MAX_LINE_QUANTITY)
	})

	it("ignores a missing line rather than throwing", () => {
		const { cart, lines } = setup()
		expect(() => lines.incrementItem(null)).not.toThrow()
		expect(() => lines.decrementItem(null, cart)).not.toThrow()
		expect(() => lines.setItemQuantity(null, 3, cart)).not.toThrow()
	})
})

describe("remove and clear", () => {
	it("removes only the named line", () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.addToCart({ item_code: "B2", item_name_ar: "دفتر", rate: 3 }, cart)
		lines.removeItem(cart[0], cart)
		expect(cart.map((l) => l.productId)).toEqual(["B2"])
	})

	it("clearing an empty cart is a no-op and stays silent", () => {
		const notify = vi.fn()
		const { cart, lines } = setup({ notify })
		expect(lines.clearLines(cart)).toBe(false)
		expect(notify).not.toHaveBeenCalled()
	})

	it("clearing a filled cart empties it, resets the discount and confirms", () => {
		const notify = vi.fn()
		const { cart, lines } = setup({ notify })
		const discount = { value: 10 }
		const closeDialog = { value: true }
		lines.addToCart(product, cart)

		expect(lines.clearLines(cart, { discount, closeDialog })).toBe(true)
		expect(cart).toHaveLength(0)
		expect(discount.value).toBe(0)
		expect(closeDialog.value).toBe(false)
		expect(notify).toHaveBeenCalledWith("تم إفراغ السلة", "success")
	})
})

describe("quantity editor", () => {
	it("commits the edited quantity and closes", async () => {
		const { cart, lines } = setup()
		lines.addToCart(product, cart)
		lines.openQuantityEditor(cart[0], null)
		// A `ref` wraps its value in a reactive PROXY, so identity against the
		// raw array element fails even though it is the same line. Compare the
		// line id — which is what the editor actually points at.
		expect(lines.quantityEditor.value?.id).toBe(cart[0].id)

		cart[0].quantity = 6
		await lines.commitQuantity(cart, null, undefined)

		expect(cart[0].quantity).toBe(6)
		expect(lines.quantityEditor.value ?? null).toBeNull()
	})

	it("committing with nothing open is a no-op", () => {
		const { cart, lines } = setup()
		expect(() => lines.commitQuantity(cart, null, undefined)).not.toThrow()
	})
})
