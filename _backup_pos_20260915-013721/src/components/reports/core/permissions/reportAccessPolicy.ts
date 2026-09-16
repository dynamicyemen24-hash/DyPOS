export interface ReportAccessPolicy {
	reportId: string

	roles: string[]

	canView: boolean

	canExport: boolean

	canDrillDown: boolean

	canViewFinancials: boolean

	canViewCustomerData: boolean

	canViewSupplierData: boolean
}

/*
 * Principle:
 * Users should only receive data they are authorized to see.
 *
 * Reports must respect the existing DyPOS authentication and
 * authorization system.
 *
 * Do not introduce a second authentication system here.
 */
