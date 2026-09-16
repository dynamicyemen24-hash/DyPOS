/**
 * POS operation permission registry.
 *
 * Maps high-level POS operations to Frappe doctype checks so the UI and the
 * session bootstrap can reason about capabilities without hard-coding
 * doctypes everywhere. Pure module — no runtime dependencies.
 */

export const POS_PERMISSION_KEYS = Object.freeze({
	OPEN_SHIFT: "pos.open_shift",
	CLOSE_SHIFT: "pos.close_shift",
	MAKE_SALE: "pos.make_sale",
	SUBMIT_INVOICE: "pos.submit_invoice",
	VOID_INVOICE: "pos.void_invoice",
	APPLY_DISCOUNT: "pos.apply_discount",
	REFUND: "pos.refund",
	VIEW_REPORTS: "pos.view_reports",
	EDIT_SETTINGS: "pos.edit_settings",
	MANAGE_TERMINALS: "pos.manage_terminals",
})

/**
 * Operation → { doctype, permType } resolution table.
 */
export const POS_PERMISSION_CHECKS = Object.freeze({
	[POS_PERMISSION_KEYS.OPEN_SHIFT]: {
		doctype: "POS Opening Shift",
		permType: "create",
	},
	[POS_PERMISSION_KEYS.CLOSE_SHIFT]: {
		doctype: "POS Closing Shift",
		permType: "submit",
	},
	[POS_PERMISSION_KEYS.MAKE_SALE]: {
		doctype: "Sales Invoice",
		permType: "create",
	},
	[POS_PERMISSION_KEYS.SUBMIT_INVOICE]: {
		doctype: "Sales Invoice",
		permType: "submit",
	},
	[POS_PERMISSION_KEYS.VOID_INVOICE]: {
		doctype: "Sales Invoice",
		permType: "cancel",
	},
	[POS_PERMISSION_KEYS.APPLY_DISCOUNT]: {
		doctype: "Sales Invoice",
		permType: "write",
	},
	[POS_PERMISSION_KEYS.REFUND]: {
		doctype: "Sales Invoice",
		permType: "create",
	},
	[POS_PERMISSION_KEYS.VIEW_REPORTS]: {
		doctype: "POS Invoice",
		permType: "read",
	},
	[POS_PERMISSION_KEYS.EDIT_SETTINGS]: {
		doctype: "POS Settings",
		permType: "write",
	},
	[POS_PERMISSION_KEYS.MANAGE_TERMINALS]: {
		doctype: "POS Profile",
		permType: "write",
	},
})

/**
 * Optimistic defaults used before the real permission payload arrives, so the
 * POS never blocks a first sale waiting on a network round-trip. The server
 * result (when available) overrides these.
 */
export const DEFAULT_POS_PERMISSIONS = Object.freeze(
	Object.fromEntries(
		Object.values(POS_PERMISSION_KEYS).map((op) => [op, true]),
	),
)

/**
 * Resolve the { op, doctype, permType } checks for a set of operations.
 * @param {string[]} [ops] - Subset of operation keys (default: all).
 * @returns {Array<{op: string, doctype: string, permType: string}>}
 */
export function resolvePermissionChecks(
	ops = Object.values(POS_PERMISSION_KEYS),
) {
	const checks = []
	for (const op of ops) {
		const mapping = POS_PERMISSION_CHECKS[op]
		if (mapping) {
			checks.push({ op, ...mapping })
		}
	}
	return checks
}

/**
 * Build an `op → boolean` snapshot from a raw `doctype:permType → boolean` map
 * (e.g. the output of usePermissions.checkMultiplePermissions).
 * @param {Object} results
 * @param {Object} [defaults]
 * @param {string[]} [ops]
 * @returns {Object}
 */
export function buildPermissionSnapshot(
	results,
	defaults = DEFAULT_POS_PERMISSIONS,
	ops = Object.values(POS_PERMISSION_KEYS),
) {
	const snapshot = {}
	for (const op of ops) {
		const mapping = POS_PERMISSION_CHECKS[op]
		if (mapping) {
			const value = results[`${mapping.doctype}:${mapping.permType}`]
			snapshot[op] =
				value === undefined ? (defaults[op] ?? false) : Boolean(value)
		}
	}
	return snapshot
}

/**
 * Preload permissions in parallel, merging results over optimistic defaults.
 *
 * @param {Object} opts
 * @param {(doctype: string, permType: string) => Promise<boolean>} opts.hasPermission
 *        Inject the actual checker (usePermissions.checkPermission) so this
 *        module stays side-effect free and testable.
 * @param {Object} [opts.defaults]
 * @param {string[]} [opts.ops]
 * @returns {Promise<Object>} `{ op: boolean }` map.
 */
export async function preloadPOSPermissions({
	hasPermission,
	defaults = DEFAULT_POS_PERMISSIONS,
	ops = Object.values(POS_PERMISSION_KEYS),
} = {}) {
	const result = { ...defaults }
	const checks = resolvePermissionChecks(ops)

	await Promise.all(
		checks.map(async ({ op, doctype, permType }) => {
			try {
				const allowed = await hasPermission(doctype, permType)
				result[op] = allowed
			} catch (error) {
				// Keep the optimistic default on failure — never block the POS.
				result[op] = defaults[op] ?? false
			}
		}),
	)

	return result
}

export default {
	POS_PERMISSION_KEYS,
	POS_PERMISSION_CHECKS,
	DEFAULT_POS_PERMISSIONS,
	resolvePermissionChecks,
	buildPermissionSnapshot,
	preloadPOSPermissions,
}
