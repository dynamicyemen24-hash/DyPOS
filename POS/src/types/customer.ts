/**
 * DyPOS — Customer Types
 */
import type { MoneyMinor } from "./money"

export interface Customer {
	readonly id?: string
	readonly name: string
	readonly customerName?: string
	readonly email?: string
	readonly mobileNo?: string
	readonly phone?: string
	readonly customerGroup?: string
	readonly creditLimit?: MoneyMinor
	readonly outstanding?: MoneyMinor
	readonly isBlocked: boolean
	readonly loyaltyPoint?: number
	readonly posProfile?: string
	readonly company?: string
	readonly branch?: string
	readonly customerType?: string
	readonly territory?: string
	readonly customerPrimaryContact?: string
	readonly defaultPriceList?: string
	readonly enabled?: number
	readonly posCustomer?: boolean
	readonly isValid?: boolean
	readonly allowed?: boolean
	readonly extraAttributes?: Record<string, unknown>
}

export interface CustomerSearchResult {
	readonly customer: Customer
	readonly matchedField: "name" | "email" | "mobile" | "phone"
	readonly fuzzyScore?: number
}
