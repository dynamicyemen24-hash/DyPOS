/**
 * =============================================================================
 * DyPOS — Global Keyboard Shortcut System
 * =============================================================================
 *
 * نظام اختصارات مركزي عالي الاعتمادية لنقطة البيع.
 *
 * المبادئ:
 * - Listener واحد فقط على مستوى التطبيق.
 * - Capture phase لضمان الاستجابة قبل مكونات الواجهة عند الحاجة.
 * - Scope isolation لمنع تعارض POS / Dialog / Search / Payment.
 * - RTL-safe.
 * - Input-safe افتراضيًا.
 * - Reactive enabled state.
 * - أولوية واضحة عند وجود أكثر من اختصار مطابق.
 * - دعم التسجيل والإلغاء الديناميكي.
 * - عدم ترك listeners بعد unmount.
 * - مناسب للـkeyboard / barcode / POS terminals.
 *
 * أمثلة:
 *
 * const hotkeys = useHotkeys("pos");
 *
 * hotkeys.register("F2", {
 *     handler: openProductSearch,
 *     label: "البحث عن منتج",
 * });
 *
 * hotkeys.register("Ctrl+K", {
 *     handler: focusSearch,
 *     label: "فتح البحث",
 *     allowInInput: true,
 *     preventDefault: true,
 * });
 *
 * hotkeys.register("F9", {
 *     handler: openPayment,
 *     label: "الدفع",
 *     preventDefault: true,
 * });
 *
 * Combo:
 * - F2
 * - Enter
 * - Escape
 * - Ctrl+K
 * - Shift+Escape
 * - Alt+ArrowRight
 * - Ctrl+Shift+P
 *
 * ملاحظة:
 * Ctrl يطابق Command على macOS.
 * =============================================================================
 */

import { computed, getCurrentInstance, isRef, onUnmounted, unref } from "vue"

// =============================================================================
// Constants
// =============================================================================

const KEY_ALIASES = Object.freeze({
	esc: "Escape",
	escape: "Escape",

	space: " ",
	spc: " ",

	up: "ArrowUp",
	down: "ArrowDown",
	left: "ArrowLeft",
	right: "ArrowRight",

	enter: "Enter",
	return: "Enter",

	ins: "Insert",
	insert: "Insert",

	del: "Delete",
	delete: "Delete",

	backspace: "Backspace",

	pgup: "PageUp",
	pageup: "PageUp",

	pgdn: "PageDown",
	pagedown: "PageDown",

	home: "Home",
	end: "End",

	tab: "Tab",

	plus: "+",
	minus: "-",

	comma: ",",
	period: ".",
	dot: ".",
	slash: "/",

	"`": "`",
})

const MODIFIER_ALIASES = Object.freeze({
	ctrl: "ctrl",
	control: "ctrl",
	cmd: "ctrl",
	command: "ctrl",
	meta: "ctrl",

	alt: "alt",
	option: "alt",

	shift: "shift",
})

const TYPING_KEYS = new Set([
	"Enter",
	"Tab",
	"Backspace",
	"Delete",
	" ",

	...Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index)),

	...Array.from({ length: 10 }, (_, index) => String(index)),

	"-",
	"=",
	"[",
	"]",
	"\\",
	";",
	"'",
	",",
	".",
	"/",
	"`",
])

const FUNCTION_KEYS = new Set(
	Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
)

// =============================================================================
// Global Registry
// =============================================================================

/**
 * scope -> Set<listener>
 *
 * كل composable يمتلك listener خاصًا به داخل الـregistry،
 * لكن DOM listener نفسه واحد فقط.
 */
const scopedListeners = new Map()

let globalBound = false

// =============================================================================
// Environment
// =============================================================================

function isBrowser() {
	return typeof window !== "undefined" && typeof document !== "undefined"
}

// =============================================================================
// Key normalization
// =============================================================================

function normalizeKey(value) {
	if (value === null || value === undefined) {
		return ""
	}

	const token = String(value).trim().toLowerCase()

	if (!token) {
		return ""
	}

	if (KEY_ALIASES[token]) {
		return KEY_ALIASES[token]
	}

	/**
	 * KeyboardEvent.key for letters is normally lowercase/uppercase
	 * depending on Shift. We normalize printable alphabetic keys.
	 */
	if (token.length === 1) {
		return token.toLowerCase()
	}

	/**
	 * Preserve function keys in canonical form.
	 */
	const functionMatch = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(token)

	if (functionMatch) {
		return `F${functionMatch[1]}`
	}

	return token
}

function normalizeModifier(value) {
	const token = String(value).trim().toLowerCase()

	return MODIFIER_ALIASES[token] || null
}

/**
 * Canonical combo:
 *
 * Ctrl + Shift + K
 * ->
 * ctrl+shift+k
 */
function normalizeCombo(combo) {
	if (!combo) {
		return ""
	}

	const tokens = String(combo)
		.split("+")
		.map((token) => token.trim())
		.filter(Boolean)

	if (!tokens.length) {
		return ""
	}

	let ctrl = false
	let alt = false
	let shift = false

	let base = ""

	for (const token of tokens) {
		const modifier = normalizeModifier(token)

		if (modifier === "ctrl") {
			ctrl = true
			continue
		}

		if (modifier === "alt") {
			alt = true
			continue
		}

		if (modifier === "shift") {
			shift = true
			continue
		}

		/**
		 * Last non-modifier token is the base key.
		 *
		 * This also allows "+" as a base key when written as "plus".
		 */
		base = normalizeKey(token)
	}

	if (!base) {
		return ""
	}

	return [
		ctrl ? "ctrl" : null,
		alt ? "alt" : null,
		shift ? "shift" : null,
		base,
	]
		.filter(Boolean)
		.join("+")
}

// =============================================================================
// Event helpers
// =============================================================================

function getEventBaseKey(event) {
	return normalizeKey(event?.key || "")
}

function isTypingKey(key) {
	return TYPING_KEYS.has(normalizeKey(key))
}

function isEditableTarget(target) {
	if (!target) {
		return false
	}

	/**
	 * Shadow DOM safe path when available.
	 */
	const path =
		typeof target.composedPath === "function" ? target.composedPath() : null

	if (Array.isArray(path)) {
		for (const node of path) {
			if (
				node instanceof HTMLElement &&
				(node.matches?.(
					'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
				) ||
					node.isContentEditable)
			) {
				return true
			}
		}
	}

	if (target instanceof HTMLElement) {
		if (target.isContentEditable) {
			return true
		}

		return Boolean(
			target.closest?.(
				'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
			),
		)
	}

	return false
}

function isComposing(event) {
	return event?.isComposing === true || event?.keyCode === 229
}

function isModifierOnlyEvent(event) {
	const key = normalizeKey(event?.key)

	return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta"
}

// =============================================================================
// Combo matching
// =============================================================================

function matchesCombo(combo, event) {
	const normalized = normalizeCombo(combo)

	if (!normalized || !event) {
		return false
	}

	const parts = normalized.split("+")

	const base = parts[parts.length - 1]

	const wantsCtrl = parts.includes("ctrl")
	const wantsAlt = parts.includes("alt")
	const wantsShift = parts.includes("shift")

	const eventKey = getEventBaseKey(event)

	if (eventKey !== base) {
		return false
	}

	/**
	 * Ctrl matches Meta on macOS.
	 */
	const hasCtrl = Boolean(event.ctrlKey) || Boolean(event.metaKey)

	if (hasCtrl !== wantsCtrl) {
		return false
	}

	if (Boolean(event.altKey) !== wantsAlt) {
		return false
	}

	if (Boolean(event.shiftKey) !== wantsShift) {
		return false
	}

	return true
}

// =============================================================================
// Priority
// =============================================================================

function getShortcutPriority(entry) {
	/**
	 * Explicit priority always wins.
	 */
	if (Number.isFinite(entry.priority)) {
		return entry.priority
	}

	/**
	 * More specific shortcuts should normally win.
	 */
	if (entry.scopePriority !== undefined) {
		return Number(entry.scopePriority) || 0
	}

	return 0
}

// =============================================================================
// Scope dispatch
// =============================================================================

function dispatchScoped(listener, event) {
	if (!listener?.isActive()) {
		return false
	}

	const patterns = listener.patterns

	if (!patterns?.size) {
		return false
	}

	/**
	 * Composition events belong to IME / Arabic / Asian text input.
	 * Never intercept them globally.
	 */
	if (isComposing(event)) {
		return false
	}

	if (isModifierOnlyEvent(event)) {
		return false
	}

	const editable = isEditableTarget(event.target)

	const matches = []

	for (const [combo, entry] of patterns) {
		if (!entry || typeof entry.handler !== "function") {
			continue
		}

		const base = combo.split("+").pop()

		const typing = isTypingKey(base)

		/**
		 * Function keys and navigation keys are safe in inputs by default.
		 *
		 * Text-producing keys require explicit opt-in.
		 */
		if (editable && typing && !entry.allowInInput) {
			continue
		}

		/**
		 * Consumer can explicitly block shortcuts in editable fields,
		 * even for function/navigation keys.
		 */
		if (editable && entry.allowInInput === false && !typing) {
			continue
		}

		if (!matchesCombo(combo, event)) {
			continue
		}

		matches.push({
			combo,
			entry,
		})
	}

	if (!matches.length) {
		return false
	}

	/**
	 * Deterministic priority:
	 *
	 * 1. explicit priority
	 * 2. registration order
	 */
	matches.sort(
		(a, b) => getShortcutPriority(b.entry) - getShortcutPriority(a.entry),
	)

	const match = matches[0]
	const { combo, entry } = match

	if (entry.preventDefault !== false) {
		event.preventDefault()
	}

	if (entry.stopPropagation === true) {
		event.stopPropagation()
	}

	entry.handler(event, {
		combo,
		scope: listener.scope,
	})

	if (entry.once === true) {
		listener.patterns.delete(combo)
	}

	return true
}

// =============================================================================
// Global dispatcher
// =============================================================================

function globalKeyHandler(event) {
	if (event.defaultPrevented) {
		return
	}

	/**
	 * Most recently registered scope gets the first opportunity.
	 *
	 * This is useful for:
	 * Dialog > Payment > POS
	 *
	 * where a modal interaction must override the page shortcut.
	 */
	const scopes = Array.from(scopedListeners.values()).reverse()

	for (const listeners of scopes) {
		/**
		 * Within the same scope, the first active listener that handles
		 * the event wins.
		 */
		for (const listener of listeners) {
			const handled = dispatchScoped(listener, event)

			if (handled || event.defaultPrevented) {
				return
			}
		}
	}
}

// =============================================================================
// Global listener lifecycle
// =============================================================================

function bindGlobal() {
	if (globalBound || !isBrowser()) {
		return
	}

	document.addEventListener("keydown", globalKeyHandler, {
		capture: true,
		passive: false,
	})

	globalBound = true
}

function unbindGlobal() {
	if (!globalBound || !isBrowser()) {
		return
	}

	document.removeEventListener("keydown", globalKeyHandler, true)

	globalBound = false
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Register keyboard shortcuts for a feature/scope.
 *
 * @param {string} scope
 * @param {Object} options
 * @param {boolean|import("vue").Ref<boolean>|Function} [options.enabled=true]
 * @param {number} [options.priority=0]
 *
 * @returns {{
 *   register: Function,
 *   unregister: Function,
 *   clear: Function,
 *   stop: Function,
 *   list: Function,
 *   has: Function,
 *   isActive: import("vue").ComputedRef<boolean>,
 * }}
 */
export function useHotkeys(
	scope = "default",
	{ enabled = true, priority = 0 } = {},
) {
	const normalizedScope = String(scope || "default").trim() || "default"

	const enabledValue =
		typeof enabled === "function"
			? computed(() => Boolean(enabled()))
			: isRef(enabled)
				? enabled
				: computed(() => Boolean(enabled))

	const state = {
		scope: normalizedScope,
		patterns: new Map(),
		priority,
	}

	let listener = null

	const isActive = computed(() => Boolean(unref(enabledValue)))

	// -------------------------------------------------------------------------
	// Registration lifecycle
	// -------------------------------------------------------------------------

	function ensureRegistered() {
		if (listener) {
			return
		}

		listener = {
			scope: normalizedScope,
			patterns: state.patterns,
			isActive: () => Boolean(unref(enabledValue)),
		}

		if (!scopedListeners.has(normalizedScope)) {
			scopedListeners.set(normalizedScope, new Set())
		}

		scopedListeners.get(normalizedScope).add(listener)

		bindGlobal()
	}

	function unregisterListener() {
		if (!listener) {
			return
		}

		const listeners = scopedListeners.get(normalizedScope)

		if (listeners) {
			listeners.delete(listener)

			if (!listeners.size) {
				scopedListeners.delete(normalizedScope)
			}
		}

		listener = null

		if (!scopedListeners.size) {
			unbindGlobal()
		}
	}

	// -------------------------------------------------------------------------
	// Register
	// -------------------------------------------------------------------------

	function register(combo, entry = {}) {
		const normalized = normalizeCombo(combo)

		if (!normalized) {
			throw new Error(`useHotkeys: invalid shortcut "${combo}"`)
		}

		if (typeof entry.handler !== "function") {
			throw new Error(`useHotkeys: handler is required for "${combo}"`)
		}

		const record = {
			handler: entry.handler,

			label: entry.label || normalized,

			allowInInput: Boolean(entry.allowInInput),

			preventDefault: entry.preventDefault !== false,

			stopPropagation: Boolean(entry.stopPropagation),

			once: Boolean(entry.once),

			priority: Number.isFinite(entry.priority)
				? entry.priority
				: state.priority,

			/**
			 * Optional arbitrary metadata.
			 * Useful for future shortcut help UI.
			 */
			category: entry.category || null,

			description: entry.description || null,
		}

		state.patterns.set(normalized, record)

		ensureRegistered()

		/**
		 * Return an unregister function for this exact registration.
		 */
		return () => {
			/**
			 * Don't remove a newer registration that replaced this one.
			 */
			const current = state.patterns.get(normalized)

			if (current === record) {
				state.patterns.delete(normalized)
			}

			if (!state.patterns.size) {
				unregisterListener()
			}
		}
	}

	// -------------------------------------------------------------------------
	// Unregister
	// -------------------------------------------------------------------------

	function unregister(combo) {
		const normalized = normalizeCombo(combo)

		if (!normalized) {
			return false
		}

		const deleted = state.patterns.delete(normalized)

		if (!state.patterns.size) {
			unregisterListener()
		}

		return deleted
	}

	// -------------------------------------------------------------------------
	// Clear
	// -------------------------------------------------------------------------

	function clear() {
		state.patterns.clear()
		unregisterListener()
	}

	// -------------------------------------------------------------------------
	// Has
	// -------------------------------------------------------------------------

	function has(combo) {
		const normalized = normalizeCombo(combo)

		return state.patterns.has(normalized)
	}

	// -------------------------------------------------------------------------
	// List
	// -------------------------------------------------------------------------

	function list() {
		return Array.from(state.patterns.entries()).map(([combo, entry]) => ({
			combo,
			label: entry.label,
			description: entry.description,
			category: entry.category,
			scope: normalizedScope,
			priority: entry.priority,
			allowInInput: entry.allowInInput,
		}))
	}

	// -------------------------------------------------------------------------
	// Stop
	// -------------------------------------------------------------------------

	function stop() {
		state.patterns.clear()
		unregisterListener()
	}

	// -------------------------------------------------------------------------
	// Automatic component cleanup
	// -------------------------------------------------------------------------

	if (getCurrentInstance()) {
		onUnmounted(stop)
	}

	return {
		register,
		unregister,
		clear,
		stop,
		list,
		has,
		isActive,
	}
}

// =============================================================================
// DyPOS default shortcut catalog
// =============================================================================

/**
 * هذه القائمة لا تقوم بالتسجيل تلقائيًا.
 *
 * تستخدم مستقبلًا:
 * - شاشة اختصارات لوحة المفاتيح.
 * - Help overlay.
 * - Settings.
 * - توثيق POS.
 * - onboarding.
 *
 * labelKey يظل مفتاح ترجمة وليس نصًا ثابتًا.
 */
export const POS_SHORTCUT_DEFAULTS = Object.freeze([
	{
		combo: "F2",
		labelKey: "Shortcuts.Sync",
		scope: "pos",
		category: "system",
		priority: 10,
	},

	{
		combo: "F6",
		labelKey: "Shortcuts.Settings",
		scope: "pos",
		category: "navigation",
		priority: 10,
	},

	{
		combo: "F8",
		labelKey: "Shortcuts.DraftInvoices",
		scope: "pos",
		category: "sales",
		priority: 10,
	},

	{
		combo: "F9",
		labelKey: "Shortcuts.InvoiceHistory",
		scope: "pos",
		category: "sales",
		priority: 10,
	},

	{
		combo: "Shift+Escape",
		labelKey: "Shortcuts.Logout",
		scope: "pos",
		category: "session",
		priority: 20,
	},
])

// =============================================================================
// Utility exports
// =============================================================================

export {
	normalizeCombo,
	normalizeKey,
	matchesCombo,
	isEditableTarget,
	isTypingKey,
	isComposing,
	FUNCTION_KEYS,
}
