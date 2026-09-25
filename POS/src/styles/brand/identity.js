/**
 * DyPOS Brand Identity — Custom Design System
 *
 * A unique, Arabic-first identity for DyPOS.
 * No generic icons, no consumed patterns — everything custom.
 */

// ============================================================================
// BRAND COLOR PALETTE — Unique to DyPOS
// ============================================================================

export const brandColors = Object.freeze({
	// Core brand — Deep teal with gold accent (heritage + modernity)
	// Primary: #0D6E6E — Deep petroleum teal (trust, stability)
	// Accent: #C8A951 — Warm desert gold (premium, heritage)
	// Supporting: Warm neutrals with subtle teal undertones

	primary: {
		50: "#E6F2F2",
		100: "#CCE5E5",
		200: "#99CBCB",
		300: "#66B2B2",
		400: "#339999",
		500: "#0D8080",   // Primary brand
		600: "#0D6E6E",   // Primary hover (core)
		700: "#0A5252",
		800: "#083C3C",
		900: "#052626",
		950: "#031313",
	},

	accent: {
		50: "#FDF8F0",
		100: "#FAF0DD",
		200: "#F4E1BB",
		300: "#EDD299",
		400: "#E6C377",
		500: "#DFB455",   // Accent base
		600: "#C8A951",   // Accent hover (core gold)
		700: "#A08841",
		800: "#786631",
		900: "#503318",
		950: "#281A0C",
	},

	// Semantic surface colors — warm neutral with teal undertone
	surface: {
		base: "#FEFEFE",        // Pure white
		raised: "#FFFFFF",      // Cards, modals
		overlay: "#F7FAFA",     // Subtle teal tint
		sunken: "#EEF2F2",      // Input backgrounds
		border: "#D5DBDB",      // Dividers
		borderStrong: "#B8C4C4", // Stronger borders
		borderFocus: "#0D6E6E",  // Focus rings
	},

	// Text colors — high contrast, warm undertones
	text: {
		primary: "#0F1A1A",      // Near black with teal
		secondary: "#2D3A3A",    // Body text
		muted: "#5A6E6E",        // Captions, placeholders
		disabled: "#8A9E9E",     // Disabled
		inverse: "#FFFFFF",      // On dark surfaces
		link: "#0D6E6E",         // Links
		linkHover: "#0A5252",
		linkVisited: "#5A3D8A",  // Purple-teal for visited
		onAccent: "#1A1508",     // On gold backgrounds
		onPrimary: "#FFFFFF",    // On teal backgrounds
	},

	// Status colors — unique to DyPOS palette
	status: {
		info: {
			bg: "#E8F4F8",
			border: "#B8DBE8",
			text: "#155E7A",
			icon: "#2A94B8",
			weak: "#D0E8F0",
		},
		success: {
			bg: "#EAF5E8",
			border: "#B8D8B8",
			text: "#1E5A1E",
			icon: "#2E8B2E",
			weak: "#D4E8D4",
		},
		warning: {
			bg: "#FDF6E3",
			border: "#E8D0A0",
			text: "#7A5C0A",
			icon: "#C8A02A",
			weak: "#F4E8C8",
		},
		danger: {
			bg: "#FDE8E8",
			border: "#E8B8B8",
			text: "#8A1E1E",
			icon: "#C82A2A",
			weak: "#F4D0D0",
		},
	},

	// Interactive states
	interactive: {
		primary: {
			bg: "#0D6E6E",
			bgHover: "#0A5252",
			bgActive: "#083C3C",
			bgDisabled: "#99CBCB",
			text: "#FFFFFF",
			textDisabled: "#E6F2F2",
		},
		secondary: {
			bg: "transparent",
			bgHover: "#EEF2F2",
			bgActive: "#D5DBDB",
			bgDisabled: "transparent",
			text: "#2D3A3A",
			textDisabled: "#8A9E9E",
			border: "#D5DBDB",
			borderHover: "#0D6E6E",
		},
		ghost: {
			bg: "transparent",
			bgHover: "#EEF2F2",
			bgActive: "#D5DBDB",
			text: "#2D3A3A",
			textDisabled: "#8A9E9E",
		},
		danger: {
			bg: "#C82A2A",
			bgHover: "#A82222",
			bgActive: "#881A1A",
			bgDisabled: "#E8B8B8",
			text: "#FFFFFF",
		},
		accent: {
			bg: "#C8A951",
			bgHover: "#B09447",
			bgActive: "#807033",
			bgDisabled: "#E8D8BB",
			text: "#1A1508",
			textDisabled: "#5A4A18",
		},
	},

	// Focus rings
	focus: {
		ring: "#0D6E6E",
		ringOffset: "#FFFFFF",
		ringWidth: "2px",
		ringOffsetWidth: "2px",
		ringAccent: "#C8A951",
	},

	// Overlays
	overlay: {
		backdrop: "rgba(15, 26, 26, 0.45)",
		scrim: "rgba(0, 0, 0, 0.55)",
	},

	// Chart/visualization palette — colorblind safe
	chart: [
		"#0D6E6E", // Teal
		"#C8A951", // Gold
		"#2A94B8", // Sky
		"#8B5E3C", // Terracotta
		"#5A7A5A", // Sage
		"#B85C3C", // Rust
		"#3C6E6E", // Deep teal
		"#A08841", // Brass
	],
});

// ============================================================================
// TYPOGRAPHY — Custom Arabic/Latin pairing
// ============================================================================

export const typography = Object.freeze({
	// Font families — Unique pairing for DyPOS
	fontFamily: {
		// Arabic: Custom Cairo variable with custom weight tuning
		// Latin: Custom Inter variant with Arabic-aware metrics
		// Numbers: Tabular figures for POS amounts
		sans: "'DyPOS Arabic', 'Cairo Variable', 'Noto Sans Arabic', system-ui, sans-serif",
		sansLatin: "'DyPOS Latin', 'Inter Variable', 'Inter', system-ui, sans-serif",
		mono: "'DyPOS Mono', 'JetBrains Mono Variable', 'Fira Code', monospace",
		numbers: "'DyPOS Numbers', 'Cairo Variable', 'Tabular-nums', monospace",
		// Display: Larger headings with custom weight
		display: "'DyPOS Display', 'Cairo Variable', system-ui, sans-serif",
	},

	// Custom weight scale — optimized for Arabic
	fontWeight: {
		thin: 100,
		extralight: 200,
		light: 300,
		normal: 400,
		medium: 500,
		semibold: 600,
		bold: 700,
		extrabold: 800,
		black: 900,
		// Arabic-specific: visual weight differs from Latin
		arabicNormal: 400,
		arabicMedium: 500,
		arabicBold: 700,
	},

	// Fluid type scale — Arabic-aware line heights
	fontSize: {
		// Mobile-first fluid scaling
		"2xs": { min: "0.625rem", max: "0.6875rem", lineHeight: 1.5 }, // 10-11px
		xs: { min: "0.70rem", max: "0.75rem", lineHeight: 1.5 },      // 11-12px
		sm: { min: "0.81rem", max: "0.875rem", lineHeight: 1.6 },     // 13-14px
		base: { min: "0.94rem", max: "1rem", lineHeight: 1.7 },       // 15-16px
		lg: { min: "1.06rem", max: "1.125rem", lineHeight: 1.7 },     // 17-18px
		xl: { min: "1.25rem", max: "1.25rem", lineHeight: 1.6 },      // 20px
		"2xl": { min: "1.5rem", max: "1.5rem", lineHeight: 1.5 },     // 24px
		"3xl": { min: "1.875rem", max: "1.875rem", lineHeight: 1.4 }, // 30px
		"4xl": { min: "2.25rem", max: "2.25rem", lineHeight: 1.3 },   // 36px
		"5xl": { min: "3rem", max: "3rem", lineHeight: 1.2 },         // 48px
		// Display sizes
		"display-sm": { min: "2.5rem", max: "3rem", lineHeight: 1.2 },
		"display-md": { min: "3.5rem", max: "4rem", lineHeight: 1.15 },
		"display-lg": { min: "4.5rem", max: "5rem", lineHeight: 1.1 },
	},

	lineHeight: {
		none: 1,
		tight: 1.2,
		snug: 1.35,
		normal: 1.7,
		relaxed: 1.85,
		loose: 2,
		// Arabic needs more leading
		arabicTight: 1.4,
		arabicNormal: 1.8,
		arabicRelaxed: 2.1,
	},

	letterSpacing: {
		tighter: "-0.03em",
		tight: "-0.015em",
		normal: "0",
		wide: "0.02em",
		wider: "0.04em",
		widest: "0.08em",
		// Arabic: slightly wider for readability
		arabicNormal: "0.01em",
		arabicWide: "0.03em",
	},
});

// ============================================================================
// SPACING — 4px base, musical scale
// ============================================================================

export const spacing = Object.freeze({
	0: "0",
	px: "1px",
	0.5: "0.125rem",  // 2px
	1: "0.25rem",     // 4px
	1.5: "0.375rem",  // 6px
	2: "0.5rem",      // 8px
	2.5: "0.625rem",  // 10px
	3: "0.75rem",     // 12px
	3.5: "0.875rem",  // 14px
	4: "1rem",        // 16px
	5: "1.25rem",     // 20px
	6: "1.5rem",      // 24px
	7: "1.75rem",     // 28px
	8: "2rem",        // 32px
	9: "2.25rem",     // 36px
	10: "2.5rem",     // 40px
	11: "2.75rem",    // 44px
	12: "3rem",       // 48px
	14: "3.5rem",     // 56px
	16: "4rem",       // 64px
	20: "5rem",       // 80px
	24: "6rem",       // 96px
	28: "7rem",       // 112px
	32: "8rem",       // 128px
});

// ============================================================================
// RADIUS — Organic, friendly
// ============================================================================

export const radius = Object.freeze({
	none: "0",
	xs: "0.125rem",   // 2px
	sm: "0.25rem",    // 4px
	md: "0.375rem",   // 6px
	lg: "0.5rem",     // 8px
	xl: "0.75rem",    // 12px
	"2xl": "1rem",    // 16px
	"3xl": "1.5rem",  // 24px
	full: "9999px",
	// Organic shapes
	pill: "9999px",
	blob: "60% 40% 30% 70% / 60% 30% 70% 40%",
});

// ============================================================================
// ELEVATION — Layered, soft shadows with teal tint
// ============================================================================

export const elevation = Object.freeze({
	0: "none",
	1: "0 1px 2px 0 rgba(13, 38, 38, 0.04)",
	2: "0 1px 3px 0 rgba(13, 38, 38, 0.08), 0 1px 2px -1px rgba(13, 38, 38, 0.08)",
	3: "0 4px 6px -1px rgba(13, 38, 38, 0.08), 0 2px 4px -2px rgba(13, 38, 38, 0.08)",
	4: "0 10px 15px -3px rgba(13, 38, 38, 0.08), 0 4px 6px -4px rgba(13, 38, 38, 0.08)",
	5: "0 20px 25px -5px rgba(13, 38, 38, 0.08), 0 8px 10px -6px rgba(13, 38, 38, 0.08)",
	6: "0 25px 50px -12px rgba(13, 38, 38, 0.12)",
	// Colored elevations for brand moments
	brand: {
		1: "0 1px 2px 0 rgba(13, 110, 110, 0.15)",
		2: "0 4px 8px 0 rgba(13, 110, 110, 0.2)",
		3: "0 8px 16px 0 rgba(13, 110, 110, 0.25)",
	},
	accent: {
		1: "0 1px 2px 0 rgba(200, 169, 81, 0.2)",
		2: "0 4px 8px 0 rgba(200, 169, 81, 0.3)",
	},
	inner: "inset 0 2px 4px 0 rgba(13, 38, 38, 0.05)",
});

// ============================================================================
// MOTION — Personality-driven, respects reduced motion
// ============================================================================

export const motion = Object.freeze({
	duration: {
		instant: "0ms",
		whisper: "50ms",      // Micro-interactions
		fast: "120ms",        // Hover, simple transitions
		normal: "180ms",      // Standard transitions
		slow: "280ms",        // Modals, drawers
		slower: "400ms",      // Page transitions
		slowest: "600ms",     // Complex animations
	},
	easing: {
		linear: "linear",
		ease: "ease",
		// Brand easings — organic, confident
		easeOutBrand: "cubic-bezier(0.22, 1, 0.36, 1)",
		easeInBrand: "cubic-bezier(0.55, 0, 0.68, 0.55)",
		easeInOutBrand: "cubic-bezier(0.55, 0, 0.1, 1)",
		// Spring-like for delightful moments
		springGentle: "cubic-bezier(0.34, 1.3, 0.64, 1)",
		springPlayful: "cubic-bezier(0.25, 1.5, 0.5, 1)",
		// Standard
		easeOut: "cubic-bezier(0, 0, 0.2, 1)",
		easeIn: "cubic-bezier(0.4, 0, 1, 1)",
		easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
	},
	reduced: {
		duration: "0.01ms",
		easing: "linear",
	},
});

// ============================================================================
// ICONS — Custom DyPOS icon system (not Feather)
// ============================================================================

export const icons = Object.freeze({
	size: {
		xs: "12px",
		sm: "16px",
		md: "20px",
		lg: "24px",
		xl: "32px",
		"2xl": "40px",
		"3xl": "48px",
		"4xl": "64px",
	},
	strokeWidth: {
		hairline: 1,
		thin: 1.5,
		normal: 2,
		medium: 2.25,
		thick: 2.5,
		bold: 3,
	},
	// Visual style
	style: {
		corner: "round",      // Rounded corners
		cap: "round",         // Rounded caps
		join: "round",        // Rounded joins
		// Optical adjustments for Arabic context
		arabicAdjust: true,
	},
});

// ============================================================================
// ILLUSTRATIONS — Custom style for empty/loading/error states
// ============================================================================

export const illustrations = Object.freeze({
	// Color palette for illustrations
	palette: {
		primary: "#0D6E6E",
		secondary: "#C8A951",
		tertiary: "#2A94B8",
		quaternary: "#8B5E3C",
		neutral: "#8A9E9E",
		background: "#F7FAFA",
		surface: "#FFFFFF",
	},
	// Stroke weights
	stroke: {
		hairline: 1,
		thin: 1.5,
		normal: 2,
		thick: 2.5,
		bold: 3,
	},
	// Corner radius for illustrated shapes
	corner: {
		sharp: 0,
		soft: 4,
		medium: 8,
		round: 16,
		full: 9999,
	},
	// Character proportions (for human illustrations)
	character: {
		headBodyRatio: 1/3.5,
		limbThickness: "medium",
		style: "geometric-friendly",
	},
});

// ============================================================================
// BREAKPOINTS — Mobile-first
// ============================================================================

export const breakpoints = Object.freeze({
	xs: "0",
	sm: "640px",
	md: "768px",
	lg: "1024px",
	xl: "1280px",
	"2xl": "1440px",
	"3xl": "1600px",
});

// ============================================================================
// LAYOUT — Containers, grids
// ============================================================================

export const layout = Object.freeze({
	container: {
		sm: "640px",
		md: "768px",
		lg: "1024px",
		xl: "1280px",
		"2xl": "1400px",
		"3xl": "1600px",
		full: "100%",
	},
	sidebar: {
		width: "288px",
		collapsed: "80px",
		mobile: "320px",
	},
	header: {
		height: "64px",
		heightMobile: "56px",
	},
	toolbar: {
		height: "56px",
		heightDense: "48px",
	},
	contentMaxWidth: "1400px",
	contentPadding: "1.5rem",
	contentPaddingMobile: "1rem",
});

// ============================================================================
// GRID — 12-column
// ============================================================================

export const grid = Object.freeze({
	columns: 12,
	gutter: "1.5rem",
	gutterSm: "1rem",
	breakpoints: {
		xs: "0",
		sm: "640px",
		md: "768px",
		lg: "1024px",
		xl: "1280px",
		"2xl": "1440px",
	},
});

// ============================================================================
// DENSITY — Compact / Comfortable / Spacious
// ============================================================================

export const density = Object.freeze({
	compact: {
		spacingMultiplier: 0.7,
		fontSizeMultiplier: 0.875,
		controlHeight: "30px",
		iconSize: "16px",
	},
	comfortable: {
		spacingMultiplier: 1,
		fontSizeMultiplier: 1,
		controlHeight: "40px",
		iconSize: "20px",
	},
	spacious: {
		spacingMultiplier: 1.3,
		fontSizeMultiplier: 1.1,
		controlHeight: "48px",
		iconSize: "24px",
	},
});

// ============================================================================
// Z-INDEX
// ============================================================================

export const zIndex = Object.freeze({
	base: 0,
	dropdown: 100,
	sticky: 200,
	header: 300,
	modal: 400,
	popover: 500,
	tooltip: 600,
	toast: 700,
	skipLink: 9999,
});

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transition = Object.freeze({
	whisper: "all 50ms ease",
	fast: "all 120ms ease",
	normal: "all 180ms ease",
	slow: "all 280ms ease",
	slower: "all 400ms ease",
	colors: "background-color 180ms ease, color 180ms ease, border-color 180ms ease",
	transform: "transform 180ms ease",
	opacity: "opacity 180ms ease",
	shadow: "box-shadow 180ms ease",
});

// ============================================================================
// BORDERS
// ============================================================================

export const border = Object.freeze({
	width: {
		hairline: "1px",
		thin: "1px",
		normal: "1px",
		thick: "2px",
		heavy: "3px",
	},
	style: "solid",
});

// ============================================================================
// ACCESSIBILITY — WCAG 2.2 AA
// ============================================================================

export const a11y = Object.freeze({
	focusRing: {
		width: "2px",
		offset: "2px",
		color: "#0D6E6E",
	},
	skipLink: {
		offset: "16px",
	},
	touchTarget: {
		minWidth: "48px",
		minHeight: "48px",
	},
	contrast: {
		aaNormal: 4.5,
		aaLarge: 3,
		aaaNormal: 7,
		aaaLarge: 4.5,
	},
});

// ============================================================================
// COMPONENT DEFAULTS
// ============================================================================

export const components = Object.freeze({
	button: {
		height: {
			xs: "28px",
			sm: "32px",
			md: "40px",
			lg: "48px",
			xl: "56px",
		},
		padding: {
			xs: "0 10px",
			sm: "0 12px",
			md: "0 18px",
			lg: "0 24px",
			xl: "0 32px",
		},
		gap: "8px",
		fontWeight: 600,
		letterSpacing: "0.01em",
	},
	input: {
		height: {
			xs: "28px",
			sm: "32px",
			md: "40px",
			lg: "48px",
			xl: "56px",
		},
		padding: "0 12px",
		placeholderOpacity: 0.45,
		fontWeight: 400,
	},
	card: {
		padding: "1.5rem",
		gap: "1rem",
	},
	table: {
		cellPadding: "12px 16px",
		headHeight: "48px",
		rowHeight: "52px",
		rowHeightCompact: "44px",
	},
	modal: {
		maxWidth: "560px",
		maxHeight: "90vh",
		padding: "1.5rem",
	},
	toast: {
		maxWidth: "400px",
		padding: "1rem 1.25rem",
		gap: "0.75rem",
	},
	select: {
		height: {
			xs: "28px",
			sm: "32px",
			md: "40px",
			lg: "48px",
		},
		optionHeight: "36px",
	},
	tabs: {
		height: "48px",
		indicatorHeight: "3px",
		indicatorColor: "#0D6E6E",
	},
	avatar: {
		size: {
			xs: "24px",
			sm: "32px",
			md: "40px",
			lg: "56px",
			xl: "72px",
			"2xl": "96px",
		},
	},
	badge: {
		height: "20px",
		padding: "0 8px",
		fontSize: "0.6875rem",
		fontWeight: 600,
	},
	tooltip: {
		maxWidth: "280px",
		padding: "8px 12px",
		fontSize: "0.8125rem",
	},
	dropdown: {
		minWidth: "200px",
		maxWidth: "360px",
		itemHeight: "40px",
		itemPadding: "0 12px",
	},
	progress: {
		height: "6px",
		borderRadius: "full",
	},
	slider: {
		trackHeight: "4px",
		thumbSize: "18px",
		thumbBorder: "3px",
	},
	toggle: {
		width: "44px",
		height: "24px",
		thumbSize: "18px",
	},
});

// ============================================================================
// EXPORT ALL TOKENS
// ============================================================================

export const tokens = Object.freeze({
	color: brandColors,
	typography,
	spacing,
	radius,
	elevation,
	motion,
	icons,
	illustrations,
	breakpoints,
	layout,
	grid,
	density,
	zIndex,
	transition,
	border,
	a11y,
	components,
});

/**
 * Generate CSS Custom Properties for runtime theming.
 */
export function generateCSSVariables(prefix = "dy") {
	const cssVars = {}
	const flat = flattenTokens(tokens)
	for (const [key, value] of Object.entries(flat)) {
		cssVars[`--${prefix}-${key}`] = value
	}
	return cssVars
}

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

export function applyCSSVariables(prefix = "dy") {
	if (typeof document === "undefined") return
	const vars = generateCSSVariables(prefix)
	for (const [key, value] of Object.entries(vars)) {
		document.documentElement.style.setProperty(key, value)
	}
}

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