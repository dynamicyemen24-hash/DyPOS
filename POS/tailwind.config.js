// =============================================================================
// DyPOS Design System v2.0 — Custom Brand Identity
// =============================================================================
import frappeUIPreset from "frappe-ui/tailwind"

// ============================================================================
// BRAND COLORS — CSS Variable driven (themeable at runtime)
// ============================================================================

const brand = {
	50: "var(--dy-brand-50)",
	100: "var(--dy-brand-100)",
	200: "var(--dy-brand-200)",
	300: "var(--dy-brand-300)",
	400: "var(--dy-brand-400)",
	500: "var(--dy-brand-500)",
	600: "var(--dy-brand-600)",
	700: "var(--dy-brand-700)",
	800: "var(--dy-brand-800)",
	900: "var(--dy-brand-900)",
	950: "var(--dy-brand-950)",
}

const accent = {
	50: "var(--dy-accent-50)",
	100: "var(--dy-accent-100)",
	200: "var(--dy-accent-200)",
	300: "var(--dy-accent-300)",
	400: "var(--dy-accent-400)",
	500: "var(--dy-accent-500)",
	600: "var(--dy-accent-600)",
	700: "var(--dy-accent-700)",
	800: "var(--dy-accent-800)",
	900: "var(--dy-accent-900)",
	950: "var(--dy-accent-950)",
}

// Semantic colors via CSS variables
const semantic = {
	primary: "var(--dy-primary)",
	"primary-hover": "var(--dy-primary-hover)",
	"primary-active": "var(--dy-primary-active)",
	"primary-disabled": "var(--dy-primary-disabled)",
	secondary: "var(--dy-secondary)",
	"secondary-hover": "var(--dy-secondary-hover)",
	"secondary-active": "var(--dy-secondary-active)",
	danger: "var(--dy-danger)",
	"danger-hover": "var(--dy-danger-hover)",
	"danger-active": "var(--dy-danger-active)",
	accent: "var(--dy-accent)",
	"accent-hover": "var(--dy-accent-hover)",
	"accent-active": "var(--dy-accent-active)",
	success: "var(--dy-success)",
	"success-soft": "var(--dy-success-soft)",
	warning: "var(--dy-warning)",
	"warning-soft": "var(--dy-warning-soft)",
	info: "var(--dy-info)",
	"info-soft": "var(--dy-info-soft)",

	// Backgrounds
	bg: "var(--dy-bg)",
	"bg-raised": "var(--dy-bg-raised)",
	"bg-overlay": "var(--dy-bg-overlay)",
	"bg-sunken": "var(--dy-bg-sunken)",

	// Surfaces
	surface: "var(--dy-surface)",
	"surface-hover": "var(--dy-surface-hover)",
	"surface-active": "var(--dy-surface-active)",

	// Text
	text: "var(--dy-text-primary)",
	"text-secondary": "var(--dy-text-secondary)",
	"text-muted": "var(--dy-text-muted)",
	"text-disabled": "var(--dy-text-disabled)",
	"text-inverse": "var(--dy-text-inverse)",
	"text-on-primary": "var(--dy-text-on-primary)",
	"text-on-accent": "var(--dy-text-on-accent)",

	// Borders
	border: "var(--dy-border)",
	"border-strong": "var(--dy-border-strong)",
	"border-focus": "var(--dy-border-focus)",

	// Focus ring
	"focus-ring": "var(--dy-focus-ring)",
	"focus-ring-offset": "var(--dy-focus-ring-offset)",

	// Overlay
	"overlay-backdrop": "var(--dy-overlay-backdrop)",
	"overlay-scrim": "var(--dy-overlay-scrim)",
}

export default {
	presets: [frappeUIPreset],
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts,jsx,tsx}",
		"./node_modules/frappe-ui/src/components/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			colors: {
				// Brand scales
				brand,
				accent,

				// Legacy indigo mapping for frappe-ui compatibility
				indigo: brand,

				// Official brand name
				dypos: brand,

				// Semantic colors
				...semantic,

				// Status colors
				success: {
					DEFAULT: "var(--dy-success)",
					soft: "var(--dy-success-soft)",
				},
				warning: {
					DEFAULT: "var(--dy-warning)",
					soft: "var(--dy-warning-soft)",
				},
				danger: {
					DEFAULT: "var(--dy-danger)",
					soft: "var(--dy-danger-soft)",
				},
				info: {
					DEFAULT: "var(--dy-info)",
					soft: "var(--dy-info-soft)",
				},

				// Surface system
				surface: {
					DEFAULT: "var(--dy-surface)",
					hover: "var(--dy-surface-hover)",
					active: "var(--dy-surface-active)",
				},
			},
			fontFamily: {
				sans: "var(--dy-font-sans)",
				arabic: "var(--dy-font-arabic)",
				latin: "var(--dy-font-latin)",
				mono: "var(--dy-font-mono)",
				display: "var(--dy-font-display)",
				numbers: "var(--dy-font-numbers)",
			},
			fontSize: {
				"2xs": ["var(--dy-font-size-2xs-min)", { lineHeight: "var(--dy-font-size-2xs-line)", maxWidth: "var(--dy-font-size-2xs-max)" }],
				xs: ["var(--dy-font-size-xs-min)", { lineHeight: "var(--dy-font-size-xs-line)", maxWidth: "var(--dy-font-size-xs-max)" }],
				sm: ["var(--dy-font-size-sm-min)", { lineHeight: "var(--dy-font-size-sm-line)", maxWidth: "var(--dy-font-size-sm-max)" }],
				base: ["var(--dy-font-size-base-min)", { lineHeight: "var(--dy-font-size-base-line)", maxWidth: "var(--dy-font-size-base-max)" }],
				lg: ["var(--dy-font-size-lg-min)", { lineHeight: "var(--dy-font-size-lg-line)", maxWidth: "var(--dy-font-size-lg-max)" }],
				xl: ["var(--dy-font-size-xl-min)", { lineHeight: "var(--dy-font-size-xl-line)", maxWidth: "var(--dy-font-size-xl-max)" }],
				"2xl": ["var(--dy-font-size-2xl-min)", { lineHeight: "var(--dy-font-size-2xl-line)", maxWidth: "var(--dy-font-size-2xl-max)" }],
				"3xl": ["var(--dy-font-size-3xl-min)", { lineHeight: "var(--dy-font-size-3xl-line)", maxWidth: "var(--dy-font-size-3xl-max)" }],
				"4xl": ["var(--dy-font-size-4xl-min)", { lineHeight: "var(--dy-font-size-4xl-line)", maxWidth: "var(--dy-font-size-4xl-max)" }],
				"5xl": ["var(--dy-font-size-5xl-min)", { lineHeight: "var(--dy-font-size-5xl-line)", maxWidth: "var(--dy-font-size-5xl-max)" }],
				"display-sm": ["var(--dy-font-size-display-sm-min)", { lineHeight: "var(--dy-font-size-display-sm-line)", maxWidth: "var(--dy-font-size-display-sm-max)" }],
				"display-md": ["var(--dy-font-size-display-md-min)", { lineHeight: "var(--dy-font-size-display-md-line)", maxWidth: "var(--dy-font-size-display-md-max)" }],
				"display-lg": ["var(--dy-font-size-display-lg-min)", { lineHeight: "var(--dy-font-size-display-lg-line)", maxWidth: "var(--dy-font-size-display-lg-max)" }],
			},
			lineHeight: {
				tight: "var(--dy-line-height-tight)",
				snug: "var(--dy-line-height-snug)",
				normal: "var(--dy-line-height-normal)",
				relaxed: "var(--dy-line-height-relaxed)",
				loose: "var(--dy-line-height-loose)",
				arabic: "var(--dy-line-height-arabic)",
			},
			letterSpacing: {
				tighter: "var(--dy-letter-spacing-tighter)",
				tight: "var(--dy-letter-spacing-tight)",
				normal: "var(--dy-letter-spacing-normal)",
				wide: "var(--dy-letter-spacing-wide)",
				wider: "var(--dy-letter-spacing-wider)",
				widest: "var(--dy-letter-spacing-widest)",
				arabic: "var(--dy-letter-spacing-arabic)",
			},
			spacing: {
				px: "var(--dy-spacing-px)",
				0.5: "var(--dy-spacing-0_5)",
				1: "var(--dy-spacing-1)",
				1.5: "var(--dy-spacing-1_5)",
				2: "var(--dy-spacing-2)",
				2.5: "var(--dy-spacing-2_5)",
				3: "var(--dy-spacing-3)",
				3.5: "var(--dy-spacing-3_5)",
				4: "var(--dy-spacing-4)",
				5: "var(--dy-spacing-5)",
				6: "var(--dy-spacing-6)",
				7: "var(--dy-spacing-7)",
				8: "var(--dy-spacing-8)",
				9: "var(--dy-spacing-9)",
				10: "var(--dy-spacing-10)",
				11: "var(--dy-spacing-11)",
				12: "var(--dy-spacing-12)",
				14: "var(--dy-spacing-14)",
				16: "var(--dy-spacing-16)",
				20: "var(--dy-spacing-20)",
				24: "var(--dy-spacing-24)",
				28: "var(--dy-spacing-28)",
				32: "var(--dy-spacing-32)",
			},
			borderRadius: {
				none: "var(--dy-radius-none)",
				xs: "var(--dy-radius-xs)",
				sm: "var(--dy-radius-sm)",
				DEFAULT: "var(--dy-radius-sm)",
				md: "var(--dy-radius-md)",
				lg: "var(--dy-radius-lg)",
				xl: "var(--dy-radius-xl)",
				"2xl": "var(--dy-radius-2xl)",
				"3xl": "var(--dy-radius-3xl)",
				full: "var(--dy-radius-full)",
				pill: "var(--dy-radius-pill)",
			},
			boxShadow: {
				0: "var(--dy-elevation-0)",
				1: "var(--dy-elevation-1)",
				2: "var(--dy-elevation-2)",
				3: "var(--dy-elevation-3)",
				4: "var(--dy-elevation-4)",
				5: "var(--dy-elevation-5)",
				6: "var(--dy-elevation-6)",
				"brand-1": "var(--dy-elevation-brand-1)",
				"brand-2": "var(--dy-elevation-brand-2)",
				"brand-3": "var(--dy-elevation-brand-3)",
				"accent-1": "var(--dy-elevation-accent-1)",
				"accent-2": "var(--dy-elevation-accent-2)",
				inner: "var(--dy-elevation-inner)",
			},
			transitionTimingFunction: {
				DEFAULT: "var(--dy-ease-standard)",
				spring: "var(--dy-ease-spring)",
				"spring-gentle": "var(--dy-ease-spring-gentle)",
				"spring-playful": "var(--dy-ease-spring-playful)",
			},
			transitionDuration: {
				instant: "var(--dy-dur-instant)",
				whisper: "var(--dy-dur-whisper)",
				fast: "var(--dy-dur-fast)",
				DEFAULT: "var(--dy-dur-normal)",
				slow: "var(--dy-dur-slow)",
				slower: "var(--dy-dur-slower)",
				slowest: "var(--dy-dur-slowest)",
			},
			zIndex: {
				base: "var(--dy-z-base)",
				dropdown: "var(--dy-z-dropdown)",
				sticky: "var(--dy-z-sticky)",
				header: "var(--dy-z-header)",
				modal: "var(--dy-z-modal)",
				popover: "var(--dy-z-popover)",
				tooltip: "var(--dy-z-tooltip)",
				toast: "var(--dy-z-toast)",
				skipLink: "var(--dy-z-skip-link)",
			},
			minHeight: {
				touch: "var(--dy-touch-min)",
				"touch-comfort": "var(--dy-touch-comfort)",
			},
			minWidth: {
				touch: "var(--dy-touch-min)",
				"touch-comfort": "var(--dy-touch-comfort)",
			},
			animation: {
				"dy-fade-in": "dyFadeIn var(--dy-dur-normal) var(--dy-ease-standard)",
				"dy-fade-out": "dyFadeOut var(--dy-dur-fast) var(--dy-ease-standard)",
				"dy-slide-up": "dySlideUp var(--dy-dur-normal) var(--dy-ease-standard)",
				"dy-slide-down": "dySlideDown var(--dy-dur-normal) var(--dy-ease-standard)",
				"dy-scale-in": "dyScaleIn var(--dy-dur-fast) var(--dy-ease-spring)",
				"dy-scale-out": "dyScaleOut var(--dy-dur-fast) var(--dy-ease-standard)",
				"dy-spin": "dySpin 1s linear infinite",
				"dy-pulse": "dyPulse 2s var(--dy-ease-standard) infinite",
				"dy-bounce": "dyBounce 1s var(--dy-ease-spring) infinite",
			},
			keyframes: {
				dyFadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
				dyFadeOut: { "0%": { opacity: "1" }, "100%": { opacity: "0" } },
				dySlideUp: { "0%": { transform: "translateY(10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
				dySlideDown: { "0%": { transform: "translateY(-10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
				dyScaleIn: { "0%": { transform: "scale(0.95)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
				dyScaleOut: { "0%": { transform: "scale(1)", opacity: "1" }, "100%": { transform: "scale(0.95)", opacity: "0" } },
				dySpin: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
				dyPulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
				dyBounce: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
			},
		},
	},
	plugins: [],
}