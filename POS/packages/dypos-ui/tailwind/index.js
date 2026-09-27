/**
 * DyPOS Tailwind preset.
 *
 * The POS design system (POS/src/styles/dypos/*) already owns colour, radius,
 * shadow, spacing and motion tokens as CSS variables, and
 * POS/tailwind.config.js maps them into Tailwind. This preset therefore only
 * adds what a preset is uniquely responsible for:
 *
 *  - dark mode driven by the app's own `[data-theme="dark"]` attribute
 *    (not the OS `prefers-color-scheme`), so a cashier can force light mode on
 *    a sun-lit terminal and the choice persists offline;
 *  - the `@tailwindcss/forms` reset, which the native form controls rely on for
 *    a consistent baseline.
 *
 * It intentionally does NOT ship a second colour palette.
 */
import forms from "@tailwindcss/forms"

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["selector", '[data-theme="dark"]'],
	plugins: [forms],
}
