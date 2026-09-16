/**
 * KioskCart — منطق سلة التسوق الذاتي للوحة عرض المتجر (منطق نقي).
 *
 * العميل يختار منتجات من شاشة اللمس الكبيرة، ويُرسل طلبه إلى الكاشير.
 * السلة تتحقق من التوفر المحلي (الكمية المتاحة بعد الحجوزات) لمنع
 * طلب كميات غير موجودة.
 */

/**
 * إضافة منتج للسلة (أو زيادة كميته).
 * @param {Array} cart
 * @param {Object} item - { id, code, name, price, availableQty? }
 * @param {number} [qty=1]
 * @returns {{cart: Array, added: boolean, error?: string}}
 */
export function addToCart(cart, item, qty = 1, availableQty = null) {
	if (!item || item.id == null) {
		return { cart, added: false, error: "منتج غير صالح" }
	}
	const step = Number(qty) || 1
	const existing = cart.find((line) => line.id === item.id)
	const currentQty = existing ? existing.qty : 0

	if (availableQty != null && currentQty + step > Number(availableQty)) {
		return {
			cart,
			added: false,
			error: `الكمية المتاحة من "${item.name}" هي ${availableQty}`,
		}
	}

	if (existing) {
		return {
			cart: cart.map((line) =>
				line.id === item.id ? { ...line, qty: line.qty + step } : line,
			),
			added: true,
		}
	}

	return {
		cart: [
			...cart,
			{
				id: item.id,
				code: item.code ?? null,
				name: item.name ?? "",
				price: Number(item.price) || 0,
				qty: step,
			},
		],
		added: true,
	}
}

/**
 * تغيير كمية سطر في السلة (يدعم الحذف عند الصفر).
 * @param {Array} cart
 * @param {string|number} itemId
 * @param {number} newQty
 * @param {number|null} [availableQty]
 * @returns {{cart: Array, error?: string}}
 */
export function setQty(cart, itemId, newQty, availableQty = null) {
	const qty = Number(newQty) || 0
	if (qty <= 0) {
		return { cart: cart.filter((line) => line.id !== itemId) }
	}
	if (availableQty != null && qty > Number(availableQty)) {
		return {
			cart,
			error: `الكمية المتاحة هي ${availableQty}`,
		}
	}
	return {
		cart: cart.map((line) => (line.id === itemId ? { ...line, qty } : line)),
	}
}

/**
 * إزالة سطر من السلة.
 * @param {Array} cart
 * @param {string|number} itemId
 * @returns {Array}
 */
export function removeFromCart(cart, itemId) {
	return cart.filter((line) => line.id !== itemId)
}

/**
 * تفريغ السلة.
 * @returns {Array}
 */
export function clearCart() {
	return []
}

/**
 * إجمالي السلة.
 * @param {Array} cart
 * @returns {number}
 */
export function cartTotal(cart) {
	return (
		Math.round(
			cart.reduce(
				(sum, line) => sum + Number(line.price) * Number(line.qty),
				0,
			) * 100,
		) / 100
	)
}

/**
 * عدد القطع الكلي في السلة.
 * @param {Array} cart
 * @returns {number}
 */
export function cartCount(cart) {
	return cart.reduce((sum, line) => sum + Number(line.qty || 0), 0)
}

/**
 * تحويل السلة إلى حمولة طلب عميل (لإرسالها للكاشير).
 * @param {Array} cart
 * @param {Object} [meta] - { customerName, phone, note, source }
 * @returns {Object}
 */
export function toRequestPayload(cart, meta = {}) {
	return {
		items: cart.map((line) => ({
			itemId: line.id,
			code: line.code,
			name: line.name,
			qty: line.qty,
			price: line.price,
		})),
		total: cartTotal(cart),
		customerName: meta.customerName || "",
		phone: meta.phone || "",
		note: meta.note || "",
		source: meta.source || "kiosk",
	}
}

/**
 * تجميع سطور الطلب حسب القسم (لتحسين عرض اللوحة).
 * @param {Array} items
 * @returns {Object<string, Array>} خريطة {القسم: [عناصر]}
 */
export function groupByCategory(items) {
	const groups = {}
	for (const item of items || []) {
		const category = item.category || item.item_group || "أخرى"
		if (!groups[category]) groups[category] = []
		groups[category].push(item)
	}
	return groups
}

export default {
	addToCart,
	setQty,
	removeFromCart,
	clearCart,
	cartTotal,
	cartCount,
	toRequestPayload,
	groupByCategory,
}
