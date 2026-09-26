/**
 * DyPOS Domain Entities — Business objects (framework-independent)
 * These are plain JS classes with validation rules.
 */

import { getCurrencySymbol } from "@/utils/currency"

class Product {
	constructor({
		id,
		code,
		name,
		nameAr,
		barcode,
		unitPrice,
		cost,
		taxRate,
		stockQty,
		uom,
		variants,
		image,
		category,
		brand,
		isActive = true,
	}) {
		this.id = String(id || "").trim()
		this.code = String(code || "").trim()
		this.name = String(name || "").trim()
		this.nameAr = String(nameAr || name || "").trim()
		this.barcode = String(barcode || "").trim()
		this.unitPrice = Number(unitPrice) || 0
		this.cost = Number(cost) || 0
		this.taxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : 0
		this.stockQty = Number(stockQty) || 0
		this.uom = String(uom || "Unit").trim()
		this.variants = Array.isArray(variants) ? variants : []
		this.image = String(image || "").trim()
		this.category = String(category || "").trim()
		this.brand = String(brand || "").trim()
		this.isActive = isActive
	}
	get hasStock() {
		return this.stockQty > 0
	}
	get displayPrice() {
		return this.unitPrice
	}
	toJSON() {
		return {
			id: this.id,
			code: this.code,
			name: this.name,
			nameAr: this.nameAr,
			barcode: this.barcode,
			unitPrice: this.unitPrice,
			cost: this.cost,
			taxRate: this.taxRate,
			stockQty: this.stockQty,
			uom: this.uom,
			variants: this.variants,
			image: this.image,
			category: this.category,
			brand: this.brand,
			isActive: this.isActive,
		}
	}
}

class Customer {
	constructor({
		id,
		name,
		phone,
		email,
		taxNumber,
		loyaltyTier = "BRONZE",
		loyaltyPoints = 0,
		walletBalance = 0,
		creditLimit = 0,
		creditUsed = 0,
		address,
	}) {
		this.id = String(id || "").trim()
		this.name = String(name || "").trim()
		this.phone = String(phone || "").trim()
		this.email = String(email || "").trim()
		this.taxNumber = String(taxNumber || "").trim()
		this.loyaltyTier = String(loyaltyTier || "BRONZE").trim()
		this.loyaltyPoints = Math.floor(Number(loyaltyPoints) || 0)
		this.walletBalance = Number(walletBalance) || 0
		this.creditLimit = Number(creditLimit) || 0
		this.creditUsed = Number(creditUsed) || 0
		this.address = String(address || "").trim()
	}
	get creditAvailable() {
		return this.creditLimit - this.creditUsed
	}
	get canBuyOnCredit() {
		return this.creditLimit <= 0 || this.creditAvailable > 0
	}
	toJSON() {
		return {
			id: this.id,
			name: this.name,
			phone: this.phone,
			email: this.email,
			taxNumber: this.taxNumber,
			loyaltyTier: this.loyaltyTier,
			loyaltyPoints: this.loyaltyPoints,
			walletBalance: this.walletBalance,
			creditLimit: this.creditLimit,
			creditUsed: this.creditUsed,
			address: this.address,
		}
	}
}

class Invoice {
	constructor({
		id,
		number,
		customerId,
		customerName,
		items,
		payments,
		discounts,
		subtotal,
		taxAmount,
		total,
		paidAmount,
		remainingAmount,
		status = "DRAFT",
		currency = "",
		notes,
		channelId,
		shiftId,
		terminalId,
		zatcaQr,
	}) {
		this.id = String(id || "").trim()
		this.number = String(number || "").trim()
		this.customerId = String(customerId || "").trim()
		this.customerName = String(customerName || "Walk-in Customer").trim()
		this.items = Array.isArray(items)
			? items.map((i) => new InvoiceItem(i))
			: []
		this.payments = Array.isArray(payments)
			? payments.map((p) => new Payment(p))
			: []
		this.discounts = discounts || {}
		this.subtotal = Number(subtotal) || 0
		this.taxAmount = Number(taxAmount) || 0
		this.total = Number(total) || 0
		this.paidAmount = Number(paidAmount) || 0
		this.remainingAmount = Number(remainingAmount) || 0
		this.status = status
		this.currency = currency || getCurrencySymbol()
		this.notes = String(notes || "").trim()
		this.channelId = String(channelId || "").trim()
		this.shiftId = String(shiftId || "").trim()
		this.terminalId = String(terminalId || "").trim()
		this.zatcaQr = String(zatcaQr || "").trim()
		this.createdAt = new Date().toISOString()
	}
	get isFullyPaid() {
		return this.remainingAmount <= 0.01
	}
	get isCredit() {
		return this.remainingAmount > 0.01
	}
	get isReturn() {
		return this.total < 0
	}
	toJSON() {
		return {
			id: this.id,
			number: this.number,
			customerId: this.customerId,
			customerName: this.customerName,
			items: this.items.map((i) => i.toJSON()),
			payments: this.payments.map((p) => p.toJSON()),
			discounts: this.discounts,
			subtotal: this.subtotal,
			taxAmount: this.taxAmount,
			total: this.total,
			paidAmount: this.paidAmount,
			remainingAmount: this.remainingAmount,
			status: this.status,
			currency: this.currency,
			notes: this.notes,
			channelId: this.channelId,
			shiftId: this.shiftId,
			terminalId: this.terminalId,
			zatcaQr: this.zatcaQr,
			createdAt: this.createdAt,
		}
	}
}

class InvoiceItem {
	constructor({
		productId,
		productName,
		barcode,
		qty,
		unitPrice,
		discount = 0,
		taxRate = 0,
		taxAmount = 0,
		total,
		uom,
		warehouseId,
		notes,
	}) {
		this.productId = String(productId || "").trim()
		this.productName = String(productName || "").trim()
		this.barcode = String(barcode || "").trim()
		this.qty = Number(qty) || 1
		this.unitPrice = Number(unitPrice) || 0
		this.discount = Number(discount) || 0
		this.taxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : 0
		this.taxAmount = Number(taxAmount) || 0
		this.total =
			Number(total) ||
			this.qty * this.unitPrice - this.discount + this.taxAmount
		this.uom = String(uom || "Unit").trim()
		this.warehouseId = String(warehouseId || "").trim()
		this.notes = String(notes || "").trim()
	}
	get netAmount() {
		return this.qty * this.unitPrice - this.discount
	}
	toJSON() {
		return {
			productId: this.productId,
			productName: this.productName,
			barcode: this.barcode,
			qty: this.qty,
			unitPrice: this.unitPrice,
			discount: this.discount,
			taxRate: this.taxRate,
			taxAmount: this.taxAmount,
			total: this.total,
			uom: this.uom,
			warehouseId: this.warehouseId,
			notes: this.notes,
		}
	}
}

class Payment {
	constructor({ method, amount, reference = "", walletTransactionId }) {
		this.method = String(method || "CASH").toUpperCase()
		this.amount = Number(amount) || 0
		this.reference = String(reference || "").trim()
		this.walletTransactionId = walletTransactionId || null
	}
	get isCash() {
		return this.method === "CASH"
	}
	get isCard() {
		return ["CARD", "MADA", "VISA", "MASTERCARD"].includes(this.method)
	}
	get isDigital() {
		return ["STC_PAY", "APPLE_PAY", "GOOGLE_PAY", "WALLET"].includes(
			this.method,
		)
	}
	toJSON() {
		return {
			method: this.method,
			amount: this.amount,
			reference: this.reference,
			walletTransactionId: this.walletTransactionId,
		}
	}
}

class Shift {
	constructor({
		id,
		terminalId,
		openedBy,
		openingCash = 0,
		status = "OPEN",
		openedAt,
		closedAt,
		closingCash,
		expectedCash,
		variance,
	}) {
		this.id = String(id || "").trim()
		this.terminalId = String(terminalId || "").trim()
		this.openedBy = String(openedBy || "").trim()
		this.openingCash = Number(openingCash) || 0
		this.status = status
		this.openedAt = openedAt || new Date().toISOString()
		this.closedAt = closedAt || null
		this.closingCash = closingCash != null ? Number(closingCash) : null
		this.expectedCash = expectedCash != null ? Number(expectedCash) : null
		this.variance = variance != null ? Number(variance) : null
	}
	get isOpen() {
		return this.status === "OPEN"
	}
	get duration() {
		if (!this.openedAt) return 0
		const end = this.closedAt ? new Date(this.closedAt) : new Date()
		return Math.floor((end - new Date(this.openedAt)) / 1000)
	}
	toJSON() {
		return {
			id: this.id,
			terminalId: this.terminalId,
			openedBy: this.openedBy,
			openingCash: this.openingCash,
			status: this.status,
			openedAt: this.openedAt,
			closedAt: this.closedAt,
			closingCash: this.closingCash,
			expectedCash: this.expectedCash,
			variance: this.variance,
		}
	}
}

class StockItem {
	constructor({
		productId,
		warehouseId,
		qty,
		reservedQty = 0,
		allocatedQty = 0,
	}) {
		this.productId = String(productId || "").trim()
		this.warehouseId = String(warehouseId || "").trim()
		this.qty = Number(qty) || 0
		this.reservedQty = Number(reservedQty) || 0
		this.allocatedQty = Number(allocatedQty) || 0
	}
	get available() {
		return this.qty - this.reservedQty - this.allocatedQty
	}
	get hasStock() {
		return this.available > 0
	}
	toJSON() {
		return {
			productId: this.productId,
			warehouseId: this.warehouseId,
			qty: this.qty,
			reservedQty: this.reservedQty,
			allocatedQty: this.allocatedQty,
			available: this.available,
		}
	}
}

class Offer {
	constructor({
		id,
		name,
		type,
		value,
		minQty,
		maxQty,
		minAmount,
		maxAmount,
		appliesTo,
		itemGroups,
		validFrom,
		validTo,
		oneTimePerCustomer,
		isActive = true,
	}) {
		this.id = String(id || "").trim()
		this.name = String(name || "").trim()
		this.type = String(type || "PERCENT").toUpperCase()
		this.value = Number(value) || 0
		this.minQty = Number(minQty) || 0
		this.maxQty = Number(maxQty) || 0
		this.minAmount = Number(minAmount) || 0
		this.maxAmount = Number(maxAmount) || 0
		this.appliesTo = String(appliesTo || "ALL").toUpperCase()
		this.itemGroups = Array.isArray(itemGroups) ? itemGroups : []
		this.validFrom = validFrom || null
		this.validTo = validTo || null
		this.oneTimePerCustomer = oneTimePerCustomer || false
		this.isActive = isActive
	}
	get isValid() {
		const now = new Date()
		if (!this.isActive) return false
		if (this.validFrom && new Date(this.validFrom) > now) return false
		if (this.validTo && new Date(this.validTo) < now) return false
		return true
	}
	toJSON() {
		return {
			id: this.id,
			name: this.name,
			type: this.type,
			value: this.value,
			minQty: this.minQty,
			maxQty: this.maxQty,
			minAmount: this.minAmount,
			maxAmount: this.maxAmount,
			appliesTo: this.appliesTo,
			itemGroups: this.itemGroups,
			validFrom: this.validFrom,
			validTo: this.validTo,
			oneTimePerCustomer: this.oneTimePerCustomer,
			isActive: this.isActive,
		}
	}
}

class Coupon {
	constructor({
		id,
		code,
		discountType = "PCT",
		discount = 0,
		maxDiscount = 0,
		minPurchase = 0,
		maxUses = 0,
		usedCount = 0,
		validFrom,
		validTo,
		isActive = true,
	}) {
		this.id = String(id || "").trim()
		this.code = String(code || "")
			.toUpperCase()
			.trim()
		this.discountType = String(discountType || "PCT").toUpperCase()
		this.discount = Number(discount) || 0
		this.maxDiscount = Number(maxDiscount) || 0
		this.minPurchase = Number(minPurchase) || 0
		this.maxUses = Number(maxUses) || 0
		this.usedCount = Number(usedCount) || 0
		this.validFrom = validFrom || null
		this.validTo = validTo || null
		this.isActive = isActive
	}
	get isValid() {
		const now = new Date()
		if (!this.isActive) return false
		if (this.validFrom && new Date(this.validFrom) > now) return false
		if (this.validTo && new Date(this.validTo) < now) return false
		if (this.maxUses > 0 && this.usedCount >= this.maxUses) return false
		return true
	}
	calculateDiscount(subtotal) {
		const sub = Number(subtotal) || 0
		if (sub < this.minPurchase) return 0
		let amt
		if (this.discountType === "AMOUNT") amt = Math.min(this.discount, sub)
		else {
			amt = (sub * this.discount) / 100
			if (this.maxDiscount > 0) amt = Math.min(amt, this.maxDiscount)
		}
		return Math.max(0, Math.round(amt * 100) / 100)
	}
	toJSON() {
		return {
			id: this.id,
			code: this.code,
			discountType: this.discountType,
			discount: this.discount,
			maxDiscount: this.maxDiscount,
			minPurchase: this.minPurchase,
			maxUses: this.maxUses,
			usedCount: this.usedCount,
			validFrom: this.validFrom,
			validTo: this.validTo,
			isActive: this.isActive,
		}
	}
}

module.exports = {
	Product,
	Customer,
	Invoice,
	InvoiceItem,
	Payment,
	Shift,
	StockItem,
	Offer,
	Coupon,
}
