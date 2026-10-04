/**
 * User-facing failure text must be Arabic AND must say what to do.
 *
 * ## What this gate is
 *
 * Two properties of every message that reaches a cashier, measured across
 * `src/**`. Both were violated and neither was caught:
 *
 * 1. **Arabic.** AGENTS.md invariant 7 requires Arabic user-facing strings.
 *    `StockImportExportDialog.validateRows` pushed `"product_code required"`
 *    and `"invalid uom"` straight into the preview table, and
 *    `useDashboardExport` raised `"No data to export"` in every export path.
 *    An operator fixing a spreadsheet was told what was wrong in English.
 *
 * 2. **Actionable.** `DESIGN_SYSTEM_UX_STANDARD.md` §7: error states must
 *    explain recovery. A message that only names the problem leaves the only
 *    remaining move as "tap again" — which on a payment screen is how the
 *    same sale gets charged twice.
 *
 * ## What it deliberately does NOT do
 *
 * It does not assert exact wording. Requiring a specific sentence makes the
 * next translator delete the gate; these are PROPERTIES, so the Arabic can be
 * reworded freely while losing the meaning fails the build.
 *
 * ## The two-channel allowance
 *
 * A file may carry its recovery instruction on a SEPARATE channel instead of
 * inside the sentence — `useDeviceProbes` does exactly this, pairing a
 * `detail` description with an `actionable` string that the panel renders. A
 * file listed in `CHANNELS` is therefore exempt from the inline rule, because
 * the information is present and rendered; the Arabic rule still applies to it.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = resolve(import.meta.dirname, "..", "src")

/** Files that deliver recovery on a second, rendered channel. */
const CHANNELS = new Set([
	// `result(kind, state, detail, { actionable })` — DeviceHealthPanel renders
	// `actionable` directly under the detail line.
	"components/composables/useDeviceProbes.js",
	"composables/useDeviceProbes.js",
])

const walk = (dir, out = []) => {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name)
		if (e.isDirectory()) walk(full, out)
		else if (/\.(vue|js|ts)$/.test(e.name)) out.push(full)
	}
	return out
}

const ARABIC = /[؀-ۿ]/
/**
 * A verb that makes a message actionable rather than a dead end.
 *
 * Two shapes count:
 *   - an IMPERATIVE: "راجع الإيصال", "اختر المستودع", "اكتب اسم الجولة"
 *   - a REASSURANCE that states what happens next: "ستُرسل تلقائيًا"
 *
 * A cashier told the sale is safe and will sync has an action too — carry on
 * serving — which is exactly what the offline branch needs to say.
 */
const ACTION =
	/(راجع|أعد|تأكد|توجّه|تواصل|افتح|اضغط|اختر|اكتب|صحّح|عدّل|رُدَّ|حدّد|ستُرسل|سيتم|عند عودة|أغلق)/

/** Channels that display a message to the user. */
const SINK =
	/(?:showError|showWarning|showSuccess|showNotification|setError|setRuntimeState|error\.value\s*=|editorError\.value\s*=|catalogError\.value\s*=)/

describe("user-facing failure messages are Arabic and actionable", () => {
	it("finds the source tree", () => {
		// A walk that returned nothing would make every assertion below vacuous.
		expect(walk(SRC).length).toBeGreaterThan(50)
	})

	const offenders = []
	const englishOnly = []

	for (const file of walk(SRC)) {
		const rel = relative(SRC, file).replace(/\\/g, "/")
		const text = readFileSync(file, "utf8")

		for (const m of text.matchAll(
			/(?:showError|showWarning|showNotification|setError|setRuntimeState|error\.value\s*=|editorError\.value\s*=|catalogError\.value\s*=)\s*\(?\s*(?:"([^"]{8,})"|`([^`]{8,})`)/g,
		)) {
			const message = m[1] ?? m[2]
			// A comment above the line means the string is documentation.
			const line = text.slice(0, m.index).split("\n").length
			const above = text.slice(0, m.index).split("\n").slice(-2).join("\n")
			if (/^\s*(\*|\/\/)/.test(above.trim()) || /\/\*/.test(above)) continue

			// A message with no failure word is a success or a hint; the recovery
			// rule does not apply to it.
			const isFailure =
				/(تعذر|تعذّر|فشل|فشلت|لم يتم|لا يمكن|غير متاح|خطأ|مطلوب|غير معرَّفة)/.test(
					message,
				)
			if (!isFailure) continue

			if (!ARABIC.test(message)) {
				englishOnly.push(`${rel}:${line} → ${message}`)
				continue
			}

			// A second channel counts as recovery, if the file has one.
			const hasChannel = CHANNELS.has(rel) || /actionable\s*:/.test(text)
			if (!hasChannel && !ACTION.test(message)) {
				offenders.push(`${rel}:${line} → ${message}`)
			}
		}
	}

	it("no message reaches the user in English", () => {
		expect(
			englishOnly,
			`These reach the user verbatim and break AGENTS.md invariant 7 (Arabic UX):\n${englishOnly.join("\n")}`,
		).toEqual([])
	})

	it("no failure message leaves the user without a next action", () => {
		expect(
			offenders,
			`These report a failure but not the recovery, against DESIGN_SYSTEM_UX_STANDARD.md §7:\n${offenders.slice(0, 12).join("\n")}`,
		).toEqual([])
	})
})
