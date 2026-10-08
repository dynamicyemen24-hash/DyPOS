/**
 * POS permission matrix — server authority.
 *
 * This is deliberately server-side: the client may hide controls, but only
 * this matrix decides whether an operation is allowed.
 */

const ROLE_PERMS = {
	ADMIN: { allow: true },
	MANAGER: {
		allow: true,
		denyWrite: new Set(["User", "DyPOS Settings"]),
	},
	CASHIER: {
		allowDoctypes: new Set([
			"Customer", "Item", "Sales Invoice", "POS Invoice",
			"POS Opening Shift", "POS Closing Shift", "POS Profile",
			"POS Settings", "POS Coupon", "Promotional Scheme",
			"Campaign", "UOM", "Bin", "Serial No",
		]),
		allowCreate: new Set([
			"Customer", "Sales Invoice", "POS Invoice",
			"POS Opening Shift", "POS Closing Shift", "POS Coupon",
		]),
		allowWrite: new Set([
			"Customer", "Sales Invoice", "POS Invoice",
			"POS Opening Shift", "POS Closing Shift", "POS Coupon", "POS Profile",
		]),
		allowSubmit: new Set(["Sales Invoice", "POS Invoice", "POS Closing Shift"]),
		allowDelete: new Set(),
	},
	AUDITOR: {
		allowDoctypes: new Set(["Customer", "Item", "Sales Invoice", "POS Invoice", "UOM", "User"]),
		allowCreate: new Set(),
		allowWrite: new Set(),
		allowSubmit: new Set(),
		allowDelete: new Set(),
	},
}

export function checkPermission(role, doctype, permType) {
	const r = ROLE_PERMS[role]
	if (!r) return false
	if (r.allow === true) {
		if (r.denyWrite?.has(doctype) && ["write", "delete", "create"].includes(permType)) return false
		return true
	}
	const dt = String(doctype)
	if (r.allowDoctypes && !r.allowDoctypes.has(dt)) return false
	const map = {
		read: r.allowDoctypes?.has(dt),
		create: r.allowCreate?.has(dt),
		write: r.allowWrite?.has(dt),
		submit: r.allowSubmit?.has(dt),
		cancel: r.allowSubmit?.has(dt),
		delete: r.allowDelete?.has(dt),
	}
	if (permType in map) return Boolean(map[permType])
	return r.allowDoctypes?.has(dt) ?? false
}
