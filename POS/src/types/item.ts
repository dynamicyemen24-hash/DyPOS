/**
 * Item / stock domain types.
 *
 * These were referenced by `src/types/invoice.ts` via `import("./item")` but the
 * module never existed, so both `InvoiceItem.stock` and `InvoiceItem.item` were
 * typed against a missing file. The shapes below mirror what the runtime
 * actually produces:
 *
 *   - `useItems.js`      -> { ...item, actual_qty, stock_qty, original_stock }
 *   - `stockManagementData.js` -> stock rows of { qty, reserved_qty }
 *     with `available = qty - reserved_qty`
 *
 * Fields are optional where the sources are inconsistent about them (Frappe
 * rows, locally-created cart lines and offline sync payloads all differ), so
 * consumers must narrow rather than assume.
 */

/** Stock position for one item in one warehouse. */
export interface StockInfo {
	/** Physical quantity on hand. */
	qty?: number
	/** Quantity held by open carts/shifts and therefore not sellable. */
	reserved_qty?: number
	/** Sellable quantity. The runtime computes this as qty - reserved_qty. */
	available_qty?: number
	warehouse?: string
	warehouse_id?: string
	/** Stock valuation rate, used by profitability/costing reports. */
	valuation_rate?: number
}

/** A sellable item / product. */
export interface Item {
	id?: string
	/** Item code, the stable business key used in carts and invoices. */
	item_code?: string
	item_name?: string
	name?: string
	description?: string

	/** Selling price. Money is always minor units — see src/types/money.ts. */
	unit_price?: number
	rate?: number
	/** Cost basis, used for margin reporting. */
	cost?: number

	stock_qty?: number
	/** Stock after subtracting what is already in the cart. */
	actual_qty?: number
	/** Stock before the cart adjustment, so the UI can show the delta. */
	original_stock?: number
	reorder_point?: number

	stock?: StockInfo
	uom?: string
	warehouse?: string
	/** False for service/non-stock items, which must not decrement stock. */
	is_stock_item?: boolean
}
