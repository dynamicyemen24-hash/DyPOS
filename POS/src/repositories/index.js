/**
 * DyPOS Repositories — public barrel.
 *
 * UI and services import from here, never from Dexie directly:
 *   import { userRepository, saleRepository } from "@/repositories"
 */
export { createRepository, getDb, runTransaction } from "./base.js"
export {
	userRepository,
	normalizeEmail,
	hashPassword,
	findByEmail,
} from "./userRepository.js"
export {
	saleRepository,
	SALE_STATUS,
	createSale,
	getSale,
	addPayment,
	voidSale,
} from "./saleRepository.js"
export {
	inventoryRepository,
	ACTIVE_RESERVATION,
	availableQty,
	checkAvailability,
} from "./inventoryRepository.js"
export {
	productRepository,
	findByBarcode,
	listByCategory,
	lowStock,
} from "./productRepository.js"
export {
	customerRepository,
	normalizePhone,
	findByPhone,
} from "./customerRepository.js"
