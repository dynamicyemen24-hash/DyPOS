/**
 * =============================================================================
 * DyPOS — Domain Type Contracts
 * =============================================================================
 *
 * TypeScript definitions for the core POS domain model.
 * Maintain strict nullability and use minor units for money.
 */

/** -------------------------------------------------------------------------- */
/** Money / Pricing                                                         */
/** -------------------------------------------------------------------------- */

/** Monetary amount in the currency's minor unit (halalas/cents/piastres). */
export type MoneyMinor = number;

export interface MoneyAmount {
  readonly minor: MoneyMinor;
  readonly currency: CurrencyCode;
}

export type CurrencyCode = "SAR" | "USD" | "AED" | "EUR" | "EGP" | string;

export interface TaxLine {
  readonly rate: number;
  readonly taxableAmount: MoneyMinor;
  readonly taxAmount: MoneyMinor;
  readonly name?: string;
  readonly code?: string;
}

export interface PriceBreakdown {
  readonly net: MoneyMinor;
  readonly taxes: TaxLine[];
  readonly total: MoneyMinor;
  readonly discount?: MoneyMinor;
  readonly discountReason?: string;
}
