export type DecisionType =
	| "REORDER"
	| "PRICING"
	| "PROMOTION"
	| "STOCK"
	| "PROFIT"
	| "CUSTOMER"
	| "SUPPLIER"
	| "RISK"

export interface Decision {
	id: string

	type: DecisionType

	title: string

	reason: string

	recommendation: string

	priority: "critical" | "high" | "medium" | "low"

	confidence: number

	expectedImpact?: number

	affectedItems?: string[]

	evidence?: {
		metric: string
		value: number
		benchmark?: number
	}[]
}

/*
 * Decision rules must be deterministic and explainable.
 *
 * Never present an AI-style recommendation without evidence.
 */
