export interface ExecutiveInsight {
	title: string

	value: number

	changePercent?: number

	trend?: "up" | "down" | "flat"

	status: "positive" | "neutral" | "warning" | "critical"

	explanation?: string

	recommendation?: string
}

export interface ExecutiveDashboardModel {
	revenue: ExecutiveInsight

	profit: ExecutiveInsight

	margin: ExecutiveInsight

	transactions: ExecutiveInsight

	averageTicket: ExecutiveInsight

	inventoryValue: ExecutiveInsight

	stockoutRisk: ExecutiveInsight

	receivables: ExecutiveInsight

	payables: ExecutiveInsight

	alerts: ExecutiveInsight[]

	recommendations: string[]
}
