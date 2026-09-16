/**
 * DyPOS — Invoice & Sale Types
 */

export type InvoiceStatus =
	| "draft"
	| "saved"
	| "pending_payment"
	| "paid"
	| "return"
	| "synced"
	| "failed"

export interface POSInvoice {
	readonly id?: string
	readonly invoiceNo?: string
	readonly offlineId?: string
	readonly clientSequence?: string
	readonly status: InvoiceStatus
	readonly postingDate?: string
	readonly postingTime?: string
	readonly shift?: string
	readonly posProfile?: string
	readonly customer?: string | import("./customer").Customer
	readonly customerId?: string
	readonly items: InvoiceItem[]
	readonly pricing: import("./money").PriceBreakdown
	readonly payments: InvoicePayment[]
	readonly totalPaid: number
	readonly balanceDue: number
	readonly changeAmount?: number
	readonly comments?: string
	readonly isInternal: boolean
	readonly warehouse?: string
	readonly company?: string
	readonly tenantId?: string
	readonly netTotal?: number
	readonly grandTotal?: number
	readonly totalQty?: number
	readonly createdBy?: string
	readonly modifiedBy?: string
	readonly createdAt?: number
	readonly updatedAt?: number
	readonly syncedAt?: number
	readonly syncStatus?: "pending" | "syncing" | "synced" | "failed"
	readonly retryCount?: number
	readonly valid?: boolean
	readonly allowed?: boolean
}

export interface InvoiceItem {
	readonly itemCode: string
	readonly itemName: string
	readonly barcode?: string
	readonly qty: number
	readonly rate: number
	readonly amount: number
	readonly discount?: number
	readonly discountType?: "percent" | "fixed"
	readonly taxes?: import("./money").TaxLine[]
	readonly stock?: import("./item").StockInfo
	readonly batchNo?: string
	readonly serialNo?: string
	readonly warehouse?: string
	readonly description?: string
	readonly uom?: string
	readonly originalRate?: number
	readonly originalAmount?: number
	readonly isFreeItem?: boolean
	readonly offeredBy?: string
	readonly offerName?: string
	readonly item?: import("./item").Item | string
}

export interface InvoicePayment {
	readonly modeOfPayment: string
	readonly amount: number
	readonly type: "cash" | "card" | "wallet" | "coupon" | "credit" | "other"
	readonly referenceNo?: string
	readonly cardNumber?: string
	readonly transactionId?: string
	readonly posProfile?: string
	readonly paymentAmount?: number
	readonly paidAmount?: number
	readonly changeAmount?: number
	readonly remark?: string
	readonly createDateTime?: string
	readonly paidDate?: string
}

export interface CreateInvoicePayload {
	readonly customer?: string | import("./customer").Customer
	readonly customerId?: string
	readonly items: Omit<InvoiceItem, "itemName">[]
	readonly warehouse?: string
	readonly company?: string
	readonly comments?: string
	readonly isInternal?: boolean
	readonly isReturn?: boolean
	readonly hidePayment?: boolean
	readonly salesPerson?: string
	readonly valid?: boolean
}

export interface SubmitInvoiceOptions {
	readonly hidePayment?: boolean
	readonly debug?: boolean
	readonly syncOffline?: boolean
	readonly total?: number
	readonly returnInvoiceNo?: string
	readonly returnAmount?: number
	readonly returnQty?: number
}

export interface SubmitInvoiceResult {
	readonly success: boolean
	readonly invoice?: POSInvoice
	readonly error?: string
	readonly errorCode?: string
	readonly retryable?: boolean
	readonly invoiceId?: string
	readonly offlineId?: string
	readonly message?: string
	readonly referenceNo?: string
}

export interface GetUnpaidSummaryResult {
	readonly title?: string
	readonly customer_name?: string
	readonly total_amount?: number
	readonly outstanding_amount?: number
	readonly paid_amount?: number
	readonly due_date?: string
	readonly customer_name_ref?: import("./customer").Customer
	readonly owner?: string
}
