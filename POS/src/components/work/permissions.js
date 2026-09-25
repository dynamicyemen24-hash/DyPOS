/**
 * Permission-aware UI utilities (WCAG 2.2 AA).
 *
 * IMPORTANT: UI permissions are NOT a substitute for server-side authorization.
 * Server MUST enforce fail-closed: every method/REST list gets a tenant clause;
 * invalid/spoofed tenant -> 403, foreign row -> 404.
 *
 * This module provides:
 *  - usePermissions(): reactive permission checking
 *  - v-permission directive: declarative element control
 *  - <PermissionGate> component: slot-based permission rendering
 *  - Permission states: visible | hidden | disabled | readonly | restricted | unauthorized
 */

import { ref, computed, inject, provide } from "vue"

// Permission symbol for injection
const PERMISSIONS_KEY = Symbol("DyPOS:permissions")

/** Permission state enum */
export const PermissionState = Object.freeze({
	VISIBLE: "visible", // User has full access
	HIDDEN: "hidden", // Element removed from DOM
	DISABLED: "disabled", // Element present but non-interactive
	READONLY: "readonly", // Element present, read-only (inputs)
	RESTRICTED: "restricted", // Element present with limited functionality
	UNAUTHORIZED: "unauthorized", // Explicit unauthorized (403-like)
})

/** Default permission map - override via providePermissions() */
const DEFAULT_PERMISSIONS = Object.freeze({})

/**
 * Provide permissions at app root (typically in main.js after auth bootstrap).
 * @param {Record<string, string|boolean|string[]>} permissions - Permission map
 *   Examples:
 *   { "pos.sell": true, "reports.view": "readonly", "admin.users": false }
 *   { "stock.adjust": ["manager", "admin"], "invoices.delete": [] }
 */
export function providePermissions(permissions = {}) {
	const normalized = {}
	for (const [key, value] of Object.entries(permissions)) {
		normalized[key] = normalizePermission(value)
	}
	provide(PERMISSIONS_KEY, ref(normalized))
}

/**
 * Composable for permission checking.
 * @returns {Object} { has, state, can, gate }
 */
export function usePermissions() {
	const permissions = inject(PERMISSIONS_KEY, ref(DEFAULT_PERMISSIONS))

	/**
	 * Check if user has permission.
	 * @param {string} key - Permission key (e.g., "pos.sell")
	 * @param {string} [requiredState="visible"] - Required state
	 * @returns {boolean}
	 */
	function has(key, requiredState = "visible") {
		const perm = permissions.value?.[key]
		if (perm === undefined) return false // Default deny
		return checkPermission(perm, requiredState)
	}

	/**
	 * Get permission state for a key.
	 * @param {string} key - Permission key
	 * @returns {string} PermissionState value
	 */
	function state(key) {
		const perm = permissions.value?.[key]
		if (perm === undefined) return PermissionState.HIDDEN
		return perm
	}

	/**
	 * Check if user can perform action (alias for has with visible).
	 * @param {string} key - Permission key
	 * @returns {boolean}
	 */
	function can(key) {
		return has(key, PermissionState.VISIBLE)
	}

	/**
	 * Render slot conditionally based on permission.
	 * @param {string} key - Permission key
	 * @param {Object} slots - Slots object (default, fallback)
	 * @param {string} [requiredState="visible"] - Required state
	 * @returns {VNode[]|null}
	 */
	function gate(key, slots, requiredState = "visible") {
		const perm = state(key)
		const allowed = checkPermission(perm, requiredState)

		if (!allowed) {
			return slots.fallback?.() ?? null
		}

		// For readonly/disabled/restricted, pass state to default slot
		return slots.default?.({ state: perm }) ?? null
	}

	/**
	 * Get all permissions (for debugging/admin).
	 * @returns {Record<string, string>}
	 */
	function all() {
		return { ...permissions.value }
	}

	return { has, state, can, gate, all }
}

/**
 * Normalize permission value to PermissionState.
 * @param {boolean|string|string[]} value - Raw permission value
 * @returns {string} PermissionState
 */
function normalizePermission(value) {
	if (typeof value === "boolean") {
		return value ? PermissionState.VISIBLE : PermissionState.HIDDEN
	}
	if (typeof value === "string") {
		const v = value.toLowerCase()
		if (Object.values(PermissionState).includes(v)) return v
		// Role-based: treat as visible if non-empty
		return v ? PermissionState.VISIBLE : PermissionState.HIDDEN
	}
	if (Array.isArray(value)) {
		return value.length > 0 ? PermissionState.VISIBLE : PermissionState.HIDDEN
	}
	return PermissionState.HIDDEN
}

/**
 * Check if permission satisfies required state.
 * @param {string} perm - Current permission state
 * @param {string} required - Required state
 * @returns {boolean}
 */
function checkPermission(perm, required) {
	// Hierarchy: visible > restricted > readonly > disabled > hidden > unauthorized
	const hierarchy = {
		[PermissionState.VISIBLE]: 6,
		[PermissionState.RESTRICTED]: 5,
		[PermissionState.READONLY]: 4,
		[PermissionState.DISABLED]: 3,
		[PermissionState.HIDDEN]: 2,
		[PermissionState.UNAUTHORIZED]: 1,
	}
	return (hierarchy[perm] ?? 0) >= (hierarchy[required] ?? 6)
}

/**
 * v-permission directive for declarative permission control.
 * Usage:
 *   <button v-permission:pos.sell>بيع</button>
 *   <input v-permission:readonly="stock.adjust" />
 *   <div v-permission:hidden="admin.delete">...</div>
 */
export const vPermission = {
	mounted(el, binding) {
		applyPermission(el, binding)
	},
	updated(el, binding) {
		applyPermission(el, binding)
	},
}

function applyPermission(el, binding) {
	const { instance } = binding
	if (!instance) return

	const { has, state } = instance.$.provides[PERMISSIONS_KEY]?.value
		? usePermissions()
		: { has: () => false, state: () => PermissionState.HIDDEN }

	// Get permission key from argument or value
	const key = binding.arg || binding.value
	if (!key) return

	const permState = state(key)
	const modifier = Object.keys(binding.modifiers)[0] || "visible"

	// Remove any existing permission classes
	el.classList.remove(
		"perm-visible",
		"perm-hidden",
		"perm-disabled",
		"perm-readonly",
		"perm-restricted",
		"perm-unauthorized",
	)
	el.classList.add(`perm-${permState}`)

	// Apply behavior based on modifier (required state)
	switch (modifier) {
		case "hidden":
			el.hidden =
				permState === PermissionState.HIDDEN ||
				permState === PermissionState.UNAUTHORIZED
			break
		case "disabled":
			if (
				permState === PermissionState.DISABLED ||
				permState === PermissionState.HIDDEN ||
				permState === PermissionState.UNAUTHORIZED
			) {
				el.disabled = true
				el.setAttribute("aria-disabled", "true")
				el.tabIndex = -1
			} else {
				el.disabled = false
				el.removeAttribute("aria-disabled")
				if (el.tabIndex === -1) el.removeAttribute("tabindex")
			}
			break
		case "readonly":
			if (
				permState === PermissionState.READONLY ||
				permState === PermissionState.DISABLED ||
				permState === PermissionState.HIDDEN ||
				permState === PermissionState.UNAUTHORIZED
			) {
				el.readOnly = true
				el.setAttribute("aria-readonly", "true")
			} else {
				el.readOnly = false
				el.removeAttribute("aria-readonly")
			}
			break
		case "restricted":
			// Custom handling per component
			el.dataset.permissionRestricted = permState === PermissionState.RESTRICTED
			break
		case "unauthorized":
			el.hidden = permState === PermissionState.UNAUTHORIZED
			break
		default:
			el.hidden =
				permState === PermissionState.HIDDEN ||
				permState === PermissionState.UNAUTHORIZED
			break
	}
}

/**
 * <PermissionGate> component for slot-based permission rendering.
 * Usage:
 *   <PermissionGate permission="pos.sell" required-state="visible">
 *     <template #default="{ state }"><button>بيع</button></template>
 *     <template #fallback><span>غير مسموح</span></template>
 *   </PermissionGate>
 */
export const PermissionGate = {
	name: "PermissionGate",
	props: {
		permission: { type: String, required: true },
		requiredState: {
			type: String,
			default: PermissionState.VISIBLE,
			validator: (v) => Object.values(PermissionState).includes(v),
		},
	},
	setup(props, { slots }) {
		const { state, has } = usePermissions()

		const currentState = computed(() => state(props.permission))
		const allowed = computed(() => has(props.permission, props.requiredState))

		return () => {
			if (!allowed.value) {
				return slots.fallback?.() ?? null
			}
			return slots.default?.({ state: currentState.value }) ?? null
		}
	},
}
