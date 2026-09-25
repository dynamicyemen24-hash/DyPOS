/**
 * DyPOS Advanced UoM, Currency & Pricing Policy Engine
 *
 * Enterprise-grade utilities for:
 * - Multi-UoM conversions with precision handling
 * - Multi-currency with exchange rate management
 * - Pricing policies (wholesale, retail, trade, special, contract)
 * - Inventory valuation methods (FIFO, LIFO, Weighted Average, Standard)
 * - Tax calculation with jurisdiction support
 * - Rounding rules per currency/UoM
 * - Conversion precision handling
 *
 * Designed by: Legal Accountants, Warehouse Keepers, Sales Managers
 * Standards: IFRS, GAAP, ZATCA, SASO, ISO 4217, ISO 80000
 */

// ==========================================
// CORE TYPES & INTERFACES
// ==========================================

/**
 * @typedef {Object} UoMDefinition
 * @property {string} code - Unique code (PCS, BOX, CTN, KG, etc.)
 * @property {string} name - English name
 * @property {string} nameAr - Arabic name
 * @property {number} factor - Conversion factor to base unit
 * @property {boolean} isBase - Whether this is the base unit for its type
 * @property {string} type - Dimension type (count, weight, volume, length, area, time)
 * @property {number} precision - Decimal places for display/rounding
 * @property {string} category - Business category (sales, purchase, inventory, production)
 * @property {Object.<string, number>} conversions - Direct conversion factors to other UoMs
 */

/**
 * @typedef {Object} CurrencyDefinition
 * @property {string} code - ISO 4217 code (SAR, USD, EUR)
 * @property {string} symbol - Currency symbol (ر.س, $, €)
 * @property {string} name - English name
 * @property {string} nameAr - Arabic name
 * @property {number} rate - Exchange rate to base currency
 * @property {boolean} isBase - Base currency flag
 * @property {number} precision - Decimal places
 * @property {string} roundingMode - 'half_up' | 'half_down' | 'half_even' | 'up' | 'down'
 * @property {string} isoCode - ISO 4217 numeric code
 * @property {string} country - Primary country code
 */

/**
 * @typedef {Object} PricingPolicy
 * @property {string} code - Policy code (RETAIL, WHOLESALE, TRADE, CONTRACT, SPECIAL)
 * @property {string} name - Policy name
 * @property {string} nameAr - Arabic name
 * @property {string} type - 'fixed' | 'percentage' | 'tiered' | 'formula' | 'contract'
 * @property {number} minQty - Minimum quantity for policy
 * @property {number} maxQty - Maximum quantity
 * @property {Object} rules - Pricing rules
 * @property {string} currency - Policy currency
 * @property {boolean} includesTax - Whether price includes tax
 * @property {string} taxCategory - Tax category code
 * @property {number} priority - Policy priority (higher = more specific)
 * @property {Object} conditions - Applicability conditions
 * @property {Date} validFrom - Effective from date
 * @property {Date} validTo - Expiry date
 */

/**
 * @typedef {Object} InventoryValuationConfig
 * @property {string} method - 'FIFO' | 'LIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD' | 'SPECIFIC_ID'
 * @property {string} currency - Valuation currency
 * @property {number} precision - Decimal precision
 * @property {boolean} includeOverhead - Include overhead costs
 * @property {string} roundingMode - Rounding mode for valuations
 */

/**
 * @typedef {Object} TaxRule
 * @property {string} code - Tax code (VAT, ZAKAT, EXCISE)
 * @property {number} rate - Tax rate (0.15 for 15%)
 * @property {string} jurisdiction - Jurisdiction code (SA, AE, etc.)
 * @property {boolean} isInclusive - Whether price includes tax
 * @property {number} threshold - Minimum amount for tax applicability
 * @property {string[]} exemptCategories - Exempt product categories
 * @property {string} roundingMode - Tax rounding mode
 */

/**
 * @typedef {Object} RoundingRule
 * @property {string} currency - Currency code
 * @property {string} uom - UoM code
 * @property {number} precision - Decimal places
 * @property {string} mode - 'half_up' | 'half_down' | 'half_even' | 'up' | 'down' | 'bankers'
 * @property {number} minIncrement - Minimum increment (e.g., 0.05 for 5 halala)
 */

// ==========================================
// DEFAULT CONFIGURATIONS
// ==========================================

/**
 * Comprehensive UoM Definitions
 * Covers: count, weight, volume, length, area, time, energy, pressure
 */
export const UOM_DEFINITIONS = {
	// Count units
	PCS: {
		code: "PCS",
		name: "Piece",
		nameAr: "قطعة",
		factor: 1,
		isBase: true,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { BOX: 1 / 12, CTN: 1 / 24, PK: 1 / 6 },
	},
	PAIR: {
		code: "PAIR",
		name: "Pair",
		nameAr: "زوج",
		factor: 2,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 2 },
	},
	DZN: {
		code: "DZN",
		name: "Dozen",
		nameAr: "دزينة",
		factor: 12,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 12, BOX: 1 },
	},
	GR: {
		code: "GR",
		name: "Gross",
		nameAr: "جراس",
		factor: 144,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 144, DZN: 12 },
	},
	PK: {
		code: "PK",
		name: "Pack",
		nameAr: "حزمة",
		factor: 6,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 6, BOX: 0.5 },
	},
	BOX: {
		code: "BOX",
		name: "Box",
		nameAr: "صندوق",
		factor: 12,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 12, CTN: 0.5, PK: 2, DZN: 1 },
	},
	CTN: {
		code: "CTN",
		name: "Carton",
		nameAr: "كرتون",
		factor: 24,
		isBase: false,
		type: "count",
		precision: 0,
		category: "inventory",
		conversions: { PCS: 24, BOX: 2, PK: 4, DZN: 2 },
	},
	PLT: {
		code: "PLT",
		name: "Pallet",
		nameAr: "بالت",
		factor: 576,
		isBase: false,
		type: "count",
		precision: 0,
		category: "logistics",
		conversions: { CTN: 24, BOX: 48, PCS: 576 },
	},
	ROLL: {
		code: "ROLL",
		name: "Roll",
		nameAr: "رول",
		factor: 1,
		isBase: true,
		type: "count",
		precision: 2,
		category: "inventory",
	},
	SET: {
		code: "SET",
		name: "Set",
		nameAr: "مجموعة",
		factor: 1,
		isBase: true,
		type: "count",
		precision: 0,
		category: "inventory",
	},
	KIT: {
		code: "KIT",
		name: "Kit",
		nameAr: "طقم",
		factor: 1,
		isBase: true,
		type: "count",
		precision: 0,
		category: "inventory",
	},

	// Weight units
	KG: {
		code: "KG",
		name: "Kilogram",
		nameAr: "كجم",
		factor: 1,
		isBase: true,
		type: "weight",
		precision: 3,
		category: "inventory",
		conversions: { G: 1000, TON: 0.001, LB: 2.20462, OZ: 35.274 },
	},
	G: {
		code: "G",
		name: "Gram",
		nameAr: "جم",
		factor: 0.001,
		isBase: false,
		type: "weight",
		precision: 2,
		category: "inventory",
		conversions: { KG: 0.001, MG: 1000 },
	},
	MG: {
		code: "MG",
		name: "Milligram",
		nameAr: "مجم",
		factor: 0.000001,
		isBase: false,
		type: "weight",
		precision: 4,
		category: "pharma",
		conversions: { G: 0.001 },
	},
	TON: {
		code: "TON",
		name: "Metric Ton",
		nameAr: "طن",
		factor: 1000,
		isBase: false,
		type: "weight",
		precision: 3,
		category: "bulk",
		conversions: { KG: 1000, LB: 2204.62 },
	},
	LB: {
		code: "LB",
		name: "Pound",
		nameAr: "رطل",
		factor: 0.453592,
		isBase: false,
		type: "weight",
		precision: 3,
		category: "inventory",
		conversions: { KG: 0.453592, OZ: 16 },
	},
	OZ: {
		code: "OZ",
		name: "Ounce",
		nameAr: "أونصة",
		factor: 0.0283495,
		isBase: false,
		type: "weight",
		precision: 3,
		category: "inventory",
		conversions: { LB: 0.0625, G: 28.3495 },
	},

	// Volume units
	L: {
		code: "L",
		name: "Liter",
		nameAr: "لتر",
		factor: 1,
		isBase: true,
		type: "volume",
		precision: 3,
		category: "inventory",
		conversions: { ML: 1000, M3: 0.001, GAL: 0.264172, QT: 1.05669 },
	},
	ML: {
		code: "ML",
		name: "Milliliter",
		nameAr: "مل",
		factor: 0.001,
		isBase: false,
		type: "volume",
		precision: 2,
		category: "inventory",
		conversions: { L: 0.001, CC: 1 },
	},
	M3: {
		code: "M3",
		name: "Cubic Meter",
		nameAr: "م³",
		factor: 1000,
		isBase: false,
		type: "volume",
		precision: 3,
		category: "bulk",
		conversions: { L: 1000, FT3: 35.3147 },
	},
	GAL: {
		code: "GAL",
		name: "Gallon",
		nameAr: "جالون",
		factor: 3.78541,
		isBase: false,
		type: "volume",
		precision: 3,
		category: "inventory",
		conversions: { L: 3.78541, QT: 4 },
	},
	QT: {
		code: "QT",
		name: "Quart",
		nameAr: "كوارت",
		factor: 0.946353,
		isBase: false,
		type: "volume",
		precision: 3,
		category: "inventory",
		conversions: { L: 0.946353, PT: 2 },
	},
	PT: {
		code: "PT",
		name: "Pint",
		nameAr: "باينت",
		factor: 0.473176,
		isBase: false,
		type: "volume",
		precision: 3,
		category: "inventory",
		conversions: { QT: 0.5, CUPS: 2 },
	},
	BBL: {
		code: "BBL",
		name: "Barrel",
		nameAr: "برميل",
		factor: 158.987,
		isBase: false,
		type: "volume",
		precision: 3,
		category: "oil",
		conversions: { L: 158.987, GAL: 42 },
	},

	// Length units
	M: {
		code: "M",
		name: "Meter",
		nameAr: "متر",
		factor: 1,
		isBase: true,
		type: "length",
		precision: 2,
		category: "inventory",
		conversions: {
			CM: 100,
			MM: 1000,
			KM: 0.001,
			FT: 3.28084,
			IN: 39.3701,
			YD: 1.09361,
		},
	},
	CM: {
		code: "CM",
		name: "Centimeter",
		nameAr: "سم",
		factor: 0.01,
		isBase: false,
		type: "length",
		precision: 1,
		category: "inventory",
		conversions: { M: 0.01, MM: 10, IN: 0.393701 },
	},
	MM: {
		code: "MM",
		name: "Millimeter",
		nameAr: "مم",
		factor: 0.001,
		isBase: false,
		type: "length",
		precision: 1,
		category: "inventory",
		conversions: { CM: 0.1, M: 0.001, IN: 0.0393701 },
	},
	KM: {
		code: "KM",
		name: "Kilometer",
		nameAr: "كم",
		factor: 1000,
		isBase: false,
		type: "length",
		precision: 3,
		category: "logistics",
		conversions: { M: 1000, MI: 0.621371 },
	},
	FT: {
		code: "FT",
		name: "Foot",
		nameAr: "قدم",
		factor: 0.3048,
		isBase: false,
		type: "length",
		precision: 2,
		category: "construction",
		conversions: { M: 0.3048, IN: 12, YD: 0.333333 },
	},
	IN: {
		code: "IN",
		name: "Inch",
		nameAr: "بوصة",
		factor: 0.0254,
		isBase: false,
		type: "length",
		precision: 2,
		category: "inventory",
		conversions: { CM: 2.54, MM: 25.4, FT: 0.0833333 },
	},
	YD: {
		code: "YD",
		name: "Yard",
		nameAr: "ياردة",
		factor: 0.9144,
		isBase: false,
		type: "length",
		precision: 2,
		category: "textile",
		conversions: { M: 0.9144, FT: 3, IN: 36 },
	},

	// Area units
	M2: {
		code: "M2",
		name: "Square Meter",
		nameAr: "م²",
		factor: 1,
		isBase: true,
		type: "area",
		precision: 2,
		category: "real_estate",
		conversions: { CM2: 10000, HA: 0.0001, ACRE: 0.000247105, FT2: 10.7639 },
	},
	CM2: {
		code: "CM2",
		name: "Square Centimeter",
		nameAr: "سم²",
		factor: 0.0001,
		isBase: false,
		type: "area",
		precision: 2,
		category: "inventory",
	},
	HA: {
		code: "HA",
		name: "Hectare",
		nameAr: "هكتار",
		factor: 10000,
		isBase: false,
		type: "area",
		precision: 4,
		category: "agriculture",
		conversions: { M2: 10000, ACRE: 2.47105 },
	},
	ACRE: {
		code: "ACRE",
		name: "Acre",
		nameAr: "فدان",
		factor: 4046.86,
		isBase: false,
		type: "area",
		precision: 4,
		category: "agriculture",
		conversions: { M2: 4046.86, HA: 0.404686 },
	},

	// Time units
	SEC: {
		code: "SEC",
		name: "Second",
		nameAr: "ثانية",
		factor: 1,
		isBase: true,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { MIN: 1 / 60, HR: 1 / 3600, DAY: 1 / 86400 },
	},
	MIN: {
		code: "MIN",
		name: "Minute",
		nameAr: "دقيقة",
		factor: 60,
		isBase: false,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { SEC: 60, HR: 1 / 60, DAY: 1 / 1440 },
	},
	HR: {
		code: "HR",
		name: "Hour",
		nameAr: "ساعة",
		factor: 3600,
		isBase: false,
		type: "time",
		precision: 2,
		category: "time",
		conversions: { MIN: 60, SEC: 3600, DAY: 1 / 24 },
	},
	DAY: {
		code: "DAY",
		name: "Day",
		nameAr: "يوم",
		factor: 86400,
		isBase: false,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { HR: 24, WK: 1 / 7, MON: 1 / 30.44 },
	},
	WK: {
		code: "WK",
		name: "Week",
		nameAr: "أسبوع",
		factor: 604800,
		isBase: false,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { DAY: 7, MON: 0.230137 },
	},
	MON: {
		code: "MON",
		name: "Month",
		nameAr: "شهر",
		factor: 2629746,
		isBase: false,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { DAY: 30.44, YR: 1 / 12 },
	},
	YR: {
		code: "YR",
		name: "Year",
		nameAr: "سنة",
		factor: 31556952,
		isBase: false,
		type: "time",
		precision: 0,
		category: "time",
		conversions: { MON: 12, DAY: 365.25 },
	},
}

/**
 * Currency Definitions with full ISO 4217 compliance
 */
export const CURRENCY_DEFINITIONS = {
	SAR: {
		code: "SAR",
		symbol: "ر.س",
		name: "Saudi Riyal",
		nameAr: "ريال سعودي",
		rate: 1,
		isBase: true,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "682",
		country: "SA",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	USD: {
		code: "USD",
		symbol: "$",
		name: "US Dollar",
		nameAr: "دولار أمريكي",
		rate: 3.75,
		isBase: false,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "840",
		country: "US",
		symbolPosition: "left",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	EUR: {
		code: "EUR",
		symbol: "€",
		name: "Euro",
		nameAr: "يورو",
		rate: 4.05,
		isBase: false,
		precision: 2,
		roundingMode: "half_even",
		isoCode: "978",
		country: "EU",
		symbolPosition: "left",
		decimalSeparator: ",",
		thousandsSeparator: ".",
	},
	AED: {
		code: "AED",
		symbol: "د.إ",
		name: "UAE Dirham",
		nameAr: "درهم إماراتي",
		rate: 1.02,
		isBase: false,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "784",
		country: "AE",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	KWD: {
		code: "KWD",
		symbol: "د.ك",
		name: "Kuwaiti Dinar",
		nameAr: "دينار كويتي",
		rate: 12.25,
		isBase: false,
		precision: 3,
		roundingMode: "half_up",
		isoCode: "414",
		country: "KW",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	BHD: {
		code: "BHD",
		symbol: "د.ب",
		name: "Bahraini Dinar",
		nameAr: "دينار بحريني",
		rate: 9.95,
		isBase: false,
		precision: 3,
		roundingMode: "half_up",
		isoCode: "048",
		country: "BH",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	QAR: {
		code: "QAR",
		symbol: "ر.ق",
		name: "Qatari Riyal",
		nameAr: "ريال قطري",
		rate: 1.03,
		isBase: false,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "634",
		country: "QA",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	OMR: {
		code: "OMR",
		symbol: "ر.ع",
		name: "Omani Rial",
		nameAr: "ريال عماني",
		rate: 9.75,
		isBase: false,
		precision: 3,
		roundingMode: "half_up",
		isoCode: "512",
		country: "OM",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	JOD: {
		code: "JOD",
		symbol: "د.أ",
		name: "Jordanian Dinar",
		nameAr: "دينار أردني",
		rate: 5.3,
		isBase: false,
		precision: 3,
		roundingMode: "half_up",
		isoCode: "400",
		country: "JO",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	EGP: {
		code: "EGP",
		symbol: "ج.م",
		name: "Egyptian Pound",
		nameAr: "جنيه مصري",
		rate: 0.076,
		isBase: false,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "818",
		country: "EG",
		symbolPosition: "right",
		decimalSeparator: ".",
		thousandsSeparator: ",",
	},
	TRY: {
		code: "TRY",
		symbol: "₺",
		name: "Turkish Lira",
		nameAr: "ليرة تركية",
		rate: 0.115,
		isBase: false,
		precision: 2,
		roundingMode: "half_up",
		isoCode: "949",
		country: "TR",
		symbolPosition: "left",
		decimalSeparator: ",",
		thousandsSeparator: ".",
	},
}

/**
 * Pricing Policies - Designed by Sales Managers & Accountants
 */
export const PRICING_POLICIES = {
	RETAIL: {
		code: "RETAIL",
		name: "Retail Price",
		nameAr: "سعر التجزئة",
		type: "fixed",
		minQty: 1,
		maxQty: 999999,
		rules: { markupPercent: 30, roundTo: 0.05 },
		currency: "SAR",
		includesTax: true,
		taxCategory: "STANDARD",
		priority: 10,
		conditions: { customerType: "walk_in", channel: "pos" },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
	WHOLESALE: {
		code: "WHOLESALE",
		name: "Wholesale Price",
		nameAr: "سعر الجملة",
		type: "tiered",
		minQty: 10,
		maxQty: 999999,
		rules: {
			tiers: [
				{ minQty: 10, maxQty: 99, discountPercent: 5 },
				{ minQty: 100, maxQty: 499, discountPercent: 10 },
				{ minQty: 500, maxQty: 999, discountPercent: 15 },
				{ minQty: 1000, maxQty: 999999, discountPercent: 20 },
			],
			roundTo: 0.25,
		},
		currency: "SAR",
		includesTax: true,
		taxCategory: "STANDARD",
		priority: 20,
		conditions: { customerType: "wholesale", channel: "b2b" },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
	TRADE: {
		code: "TRADE",
		name: "Trade Price",
		nameAr: "سعر التجارة",
		type: "percentage",
		minQty: 50,
		maxQty: 999999,
		rules: { discountPercent: 25, roundTo: 0.5 },
		currency: "SAR",
		includesTax: false,
		taxCategory: "STANDARD",
		priority: 30,
		conditions: { customerType: "distributor", channel: "b2b" },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
	CONTRACT: {
		code: "CONTRACT",
		name: "Contract Price",
		nameAr: "سعر العقد",
		type: "contract",
		minQty: 1,
		maxQty: 999999,
		rules: { contractId: "required", priceList: "attached" },
		currency: "SAR",
		includesTax: true,
		taxCategory: "STANDARD",
		priority: 50,
		conditions: { customerType: "contract", hasContract: true },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
	SPECIAL: {
		code: "SPECIAL",
		name: "Special/Promotional Price",
		nameAr: "سعر خاص/ترويجي",
		type: "formula",
		minQty: 1,
		maxQty: 999999,
		rules: { formula: "basePrice * (1 - promoDiscount/100)", roundTo: 0.05 },
		currency: "SAR",
		includesTax: true,
		taxCategory: "PROMO",
		priority: 60,
		conditions: { hasPromotion: true },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
	COST_PLUS: {
		code: "COST_PLUS",
		name: "Cost Plus Margin",
		nameAr: "التكلفة زائد هامش",
		type: "formula",
		minQty: 1,
		maxQty: 999999,
		rules: { formula: "unitCost * (1 + marginPercent/100)", roundTo: 0.05 },
		currency: "SAR",
		includesTax: false,
		taxCategory: "STANDARD",
		priority: 5,
		conditions: { internal: true, costBased: true },
		validFrom: new Date("2024-01-01"),
		validTo: null,
	},
}

/**
 * Inventory Valuation Methods Configuration
 */
export const VALUATION_METHODS = {
	FIFO: {
		code: "FIFO",
		name: "First In First Out",
		nameAr: "الأول في أولاً خارج",
		description: "First items purchased are first sold",
		descriptionAr: "أول العناصر المشتراة هي أول ما يباع",
		suitableFor: ["perishable", "fashion", "technology"],
		gaapCompliant: true,
		ifrsCompliant: true,
		zakatCompliant: true,
	},
	LIFO: {
		code: "LIFO",
		name: "Last In First Out",
		nameAr: "آخر في أولاً خارج",
		description: "Last items purchased are first sold",
		descriptionAr: "آخر العناصر المشتراة هي أول ما يباع",
		suitableFor: ["non-perishable", "commodities"],
		gaapCompliant: false,
		ifrsCompliant: false,
		zakatCompliant: false,
	},
	WEIGHTED_AVERAGE: {
		code: "WEIGHTED_AVERAGE",
		name: "Weighted Average Cost",
		nameAr: "المتوسط المرجح للتكلفة",
		description: "Average cost of all units available",
		descriptionAr: "متوسط تكلفة جميع الوحدات المتاحة",
		suitableFor: ["commodities", "chemicals", "raw_materials"],
		gaapCompliant: true,
		ifrsCompliant: true,
		zakatCompliant: true,
	},
	STANDARD: {
		code: "STANDARD",
		name: "Standard Cost",
		nameAr: "التكلفة المعيارية",
		description: "Predetermined cost standards",
		descriptionAr: "معايير تكلفة محددة مسبقاً",
		suitableFor: ["manufacturing", "repetitive"],
		gaapCompliant: true,
		ifrsCompliant: true,
		zakatCompliant: true,
	},
	SPECIFIC_ID: {
		code: "SPECIFIC_ID",
		name: "Specific Identification",
		nameAr: "التحديد المحدد",
		description: "Track actual cost of each specific item",
		descriptionAr: "تتبع التكلفة الفعلية لكل عنصر محدد",
		suitableFor: ["high_value", "unique", "serialized"],
		gaapCompliant: true,
		ifrsCompliant: true,
		zakatCompliant: true,
	},
}

/**
 * Tax Rules for GCC Countries
 */
export const TAX_RULES = {
	SA_VAT: {
		code: "SA_VAT",
		name: "Saudi VAT",
		nameAr: "ضريبة القيمة المضافة السعودية",
		rate: 0.15,
		jurisdiction: "SA",
		isInclusive: true,
		threshold: 375000,
		exemptCategories: [
			"EDUCATION",
			"HEALTHCARE",
			"FINANCIAL_SERVICES",
			"REAL_ESTATE_RESIDENTIAL",
		],
		exemptItems: [
			"BASIC_FOOD",
			"MEDICINES",
			"MEDICAL_EQUIPMENT",
			"EDUCATION_SERVICES",
		],
		roundingMode: "half_up",
		filingFrequency: "quarterly",
		registrationThreshold: 375000,
	},
	AE_VAT: {
		code: "AE_VAT",
		name: "UAE VAT",
		nameAr: "ضريبة القيمة المضافة الإماراتية",
		rate: 0.05,
		jurisdiction: "AE",
		isInclusive: true,
		threshold: 375000,
		exemptCategories: ["EDUCATION", "HEALTHCARE", "REAL_ESTATE_RESIDENTIAL"],
		roundingMode: "half_up",
	},
	ZAKAT: {
		code: "ZAKAT",
		name: "Zakat",
		nameAr: "الزكاة",
		rate: 0.025,
		jurisdiction: "SA",
		isInclusive: false,
		threshold: 0,
		exemptCategories: [],
		applicableOn: ["gold", "silver", "cash", "inventory", "receivables"],
		nisab: 2142, // SAR equivalent of 85g gold
		roundingMode: "half_up",
	},
	EXCISE: {
		code: "EXCISE",
		name: "Excise Tax",
		nameAr: "الضريبة الانتقائية",
		rates: {
			TOBACCO: 1.0,
			ENERGY_DRINKS: 1.0,
			CARBONATED_DRINKS: 0.5,
			SWEETENED_DRINKS: 0.5,
		},
		jurisdiction: "SA",
		isInclusive: true,
		roundingMode: "half_up",
	},
}

/**
 * Rounding Rules per Currency/UoM
 */
export const ROUNDING_RULES = {
	SAR: { precision: 2, mode: "half_up", minIncrement: 0.05 }, // 5 halala
	USD: { precision: 2, mode: "half_up", minIncrement: 0.01 },
	EUR: { precision: 2, mode: "half_even", minIncrement: 0.01 },
	KWD: { precision: 3, mode: "half_up", minIncrement: 0.001 },
	BHD: { precision: 3, mode: "half_up", minIncrement: 0.001 },
	QAR: { precision: 2, mode: "half_up", minIncrement: 0.01 },
	OMR: { precision: 3, mode: "half_up", minIncrement: 0.001 },

	// UoM specific rounding
	PCS: { precision: 0, mode: "half_up" },
	KG: { precision: 3, mode: "half_up" },
	G: { precision: 2, mode: "half_up" },
	L: { precision: 3, mode: "half_up" },
	M: { precision: 2, mode: "half_up" },
	M2: { precision: 2, mode: "half_up" },
}

/**
 * Inventory Policies
 */
export const INVENTORY_POLICIES = {
	VALUATION: {
		defaultMethod: "WEIGHTED_AVERAGE",
		allowPerProduct: true,
		revaluationFrequency: "monthly",
		writeDownPolicy: "lower_of_cost_or_market",
		writeDownApproval: "manager",
	},
	REORDER: {
		defaultMethod: "ROP_EOQ",
		safetyStockDays: 7,
		leadTimeBufferDays: 2,
		autoReorder: false,
		maxOrderCycles: 12,
	},
	RESERVATION: {
		allowOverReservation: false,
		autoReleaseHours: 24,
		priorityRules: ["sales_order", "production_order", "transfer_order"],
		releaseOnCancel: true,
	},
	TRANSFER: {
		requireApproval: true,
		approvalThreshold: 10000,
		inTransitTracking: true,
		autoReceive: false,
		damageAllowance: 0.02,
	},
	CYCLE_COUNT: {
		frequency: "monthly",
		abcClassification: { A: "weekly", B: "monthly", C: "quarterly" },
		tolerancePercent: 1,
		recountThreshold: 0.5,
	},
}

/**
 * Sales Policies
 */
export const SALES_POLICIES = {
	PRICING: {
		defaultPolicy: "RETAIL",
		allowManualOverride: true,
		overrideApprovalLimit: 10, // percent
		requireReason: true,
		pricePrecision: 2,
		allowZeroPrice: false,
		negativePriceAllowed: false,
	},
	DISCOUNT: {
		maxDiscountPercent: 50,
		requireApprovalAbove: 20,
		stackable: false,
		allowPromoStacking: false,
		loyaltyRedemption: true,
	},
	PAYMENT: {
		acceptedMethods: [
			"CASH",
			"CARD",
			"WALLET",
			"BANK_TRANSFER",
			"CHEQUE",
			"CREDIT",
		],
		defaultTerms: "IMMEDIATE",
		creditLimitCheck: true,
		overdueInterestRate: 0.02, // 2% monthly
		gracePeriodDays: 7,
	},
	RETURNS: {
		allowReturns: true,
		returnWindowDays: 14,
		requireReceipt: true,
		conditionCheck: true,
		restockingFee: 0,
		refundMethod: "ORIGINAL_PAYMENT",
		damagedGoodsPolicy: "FULL_REFUND",
	},
}

/**
 * Purchase Policies
 */
export const PURCHASE_POLICIES = {
	ORDERING: {
		minOrderValue: 100,
		requireApprovalAbove: 5000,
		approvalLevels: [
			{ limit: 5000, approver: "supervisor" },
			{ limit: 25000, approver: "manager" },
			{ limit: 100000, approver: "director" },
			{ limit: Number.POSITIVE_INFINITY, approver: "cfo" },
		],
		preferredVendorMargin: 5,
		autoPO: false,
	},
	RECEIVING: {
		allowOverReceive: true,
		overReceiveTolerance: 0.05,
		allowUnderReceive: true,
		underReceiveTolerance: 0.1,
		qualityCheckRequired: true,
		autoCreateReturn: false,
	},
	PAYMENT: {
		defaultTerms: "NET_30",
		earlyPaymentDiscount: { days: 10, percent: 2 },
		latePaymentPenalty: 0.01, // 1% per month
		holdbackPercent: 0,
		retentionDays: 0,
	},
}

/**
 * ZATCA Compliance Configuration
 */
export const ZATCA_CONFIG = {
	invoiceTypes: {
		STANDARD: {
			code: "388",
			name: "Standard Tax Invoice",
			nameAr: "فاتورة ضريبية قياسية",
		},
		SIMPLIFIED: {
			code: "389",
			name: "Simplified Tax Invoice",
			nameAr: "فاتورة ضريبية مبسطة",
		},
		DEBIT_NOTE: { code: "381", name: "Debit Note", nameAr: "إشعار مدين" },
		CREDIT_NOTE: { code: "382", name: "Credit Note", nameAr: "إشعار دائن" },
	},
	requiredFields: [
		"sellerName",
		"sellerVAT",
		"sellerAddress",
		"buyerName",
		"buyerVAT",
		"buyerAddress",
		"invoiceDate",
		"invoiceNumber",
		"lineItems",
		"vatBreakdown",
		"totalExclVAT",
		"vatAmount",
		"totalInclVAT",
		"currency",
		"exchangeRate",
	],
	qrCode: {
		required: true,
		fields: [
			"sellerName",
			"vatNumber",
			"timestamp",
			"totalWithVat",
			"vatAmount",
		],
	},
	digitalSignature: {
		required: true,
		algorithm: "RSA2048",
		certificateAuthority: "ZATCA",
	},
	archival: {
		retentionYears: 6,
		language: "ar",
		format: "XML/PDF-A1b",
	},
}

/**
 * Export all configurations
 */
export const CONFIG = {
	UOM_DEFINITIONS,
	CURRENCY_DEFINITIONS,
	PRICING_POLICIES,
	VALUATION_METHODS,
	TAX_RULES,
	ROUNDING_RULES,
	INVENTORY_POLICIES,
	SALES_POLICIES,
	PURCHASE_POLICIES,
	ZATCA_CONFIG,
	DEFAULT_UOMS: Object.keys(UOM_DEFINITIONS).filter(
		(k) => UOM_DEFINITIONS[k].isBase,
	),
	DEFAULT_CURRENCIES: Object.keys(CURRENCY_DEFINITIONS).filter(
		(k) => CURRENCY_DEFINITIONS[k].isBase,
	),
}

/**
 * Download blob as file
 * @param {string|Blob} content - Content to download
 * @param {string} type - MIME type
 * @param {string} filename - Filename
 */
export function downloadBlob(content, type, filename) {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

/**
 * Format amount as currency
 * @param {number} amount - Amount
 * @param {string} currencyCode - Currency code
 * @param {Array} currencies - Array of currency definitions
 * @returns {string} Formatted currency string
 */
export function formatMoney(amount, currencyCode, currencies) {
	const currency =
		currencies.find((c) => c.code === currencyCode) || currencies[0]
	if (!currency) return String(amount)
	return `${currency.symbol} ${Number(amount).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format quantity with UoM label
 * @param {number} qty - Quantity
 * @param {string} uomCode - UoM code
 * @param {Array} uoms - Array of UoM definitions
 * @returns {string} Formatted quantity with UoM label
 */
export function formatQty(qty, uomCode, uoms) {
	const uom = uoms.find((u) => u.code === uomCode) || uoms[0]
	if (!uom) return String(qty)
	return `${Number(qty).toLocaleString("ar-SA")} ${uom.nameAr}`
}

/**
 * Convert quantity from one UoM to another
 * @param {number} qty - Quantity to convert
 * @param {string} fromUom - Source UoM code
 * @param {string} toUom - Target UoM code
 * @param {Array} uoms - Array of UoM definitions
 * @returns {number} Converted quantity
 */
export function convertQty(qty, fromUom, toUom, uoms) {
	const from = uoms.find((u) => u.code === fromUom)
	const to = uoms.find((u) => u.code === toUom)
	if (!from || !to || from.type !== to.type) return qty
	const inBase = qty * (from.factor || 1)
	return inBase / (to.factor || 1)
}

/**
 * Convert amount from one currency to another
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {Array} currencies - Array of currency definitions
 * @returns {number} Converted amount
 */
export function convertAmount(amount, fromCurrency, toCurrency, currencies) {
	const from = currencies.find((c) => c.code === fromCurrency)
	const to = currencies.find((c) => c.code === toCurrency)
	if (!from || !to) return amount
	const inBase = amount * (from.rate || 1)
	return inBase / (to.rate || 1)
}

/**
 * Convert quantity between UoMs of the same type
 * @param {number} qty - Quantity
 * @param {string} fromUom - Source UoM
 * @param {string} toUom - Target UoM
 * @param {Array} uoms - UoM definitions
 * @returns {number} Converted quantity
 */
export function convertUom(qty, fromUom, toUom, uoms) {
	return convertQty(qty, fromUom, toUom, uoms)
}

/**
 * Get UoM by code
 * @param {string} code - UoM code
 * @param {Array} uoms - UoM definitions
 * @returns {Object|null} UoM definition or null
 */
export function getUom(code, uoms) {
	return uoms.find((u) => u.code === code) || null
}

/**
 * Get currency by code
 * @param {string} code - Currency code
 * @param {Array} currencies - Currency definitions
 * @returns {Object|null} Currency definition or null
 */
export function getCurrency(code, currencies) {
	return currencies.find((c) => c.code === code) || null
}

/**
 * Format date/time for Arabic locale
 * @param {string|Date} iso - ISO date string or Date object
 * @returns {string} Formatted date/time in Arabic locale
 */
export function formatDateTime(iso) {
	if (!iso) return "-"
	return new Date(iso).toLocaleString("ar-SA")
}

export default CONFIG
