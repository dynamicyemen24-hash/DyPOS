/**
 * DyPOS Repository Interfaces — Contracts for data access
 * Any backend (Frappe, REST, Supabase, Firebase) must implement these.
 */

/**
 * @interface IProductRepository
 */
class IProductRepository {
	/** @returns {Promise<import('../entities').Product[]>} */
	async findAll(filters = {}) {
		throw new Error("Not implemented")
	}
	/** @returns {Promise<import('../entities').Product|null>} */
	async findById(id) {
		throw new Error("Not implemented")
	}
	/** @returns {Promise<import('../entities').Product|null>} */
	async findByBarcode(barcode) {
		throw new Error("Not implemented")
	}
	/** @returns {Promise<import('../entities').Product[]>} */
	async search(query, limit = 50) {
		throw new Error("Not implemented")
	}
	/** @returns {Promise<{qty: number, warehouse: string}>} */
	async getStock(productId, warehouseId) {
		throw new Error("Not implemented")
	}
	/** @returns {Promise<Map<string, {qty: number, warehouse: string}>>} */
	async getStockBulk(productIds, warehouseId) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface ICustomerRepository
 */
class ICustomerRepository {
	async findAll(filters = {}) {
		throw new Error("Not implemented")
	}
	async findById(id) {
		throw new Error("Not implemented")
	}
	async create(customer) {
		throw new Error("Not implemented")
	}
	async update(id, data) {
		throw new Error("Not implemented")
	}
	async getBalance(id) {
		throw new Error("Not implemented")
	}
	async getLoyaltyPoints(id) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface IInvoiceRepository
 */
class IInvoiceRepository {
	async create(invoice) {
		throw new Error("Not implemented")
	}
	async findById(id) {
		throw new Error("Not implemented")
	}
	async findByNumber(number) {
		throw new Error("Not implemented")
	}
	async findAll(filters = {}) {
		throw new Error("Not implemented")
	}
	async updateStatus(id, status) {
		throw new Error("Not implemented")
	}
	async addPayment(invoiceId, payment) {
		throw new Error("Not implemented")
	}
	async getDailyReport(date, terminalId) {
		throw new Error("Not implemented")
	}
	async getZReport(shiftId) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface IShiftRepository
 */
class IShiftRepository {
	async findOpen(terminalId) {
		throw new Error("Not implemented")
	}
	async create(shift) {
		throw new Error("Not implemented")
	}
	async close(id, data) {
		throw new Error("Not implemented")
	}
	async getCashCount(id) {
		throw new Error("Not implemented")
	}
	async getReport(id) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface IStockRepository
 */
class IStockRepository {
	async getLevel(productId, warehouseId) {
		throw new Error("Not implemented")
	}
	async getBulk(productIds, warehouseId) {
		throw new Error("Not implemented")
	}
	async reserve(productId, warehouseId, qty) {
		throw new Error("Not implemented")
	}
	async release(productId, warehouseId, qty) {
		throw new Error("Not implemented")
	}
	async adjust(productId, warehouseId, qty, reason) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface IOffersRepository
 */
class IOffersRepository {
	async findActive(profile) {
		throw new Error("Not implemented")
	}
	async validateCoupon(code, subtotal) {
		throw new Error("Not implemented")
	}
	async getCustomerRedemptions(customerId, offerId) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface IAuthRepository
 */
class IAuthRepository {
	async login(username, password) {
		throw new Error("Not implemented")
	}
	async verify(token) {
		throw new Error("Not implemented")
	}
	async refreshToken(token) {
		throw new Error("Not implemented")
	}
}

/**
 * @interface ISyncRepository
 */
class ISyncRepository {
	async pull(tenantId, checkpoint, limit = 500) {
		throw new Error("Not implemented")
	}
	async push(tenantId, operations) {
		throw new Error("Not implemented")
	}
	async getCheckpoint(tenantId) {
		throw new Error("Not implemented")
	}
}

module.exports = {
	IProductRepository,
	ICustomerRepository,
	IInvoiceRepository,
	IShiftRepository,
	IStockRepository,
	IOffersRepository,
	IAuthRepository,
	ISyncRepository,
}
