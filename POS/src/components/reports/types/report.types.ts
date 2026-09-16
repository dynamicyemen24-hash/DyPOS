export type ReportSeverity = "critical" | "high" | "medium" | "low" | "info"

export type ReportTrend = "up" | "down" | "flat"

export interface ReportFilter {
	from?: Date
	to?: Date

	branchId?: string
	warehouseId?: string

	productId?: string
	categoryId?: string

	customerId?: string
	supplierId?: string

	employeeId?: string
	cashierId?: string

	paymentMethod?: string
}

export interface KPI {
	id: string
	label: string

	value: number
	previousValue?: number

	changePercent?: number

	trend?: ReportTrend

	target?: number

	status?: "good" | "warning" | "danger" | "neutral"
}

export interface ReportColumn<T = unknown> {
	key: keyof T | string
	label: string

	format?: "text" | "number" | "currency" | "percent" | "date" | "datetime"

	sortable?: boolean
}

export interface ReportResult<T = unknown> {
	rows: T[]

	kpis: KPI[]

	generatedAt: Date

	filters: ReportFilter

	totalRows?: number

	metadata?: Record<string, unknown>
}

export interface DecisionRecommendation {
	id: string

	title: string

	description: string

	severity: ReportSeverity

	confidence?: number

	expectedImpact?: number

	action?: string

	evidence?: string[]
}
