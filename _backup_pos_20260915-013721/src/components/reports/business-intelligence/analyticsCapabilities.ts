export interface AnalyticsCapabilities {
	periodComparison: boolean

	yearOverYear: boolean

	monthOverMonth: boolean

	weekOverWeek: boolean

	movingAverage: boolean

	growthRate: boolean

	abcAnalysis: boolean

	xyzAnalysis: boolean

	paretoAnalysis: boolean

	rfmAnalysis: boolean

	cohortAnalysis: boolean

	anomalyDetection: boolean

	demandForecasting: boolean

	scenarioAnalysis: boolean
}

export const DEFAULT_ANALYTICS_CAPABILITIES: AnalyticsCapabilities = {
	periodComparison: true,

	yearOverYear: true,

	monthOverMonth: true,

	weekOverWeek: true,

	movingAverage: true,

	growthRate: true,

	abcAnalysis: true,

	xyzAnalysis: true,

	paretoAnalysis: true,

	rfmAnalysis: true,

	cohortAnalysis: true,

	anomalyDetection: true,

	demandForecasting: true,

	scenarioAnalysis: true,
}
