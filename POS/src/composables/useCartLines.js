/**
 * Cart line operations — the pure, UI-free half of the sale page.
 *
 * ## Why this is extracted
 *
 * `POSSale.vue` is the largest shipped file and the debt log names "cart
 * logic" as the next unit to move. The file-size ratchet only goes DOWN, and
 * the rule is: extract first, then lower the number in the same commit.
 *
 * ## What moved (verbatim behaviour, no rewrites)
 *
 * `addProduct`, `incrementItem`, `decrementItem`, `setItemQuantity`,
 * `removeItem`, `clearCart`, and the quantity editor trio. Nothing was
 * "improved" here on purpose: a cart line that behaves differently after a
 * refactor is a cashier charged the wrong number, and the pure rules below
 * (the 9999 clamp, the "quantity ≤ 1 removes the line" rule, the
 * zero-or-negative-means-remove rule) are exactly what the tests pin.
 *
 * ## Why the dependencies are injected
 *
 * `normalizeProduct` and `trackProductAdded` are passed IN rather than
 * imported. Two reasons, both measured:
 *   1. `trackProductAdded` belongs to the smart-cashier composable, which the
 *      page owns; importing it here would create a second owner.
 *   2. It keeps this module free of the sale page's graph, so a test can
 *      exercise cart rules without mounting POSSale at all.
 */
import { nextTick, ref } from "vue"

/** Above this a quantity is a data-entry mistake, not a sale. */
export const MAX_LINE_QUANTITY = 9999

/**
 * @param {object} deps
 * @param {() => object|null} deps.normalizeProduct - folds a catalog row.
 * @param {(p: {productId: string, name: string}) => void} [deps.onProductAdded]
 * @param {() => boolean} [deps.isEmpty] - the page's `cartEmpty` computed.
 * @param {(message: string, kind: string) => void} [deps.notify]
 */
export function createCartLines({
	normalizeProduct,
	onProductAdded = null,
	isEmpty = () => false,
	notify = null,
}) {
	// Monotonic suffix so two taps in the same millisecond still get unique
	// line ids — a duplicate id makes `removeItem` delete the wrong line.
	let idCounter = 0

	const quantityEditor = ref(null)

	function addToCart(product, cart) {
		const normalized = normalizeProduct(product)

		if (!normalized || normalized.disabled) return

		// A missing price is master-data incompleteness, never a zero-priced sale.
		// Keep the item visible for correction, but refuse to create a billable
		// line until a real price is available.
		if (normalized.priceMissing) {
			notify?.("لا يمكن بيع الصنف قبل تحديد سعر بيع صالح.", "warning")
			return
		}

		onProductAdded?.({ productId: normalized.id, name: normalized.name })

		const existing = cart.find((item) => item.productId === normalized.id)
		if (existing) {
			existing.quantity += 1
			return normalized
		}

		idCounter += 1
		cart.push({
			id: `${normalized.id}-${Date.now()}-${idCounter}`,
			productId: normalized.id,
			code: normalized.code,
			name: normalized.name,
			image: normalized.image,
			unit: normalized.unit,
			quantity: 1,
			unitPrice: normalized.price,
			discount: 0,
			taxRate: Number(normalized.taxRate ?? 0),
			notes: "",
		})

		return normalized
	}

	/** Quantity never drops below 1 — a zero line is a removed line. */
	function incrementItem(item) {
		if (!item) return
		item.quantity = Math.max(1, Number(item.quantity || 0) + 1)
	}

	function decrementItem(item, cart) {
		if (!item) return
		const quantity = Number(item.quantity || 0)
		if (quantity <= 1) {
			removeItem(item, cart)
			return
		}
		item.quantity = quantity - 1
	}

	/**
	 * Apply an edited quantity. A non-numeric or non-positive value REMOVES the
	 * line rather than silently clamping it to 1 — a cashier who clears the
	 * field means "take it out", and a silent 1 leaves them selling something
	 * they tried to delete.
	 */
	function setItemQuantity(item, quantity, cart) {
		if (!item) return
		const parsed = Number(quantity)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			removeItem(item, cart)
			return
		}
		item.quantity = Math.min(MAX_LINE_QUANTITY, Math.floor(parsed))
	}

	function removeItem(item, cart) {
		const index = cart.findIndex((entry) => entry.id === item.id)
		if (index === -1) return
		cart.splice(index, 1)
	}

	function clearLines(cart, { discount, closeDialog } = {}) {
		if (isEmpty()) return false
		cart.splice(0, cart.length)
		if (discount) discount.value = 0
		if (closeDialog) closeDialog.value = false
		notify?.("تم إفراغ السلة", "success")
		return true
	}

	function openQuantityEditor(item, input) {
		quantityEditor.value = item
		nextTick(() => {
			input?.value?.focus?.()
			input?.value?.select?.()
		})
	}

	function closeQuantityEditor(returnFocus) {
		quantityEditor.value = null
		// Return focus to search so the cashier never loses keyboard flow.
		nextTick(() => returnFocus?.())
	}

	function commitQuantity(cart, input, returnFocus) {
		if (!quantityEditor.value) return
		setItemQuantity(quantityEditor.value, quantityEditor.value.quantity, cart)
		closeQuantityEditor(returnFocus)
	}

	return {
		quantityEditor,
		addToCart,
		incrementItem,
		decrementItem,
		setItemQuantity,
		removeItem,
		clearLines,
		openQuantityEditor,
		closeQuantityEditor,
		commitQuantity,
	}
}

export default createCartLines
