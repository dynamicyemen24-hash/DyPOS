/**
 * DyPOS Design Foundation Tokens
 *
 * Single source of truth for all design decisions.
 * Arabic-first (RTL), WCAG 2.2 AA compliant.
 * Used by: Tailwind config, CSS custom properties, component styles.
 *
 * Do not edit component styles directly — use these tokens.
 */

export const tokens = Object.freeze({
	// ============================================================================
	// COLOR — Semantic, accessible, RTL-aware
	// ============================================================================
	color: Object.freeze({
		// Brand
		brand: {
			50: "#ecfdf5",
			100: "#d1fae5",
			200: "#a7f3d0",
			300: "#6ee7b7",
			400: "#34d399",
			500: "#10b981", // Primary
			600: "#059669", // Primary hover
			700: "#047857",
			800: "#065f46",
			900: "#064e3b",
			950: "#022c22",
		},

		// Semantic: Surface (backgrounds)
		surface: {
			base: "#ffffff", // Card, modal, panel
			raised: "#ffffff", // Elevated surfaces
			overlay: "#f8fafc", // Hover/active states
			sunken: "#f1f5f9", // Input backgrounds
			border: "#e2e8f0", // Dividers, borders
			borderStrong: "#cbd5e1",
		},

		// Semantic: Text (WCAG AA contrast on surface.base)
		text: {
			primary: "#0f172a", // Headings, primary content
			secondary: "#334155", // Body text
			muted: "#64748b", // Captions, placeholders
			disabled: "#94a3b8", // Disabled text
			inverse: "#ffffff", // On dark/brand backgrounds
			link: "#059669", // Links
			linkHover: "#047857",
		},

		// Semantic: Status (color + accessible text pair)
		status: {
			info: {
				bg: "#eff6ff",
				border: "#bfdbfe",
				text: "#1e40af",
				icon: "#3b82f6",
				weak: "#dbeafe",
			},
			success: {
				bg: "#f0fdf4",
				border: "#bbf7d0",
				text: "#166534",
				icon: "#10b981",
				weak: "#dcfce7",
			},
			warning: {
				bg: "#fffbeb",
				border: "#fde68a",
				text: "#92400e",
				icon: "#f59e0b",
				weak: "#fef3c7",
			},
			danger: {
				bg: "#fef2f2",
				border: "#fecaca",
				text: "#991b1b",
				icon: "#ef4444",
				weak: "#fee2e2",
			},
		},

		// Interactive states
		interactive: {
			primary: {
				bg: "#059669",
				bgHover: "#047857",
				bgActive: "#065f46",
				bgDisabled: "#a7f3d0",
				text: "#ffffff",
				textDisabled: "#ffffff",
			},
			secondary: {
				bg: "transparent",
				bgHover: "#f1f5f9",
				bgActive: "#e2e8f0",
				bgDisabled: "transparent",
				text: "#334155",
				textDisabled: "#94a3b8",
				border: "#e2e8f0",
				borderHover: "#059669",
			},
			ghost: {
				bg: "transparent",
				bgHover: "#f1f5f9",
				bgActive: "#e2e8f0",
				text: "#334155",
				textDisabled: "#94a3b8",
			},
			danger: {
				bg: "#ef4444",
				bgHover: "#dc2626",
				bgActive: "#b91c1c",
				bgDisabled: "#fca5a5",
				text: "#ffffff",
			},
		},

		// Focus ring (WCAG 2.4.7)
		focus: {
			ring: "#059669",
			ringOffset: "#ffffff",
			ringWidth: "2px",
			ringOffsetWidth: "2px",
		},

		// Overlay / modal backdrop
		overlay: {
			backdrop: "rgba(15, 23, 42, 0.4)",
			scrim: "rgba(0, 0, 0, 0.5)",
		},
	}),

	// ============================================================================
	// TYPOGRAPHY — Arabic-first (Cairo), Latin fallback, fluid scaling
	// ============================================================================
	typography: Object.freeze({
		fontFamily: {
			sans: "'Cairo', 'Noto Sans Arabic', system-ui, sans-serif",
			mono: "'JetBrains Mono', 'Fira Code', monospace",
			numbers: "'Cairo', 'Tabular-nums', monospace", // For tabular numbers
		},

		fontWeight: {
			normal: 400,
			medium: 500,
			semibold: 600,
			bold: 700,
			extrabold: 800,
		},

		// Fluid type scale (clamp) — works across breakpoints
		fontSize: {
			xs: { min: "0.70rem", max: "0.75rem", lineHeight: 1.5 }, // 11-12px
			sm: { min: "0.81rem", max: "0.875rem", lineHeight: 1.5 }, // 13-14px
			base: { min: "0.94rem", max: "1rem", lineHeight: 1.6 }, // 15-16px
			lg: { min: "1.06rem", max: "1.125rem", lineHeight: 1.6 }, // 17-18px
			xl: { min: "1.25rem", max: "1.25rem", lineHeight: 1.5 }, // 20px
			"2xl": { min: "1.5rem", max: "1.5rem", lineHeight: 1.4 }, // 24px
			"3xl": { min: "1.875rem", max: "1.875rem", lineHeight: 1.3 }, // 30px
			"4xl": { min: "2.25rem", max: "2.25rem", lineHeight: 1.2 }, // 36px
		},

		lineHeight: {
			tight: 1.25,
			snug: 1.375,
			normal: 1.6,
			relaxed: 1.75,
		},

		letterSpacing: {
			tighter: "-0.02em",
			tight: "-0.01em",
			normal: "0",
			wide: "0.02em",
			wider: "0.04em",
			widest: "0.1em",
		},
	}),

	// ============================================================================
	// SPACING — 4px base unit, consistent scale
	// ============================================================================
	spacing: Object.freeze({
		0: "0",
		1: "0.25rem", // 4px
		2: "0.5rem", // 8px
		3: "0.75rem", // 12px
		4: "1rem", // 16px
		5: "1.25rem", // 20px
		6: "1.5rem", // 24px
		8: "2rem", // 32px
		10: "2.5rem", // 40px
		12: "3rem", // 48px
		16: "4rem", // 64px
		20: "5rem", // 80px
		24: "6rem", // 96px
	}),

	// ============================================================================
	// RADIUS — Consistent rounding
	// ============================================================================
	radius: Object.freeze({
		none: "0",
		xs: "0.125rem", // 2px
		sm: "0.25rem", // 4px
		md: "0.375rem", // 6px
		lg: "0.5rem", // 8px
		xl: "0.75rem", // 12px
		"2xl": "1rem", // 16px
		full: "9999px",
	}),

	// ============================================================================
	// ELEVATION — Layered shadows (RTL-aware, no directional offsets)
	// ============================================================================
	elevation: Object.freeze({
		0: "none",
		1: "0 1px 2px 0 rgba(15, 23, 42, 0.05)", // Subtle
		2: "0 1px 3px 0 rgba(15, 23, 42, 0.1), 0 1px 2px -1px rgba(15, 23, 42, 0.1)", // Card
		3: "0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.1)", // Raised
		4: "0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.1)", // Modal
		5: "0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)", // Dropdown
		6: "0 25px 50px -12px rgba(15, 23, 42, 0.15)", // Toast/Dialog
	}),

	// ============================================================================
	// LAYOUT — Containers, grids, max-widths
	// ============================================================================
	layout: Object.freeze({
		container: {
			sm: "640px",
			md: "768px",
			lg: "1024px",
			xl: "1280px",
			"2xl": "1400px",
			full: "100%",
		},

		sidebar: {
			width: "280px",
			collapsed: "72px",
			mobile: "320px",
		},

		header: {
			height: "64px",
			heightMobile: "56px",
		},

		toolbar: {
			height: "52px",
			heightDense: "44px",
		},

		contentMaxWidth: "1400px",
		contentPadding: "1.5rem", // 24px
		contentPaddingMobile: "1rem", // 16px
	}),

	// ============================================================================
	// GRID — 12-column, responsive
	// ============================================================================
	grid: Object.freeze({
		columns: 12,
		gutter: "1.5rem", // 24px
		gutterSm: "1rem", // 16px
		breakpoints: {
			xs: "0",
			sm: "640px",
			md: "768px",
			lg: "1024px",
			xl: "1280px",
			"2xl": "1536px",
		},
	}),

	// ============================================================================
	// BREAKPOINTS — Mobile-first
	// ============================================================================
	breakpoints: Object.freeze({
		xs: "0",
		sm: "640px",
		md: "768px",
		lg: "1024px",
		xl: "1280px",
		"2xl": "1536px",
	}),

	// ============================================================================
	// DENSITY — Compact / Comfortable / Spacious
	// ============================================================================
	density: Object.freeze({
		compact: {
			spacingMultiplier: 0.75,
			fontSizeMultiplier: 0.9,
			controlHeight: "32px",
		},
		comfortable: {
			spacingMultiplier: 1,
			fontSizeMultiplier: 1,
			controlHeight: "40px",
		},
		spacious: {
			spacingMultiplier: 1.25,
			fontSizeMultiplier: 1.05,
			controlHeight: "48px",
		},
	}),

	// ============================================================================
	// MOTION — Respects prefers-reduced-motion
	// ============================================================================
	motion: Object.freeze({
		duration: {
			instant: "0ms",
			fast: "100ms",
			normal: "150ms",
			slow: "250ms",
			slower: "350ms",
		},
		easing: {
			linear: "linear",
			ease: "ease",
			easeIn: "cubic-bezier(0.4, 0, 1, 1)",
			easeOut: "cubic-bezier(0, 0, 0.2, 1)",
			easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
			spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
		},
		// Reduced motion overrides (applied via media query)
		reduced: {
			duration: "0.01ms",
			easing: "linear",
		},
	}),

	// ============================================================================
	// ICONS — Feather Icons (consistent sizing)
	// ============================================================================
	icons: Object.freeze({
		size: {
			xs: "12px",
			sm: "16px",
			md: "20px",
			lg: "24px",
			xl: "32px",
			"2xl": "48px",
		},
		strokeWidth: {
			thin: 1.5,
			normal: 2,
			thick: 2.5,
		},
	}),

	// ============================================================================
	// Z-INDEX — Layering hierarchy
	// ============================================================================
	zIndex: Object.freeze({
		base: 0,
		dropdown: 100,
		sticky: 200,
		header: 300,
		modal: 400,
		popover: 500,
		tooltip: 600,
		toast: 700,
		skipLink: 9999,
	}),

	// ============================================================================
	// BORDERS
	// ============================================================================
	border: Object.freeze({
		width: {
			thin: "1px",
			normal: "1px",
			thick: "2px",
			heavy: "3px",
		},
		style: "solid",
	}),

	// ============================================================================
	// TRANSITIONS — Common transition combos
	// ============================================================================
	transition: Object.freeze({
		fast: "all 100ms ease",
		normal: "all 150ms ease",
		slow: "all 250ms ease",
		colors:
			"background-color 150ms ease, color 150ms ease, border-color 150ms ease",
		transform: "transform 150ms ease",
		opacity: "opacity 150ms ease",
		shadow: "box-shadow 150ms ease",
	}),

	// ============================================================================
	// RTL / DIRECTION — Logical properties mapping
	// ============================================================================
	direction: Object.freeze({
		rtl: {
			start: "inline-end",
			end: "inline-start",
			marginStart: "margin-inline-end",
			marginEnd: "margin-inline-start",
			paddingStart: "padding-inline-end",
			paddingEnd: "padding-inline-start",
			borderStart: "border-inline-end",
			borderEnd: "border-inline-start",
			left: "right",
			right: "left",
		},
		ltr: {
			start: "inline-start",
			end: "inline-end",
			marginStart: "margin-inline-start",
			marginEnd: "margin-inline-end",
			paddingStart: "padding-inline-start",
			paddingEnd: "padding-inline-end",
			borderStart: "border-inline-start",
			borderEnd: "border-inline-end",
			left: "left",
			right: "right",
		},
	}),

	// ============================================================================
	// ACCESSIBILITY — WCAG 2.2 AA constants
	// ============================================================================
	a11y: Object.freeze({
		focusRing: {
			width: "2px",
			offset: "2px",
			color: "#059669",
		},
		skipLink: {
			offset: "16px",
		},
		touchTarget: {
			minWidth: "44px",
			minHeight: "44px",
		},
		contrast: {
			aaNormal: 4.5,
			aaLarge: 3,
			aaaNormal: 7,
			aaaLarge: 4.5,
		},
	}),

	// ============================================================================
	// COMPONENT-SPECIFIC OVERRIDES — Extend per component if needed
	// ============================================================================
	components: Object.freeze({
		button: {
			height: {
				sm: "32px",
				md: "40px",
				lg: "48px",
			},
			padding: {
				sm: "0 12px",
				md: "0 16px",
				lg: "0 24px",
			},
			gap: "8px",
		},
		input: {
			height: {
				sm: "32px",
				md: "40px",
				lg: "48px",
			},
			padding: "0 12px",
			placeholderOpacity: 0.5,
		},
		card: {
			padding: "1.5rem", // 24px
			gap: "1rem", // 16px
		},
		table: {
			cellPadding: "12px 16px",
			headHeight: "44px",
			rowHeight: "48px",
			rowHeightCompact: "40px",
		},
		modal: {
			maxWidth: "560px",
			maxHeight: "90vh",
			padding: "1.5rem",
		},
		toast: {
			maxWidth: "380px",
			padding: "1rem",
			gap: "0.75rem",
		},
	}),
})

/**
 * Generate CSS Custom Properties for runtime theming.
 * Call once at app bootstrap (main.js).
 */
export function generateCSSVariables(prefix = "dy") {
	const cssVars = {}
	const flat = flattenTokens(tokens)

	for (const [key, value] of Object.entries(flat)) {
		cssVars[`--${prefix}-${key}`] = value
	}

	return cssVars
}

/**
 * Flatten nested token object to dot-notation keys.
 * @param {Object} obj
 * @param {string} prefix
 * @returns {Record<string, string>}
 */
function flattenTokens(obj, prefix = "") {
	const result = {}
	for (const [key, value] of Object.entries(obj)) {
		const newKey = prefix ? `${prefix}-${key}` : key
		if (value && typeof value === "object" && !Array.isArray(value)) {
			Object.assign(result, flattenTokens(value, newKey))
		} else {
			result[newKey] = value
		}
	}
	return result
}

/**
 * Apply CSS variables to document root.
 * @param {string} prefix
 */
export function applyCSSVariables(prefix = "dy") {
	if (typeof document === "undefined") return
	const vars = generateCSSVariables(prefix)
	for (const [key, value] of Object.entries(vars)) {
		document.documentElement.style.setProperty(key, value)
	}
}

/**
 * Get token value by dot-notation path.
 * @param {string} path - e.g., "color.brand.500"
 * @param {any} fallback
 * @returns {any}
 */
export function getToken(path, fallback = undefined) {
	const keys = path.split(".")
	let current = tokens
	for (const key of keys) {
		if (current && typeof current === "object" && key in current) {
			current = current[key]
		} else {
			return fallback
		}
	}
	return current
}

export default tokens
