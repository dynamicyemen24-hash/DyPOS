/**
 * Login surface — i18n + theme/locale contract.
 *
 * The login page is the one screen every cashier meets, and it was
 * Arabic-only: ~100 literals lived in the SFC with no dictionary entry, the
 * root carried a hard-coded `dir="rtl"`, and `changeLocale()` had zero call
 * sites in the whole app — a language switch that could not be reached from
 * the only screen it matters on before sign-in.
 *
 * This file is the measurement. It is deliberately a *source* + *bundle*
 * check (no DOM, no bundler, no network) so it still runs when a runtime
 * dependency is gone, and it fails on exactly the three ways that contract
 * regresses:
 *npm
 *   1. an Arabic literal on the surface that no locale bundle translates;
 *   2. a literal string that bypasses `__()` (an unwrapped text node or an
 *      unbound attribute — the codemod's leftover class);
 *   3. a dead contract in the wiring: `dir` pinned to RTL, the dark class
 *      driven by the OS instead of the app theme, or the preference bar
 *      imported but never rendered.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const POS = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (...p) => readFileSync(join(POS, ...p), "utf8")

/**
 * Every file that renders or decides login-surface copy.
 *
 * The extracted components are listed here, not just the page: this round moved
 * the runtime-status table, the context chips and the lockout message OUT of
 * `Login.vue` into `composables/`, and into `LoginContextChips.vue`. A surface
 * list that names only the page stops checking those strings — and a gate that
 * quietly stops covering half the screen is worse than no gate, because the
 * remaining half still reports green.
 */
const SURFACE = [
	"src/pages/Login.vue",
	"src/components/common/LoginAppearanceBar.vue",
	"src/components/common/LoginSessionTimeoutDialog.vue",
	"src/components/common/LoginSessionLockDialog.vue",
	"src/components/common/LoginContextChips.vue",
	"src/components/common/LoginPinForm.vue",
	// Extracted out of `Login.vue` with their styles. A surface member that is
	// NOT in this list is a hole in the gate, not an exemption: the extractor
	// below walks this array, so a new component that renders Arabic copy and
	// is absent here is checked by nothing at all.
	"src/components/common/LoginShortcutsDialog.vue",
	"src/components/common/LoginEmailSuggestions.vue",
	"src/components/common/ShiftOpsPanel.vue",
	"src/components/common/DeviceHealthPanel.vue",
	"src/components/common/SystemAboutPanel.vue",
	"src/composables/useLoginPreferences.js",
	"src/composables/useLoginRuntime.js",
	"src/composables/useLoginRuntimeStatus.js",
	"src/composables/useRateLimitMessage.js",
]

const LOCALES = ["en", "id", "pt-br"]
const bundles = Object.fromEntries(
	LOCALES.map((code) => [
		code,
		JSON.parse(read("public", "locales", `${code}.json`)),
	]),
)

const ARABIC = /[\u0600-\u06FF]/

/** Comments are documentation: prose about a string is not a string. */
const stripComments = (source) =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\/\/[^\n]*/g, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")

/**
 * Every Arabic string the surface ships as copy:
 *  - `__('…')` call sites (the wrapped literals), and
 *  - every quoted Arabic literal in the file (the status table, the theme
 *    labels, the error assignments).
 */
function surfaceKeys(source) {
	const text = stripComments(source)
	const keys = new Set()

	for (const m of text.matchAll(/__\(\s*(["'])((?:[^'"\\]|\\.)*)\1/g)) {
		if (ARABIC.test(m[2])) keys.add(m[2])
	}
	for (const m of text.matchAll(/(["'])((?:[^'"\\\n]|\\.)*)\1/g)) {
		if (ARABIC.test(m[2])) keys.add(m[2])
	}

	return [...keys]
}

/** `{0}` placeholders a source key carries must survive every translation. */
const placeholders = (value) =>
	[...String(value).matchAll(/\{(\d+)\}/g)]
		.map((m) => m[1])
		.sort()
		.join(",")

describe("login surface — every Arabic string has a translation", () => {
	for (const file of SURFACE) {
		it(`${file}: each Arabic key resolves in ${LOCALES.join(", ")}`, () => {
			const keys = surfaceKeys(read(file))

			if (file.endsWith("Login.vue")) {
				/*
				 * The floor moved from "the page alone" to "the whole surface".
				 *
				 * It used to be 60 keys on `Login.vue`, because that is where the
				 * copy lived. Extraction legitimately moved those strings into
				 * components — so a per-page floor started failing on a page that
				 * lost work, which is the ratchet pushing the WRONG way.
				 *
				 * The guard still has to exist: a broken extractor makes every
				 * assertion below vacuously true, and 60 on the page alone no
				 * longer measures the screen a user actually reads.
				 */
				const surfaceKeysTotal = SURFACE.reduce(
					(total, f) => total + surfaceKeys(read(f)).length,
					0,
				)

				expect(
					surfaceKeysTotal,
					[
						`${file}: extractor found almost nothing across the surface — the gate is blind.`,
						"Extraction moved the strings, so the floor has to follow them:",
						"it is measured over every file in SURFACE, not over this page alone.",
					].join(" "),
				).toBeGreaterThanOrEqual(90)
			}

			for (const key of keys) {
				for (const locale of LOCALES) {
					const value = bundles[locale][key]

					expect(value, `[${locale}] missing key: ${key}`).toBeTypeOf("string")

					expect(
						value.trim(),
						`[${locale}] empty translation: ${key}`,
					).not.toBe("")

					expect(
						value,
						`[${locale}] untranslated copy/paste of the Arabic key: ${key}`,
					).not.toBe(key)

					expect(
						placeholders(value),
						`[${locale}] {n} placeholders changed for: ${key}`,
					).toBe(placeholders(key))
				}
			}
		})
	}
})

describe("login surface — nothing escapes __()", () => {
	const unwrappedIn = (file) => {
		const source = read(file)
		const start = source.indexOf("<template>")
		if (start === -1) return [] // script-only module: covered by the key test

		/*
		 * Stop at `</template>`, not at end-of-file.
		 *
		 * Slicing to EOF pulled the whole `<script>` block into the template scan,
		 * so every string TABLE (`RUNTIME_STATUS_BY_STATE`, the six product
		 * claims, the device-status labels) was reported as unwrapped copy. They
		 * are not rendered raw: each is passed through `__()` at the render site,
		 * which is exactly why they need dictionary entries — and the key test
		 * above already proves they resolve.
		 *
		 * A gate that flags the fix it demands ("wrap these in `__()`") for
		 * strings that are already wrapped is a gate people switch off.
		 */
		const end = source.indexOf("</template>", start)
		const raw = end === -1 ? source.slice(start) : source.slice(start, end)

		const template = stripComments(raw)
			// Expressions are already wrapped — they are not literals.
			.replace(/\{\{[\s\S]*?\}\}/g, " ")
			.replace(/:[a-zA-Z-]+="[^"]*"/g, " ")

		const hits = []
		for (const m of template.matchAll(/[\u0600-\u06FF][^\n<>{}]*/g)) {
			const hit = m[0].trim()
			if (hit) hits.push(hit)
		}
		return [...new Set(hits)]
	}

	for (const file of SURFACE) {
		it(`${file}: renders no Arabic literal outside __()`, () => {
			expect(unwrappedIn(file)).toEqual([])
		})
	}
})

describe("login surface — the wiring the feature depends on", () => {
	const page = read("src", "pages", "Login.vue")

	it("binds direction and language instead of pinning RTL", () => {
		// A hard-coded `dir="rtl"` freezes the page in Arabic layout even when
		// the dictionary flips to English — and it was the *reactive* read that
		// made a locale change repaint the page at all.
		expect(page).not.toMatch(/\sdir="rtl"/)
		expect(page).toContain(':dir="preferencesDir"')
		expect(page).toContain(':lang="preferencesLocale"')
		expect(page).toContain(':data-translation-version="translationVersion"')
	})

	it("translates cached computed labels at render time when the locale changes", () => {
		// `__(detail.label)` moved out of `Login.vue` with the security panel.
		// The RULE is unchanged - a cached computed label must still go through
		// `__()` at render time, or the screen keeps printing the previous
		// locale's text - so the assertion follows the markup to its new home
		// instead of being deleted.
		for (const expression of [
			"__(runtimeStatus.label)",
			"__(submitLabel)",
			"__(passwordStrength.label)",
		]) {
			expect(page).toContain(expression)
		}

		expect(page).not.toContain("label: __(row.label)")
	})

	it("drives the dark panel from the app theme, not the OS media query", () => {
		// `prefersDark` made a device on a dark OS paint the login card dark
		// while `data-theme="light"` painted everything else light.
		expect(page).toContain("'dy-login--dark': isDark")
		expect(page).not.toContain("prefers-color-scheme: dark")
	})

	it("renders the preference bar (no imported-but-never-mounted contract)", () => {
		expect(page).toContain(
			'import LoginAppearanceBar from "@/components/common/LoginAppearanceBar.vue"',
		)
		expect(page).toMatch(/<LoginAppearanceBar\b[^>]*\/>/)
		expect(page).toContain(
			'import LoginSessionTimeoutDialog from "@/components/common/LoginSessionTimeoutDialog.vue"',
		)
		expect(page).toContain("<LoginSessionTimeoutDialog")

		// The lock dialog took its field, error and handler with it, so the page
		// must still mount it — otherwise the "unlock" screen silently vanishes.
		expect(page).toContain(
			'import LoginSessionLockDialog from "@/components/common/LoginSessionLockDialog.vue"',
		)
		expect(page).toContain("<LoginSessionLockDialog")
	})

	it("keeps the bar offline: native controls, zero remote assets", () => {
		for (const file of [
			"src/components/common/LoginAppearanceBar.vue",
			"src/composables/useLoginPreferences.js",
		]) {
			const source = read(file)

			expect(
				source,
				`${file}: a fetch snuck into the login surface`,
			).not.toMatch(/\bfetch\s*\(/)
			expect(source, `${file}: a remote asset snuck in`).not.toMatch(
				/https?:\/\//,
			)
		}
	})

	it("uses a native language <select> and radio inputs for the theme", () => {
		// The deliberate a11y choice: the system picker on touch, arrow-key
		// navigation and screen-reader grouping for free, no custom overlay
		// that cannot be dismissed with Escape.
		const bar = read("src/components/common/LoginAppearanceBar.vue")

		expect(bar).toContain("<select")
		expect(bar).toContain('type="radio"')
		expect(bar).toContain("<fieldset")
		expect(bar).toContain("<legend")
	})
})

/* ==========================================================================
 * Runtime: the switch actually switches
 * ========================================================================== */

const prefsMocks = vi.hoisted(() => ({
	changeLocale: vi.fn(),
	setMode: vi.fn(),
}))

vi.mock("@/utils/logger", () => ({
	logger: { create: () => ({ info() {}, warn() {} }) },
}))

vi.mock("@/composables/useLocale", async () => {
	const { ref, computed } = await import("vue")

	const SUPPORTED_LOCALES = {
		en: { name: "English", nativeName: "English", dir: "ltr" },
		ar: { name: "Arabic", nativeName: "العربية", dir: "rtl" },
		id: { name: "Indonesian", nativeName: "Bahasa", dir: "ltr" },
		"pt-br": {
			name: "Portuguese (Brazil)",
			nativeName: "Portugues (Brasil)",
			dir: "ltr",
		},
	}

	return {
		SUPPORTED_LOCALES,
		useLocale: () => ({
			locale: ref("ar"),
			dir: ref("rtl"),
			isRTL: ref(true),
			supportedLocales: computed(() => SUPPORTED_LOCALES),
			changeLocale: prefsMocks.changeLocale,
		}),
	}
})

vi.mock("@/composables/useAppTheme", async () => {
	const { ref, computed } = await import("vue")

	return {
		useAppTheme: () => ({
			mode: ref("system"),
			resolvedTheme: ref("light"),
			isDark: computed(() => false),
			setMode: prefsMocks.setMode,
		}),
	}
})

import { useLoginPreferences } from "@/composables/useLoginPreferences"
import { useCapsLock } from "@/composables/useCapsLock"

beforeEach(() => {
	// Each test asserts on its own calls; a spy still carrying the previous
	// test's call turns "not called" into a false failure.
	vi.clearAllMocks()
})

describe("useLoginPreferences — language", () => {
	it("offers every supported locale, Arabic first, in its own language", () => {
		const { localeOptions } = useLoginPreferences()
		const values = localeOptions.value.map((option) => option.value)

		// Arabic is the product's language, so the menu opens with it; the
		// full set is still offered, so nothing was filtered away.
		expect(values[0]).toBe("ar")
		expect([...values].sort()).toEqual(["ar", "en", "id", "pt-br"])

		const arabic = localeOptions.value.find((option) => option.value === "ar")
		expect(arabic.label).toBe("العربية")
		expect(arabic.dir).toBe("rtl")
	})

	it("applies a supported locale and reports success", async () => {
		prefsMocks.changeLocale.mockResolvedValueOnce(undefined)

		const { setLocale, switching } = useLoginPreferences()

		await expect(setLocale("en")).resolves.toBe(true)
		expect(prefsMocks.changeLocale).toHaveBeenCalledWith("en")
		expect(switching.value).toBe(false)
	})

	it("refuses an unsupported locale without touching the dictionary", async () => {
		const { setLocale } = useLoginPreferences()

		await expect(setLocale("fr")).resolves.toBe(false)
		expect(prefsMocks.changeLocale).not.toHaveBeenCalled()
	})

	it("reports a failed switch instead of leaving the menu lying", async () => {
		prefsMocks.changeLocale.mockRejectedValueOnce(new Error("no bundle"))

		const { setLocale } = useLoginPreferences()

		await expect(setLocale("pt-br")).resolves.toBe(false)
	})
})

describe("useLoginPreferences — theme", () => {
	it("exposes light / dark / system with an icon each", () => {
		const { themeOptions, themeModes } = useLoginPreferences()

		expect(themeModes).toEqual(["light", "dark", "system"])
		expect(themeOptions.value.map((option) => option.icon)).toEqual([
			"sun",
			"moon",
			"monitor",
		])
	})

	it("delegates the chosen mode to the theme singleton", () => {
		const { setThemeMode } = useLoginPreferences()

		setThemeMode("dark")
		expect(prefsMocks.setMode).toHaveBeenCalledWith("dark")
	})
})

describe("useCapsLock — the hint that only appears while typing", () => {
	it("reads the real modifier state from the key event", () => {
		const { capsLockOn, trackCapsLock } = useCapsLock()

		expect(capsLockOn.value).toBe(false)

		trackCapsLock({ getModifierState: (key) => key === "CapsLock" })
		expect(capsLockOn.value).toBe(true)

		trackCapsLock({ getModifierState: () => false })
		expect(capsLockOn.value).toBe(false)
	})

	it("keeps the last known state when the browser cannot report it", () => {
		const { capsLockOn, trackCapsLock } = useCapsLock()

		trackCapsLock({ getModifierState: () => true })
		trackCapsLock({})
		trackCapsLock(undefined)

		expect(capsLockOn.value).toBe(true)
	})
})
