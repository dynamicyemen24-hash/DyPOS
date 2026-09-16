// =============================================================================
// DyPOS Design System v1.0 — جسر الهوية إلى Tailwind
// =============================================================================
import frappeUIPreset from "frappe-ui/tailwind"

// فرض الهوية: يُعاد ربط سلم indigo (الأكثر استخدامًا في الكود القائم) وسلم
// dypos الرسمي بقيم متغيّرة --dy-brand-*، فتتعرف الواجهة على الأكسنت المختار
// تلقائيًا وكلاسيًا بدون إعادة بناء. الرموز الدلالية تُستهلك من --dy-* مباشرة.
// =============================================================================
const dyposBrand = {
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
				// فرض الهوية: indigo → DyPOS Brand بالكامل
				indigo: dyposBrand,
				// سلم الهوية الرسمي تحت اسم dypos
				dypos: dyposBrand,
				mint: {
					50: "#ecfdf5",
					100: "#d1fae5",
					200: "#a7f3d0",
					300: "#6ee7b7",
					400: "#34d399",
					500: "#10b981",
					600: "#059669",
					700: "#047857",
					800: "#065f46",
					900: "#064e3b",
					950: "#022c22",
				},
				// رموز دلالية مرتبطة بطبقة الثيمات (فاتح/داكن تلقائيًا)
				dy: {
					bg: "var(--dy-bg)",
					"bg-sunken": "var(--dy-bg-sunken)",
					"bg-elevated": "var(--dy-bg-elevated)",
					surface: "var(--dy-surface)",
					"surface-hover": "var(--dy-surface-hover)",
					text: "var(--dy-text)",
					"text-secondary": "var(--dy-text-secondary)",
					"text-muted": "var(--dy-text-muted)",
					border: "var(--dy-border)",
					"border-strong": "var(--dy-border-strong)",
					primary: "var(--dy-primary)",
					"primary-soft": "var(--dy-primary-soft)",
					success: "var(--dy-success)",
					"success-soft": "var(--dy-success-soft)",
					danger: "var(--dy-danger)",
					"danger-soft": "var(--dy-danger-soft)",
					warning: "var(--dy-warning)",
					"warning-soft": "var(--dy-warning-soft)",
					info: "var(--dy-info)",
					"info-soft": "var(--dy-info-soft)",
				},
			},
			fontFamily: {
				sans: "var(--dy-font-sans)",
				arabic: "var(--dy-font-arabic)",
				english: "var(--dy-font-english)",
				mono: "var(--dy-font-mono)",
			},
			borderRadius: {
				// سلّم الاستدارة الموحد من نظام DyPOS
				xs: "var(--dy-radius-xs)",
				sm: "var(--dy-radius-sm)",
				DEFAULT: "var(--dy-radius-sm)",
				md: "var(--dy-radius-md)",
				lg: "var(--dy-radius-lg)",
				xl: "var(--dy-radius-xl)",
				"2xl": "var(--dy-radius-2xl)",
			},
			boxShadow: {
				// سلّم الارتفاع الموحد
				"dy-1": "var(--dy-elevation-1)",
				"dy-2": "var(--dy-elevation-2)",
				"dy-3": "var(--dy-elevation-3)",
				"dy-4": "var(--dy-elevation-4)",
				"dy-5": "var(--dy-elevation-5)",
				"dy-brand": "var(--dy-glow-brand)",
				"dy-mint": "var(--dy-glow-mint)",
				"dy-crimson": "var(--dy-glow-crimson)",
			},
			transitionTimingFunction: {
				dy: "var(--dy-ease-standard)",
				"dy-spring": "var(--dy-ease-spring)",
			},
			transitionDuration: {
				dy: "var(--dy-dur-base)",
			},
			zIndex: {
				// سلّم الطبقات الموحد
				"dy-sticky": "var(--dy-z-sticky)",
				"dy-nav": "var(--dy-z-nav)",
				"dy-menu": "var(--dy-z-menu)",
				"dy-popover": "var(--dy-z-popover)",
				"dy-overlay": "var(--dy-z-overlay)",
				"dy-modal": "var(--dy-z-modal)",
				"dy-toast": "var(--dy-z-toast)",
			},
			minHeight: {
				touch: "var(--dy-touch-min)",
				"touch-comfort": "var(--dy-touch-comfort)",
			},
		},
	},
	plugins: [],
}
