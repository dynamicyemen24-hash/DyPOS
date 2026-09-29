/**
 * File-size ratchet.
 *
 * The debt log has carried "PaymentDialog is 3324 lines, POSSale is 2845" as a
 * backlog item for releases — and the numbers moved the wrong way (POSSale is
 * now ~6.3k lines) because nobody measured. A backlog item that is never
 * measured is a wish.
 *
 * So the sizes became a gate. The caps are the current measured values: a file
 * may not grow, and shrinking it is rewarded by lowering the cap in the same
 * commit. That turns "split this file someday" from a memory into a rule the
 * suite enforces on every pull request.
 *
 * Caps only ever move DOWN. If a file genuinely needs to grow, extract the new
 * behaviour into a composable/module first — which is what the cap is asking
 * for in the first place.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

/** [file, maxLines] — measured, not aspirational. Lower the number when you split. */
const CAPS = [
	// 6355 → 6255: اختصارات لوحة المفاتيح (F2/F4/F8/Ctrl+Enter/Escape/Shift+Esc/
	// Delete) وإجراءات رأس شاشة البيع استُخرجت إلى
	// composables/useKeyboardShortcuts.js وcomposables/usePosHeaderActions.js
	// (مع tests/posHeaderActions.test.js)، ومراقب الاتصال
	// (online/offline) إلى composables/useConnectionWatch.js، وسلسلة الإغلاق
	// المكرّرة قُذفت من الصفحة. الاتجاه downward فقط.
	// 6359 → 6355: مؤقّت إشعار البيع (showNotification + timeout المعلّق على
	// الدالة نفسه، ثلاثة مواقع لتفريغه) استُخرج إلى
	// composables/useSaleNotification.js مع اختبار tests/saleNotification.test.js.
	// 6374 → 6359: تسجيل الخروج + اختصار Shift+Esc زاد~30 سطرًا، فاستُخرج
	// مسار لوحة المفاتيح إلى utils/gridNavigation.js (مع اختبارات) وسلسلة
	// الإغلاق إلى composables/useOverlayCloser.js. الاتجاه downward فقط.
	["src/pages/POSSale.vue", 6255],
	["src/components/settings/POSSettings.vue", 2092],
	// 3406 → 3225 → 1706 → 2039:
	//  - تهيئة بيئة التشغيل (~250 سطرًا) انتقلت إلى composables/useLoginRuntime.js
	//  - ثم استُخرجت 1531 سطرًا من `<style scoped>` إلى styles/pages/login.css
	//    (2598 → 1706)، فانخفض الرقم 892 سطرًا في التزام واحد.
	//  - ثم رُفع إلى 2039 لأن واجهة PIN وُصلت بالقالب: مسار الدخول السريع كان
	//    ميّتًا تمامًا (سبعة معالجات لا يقرأها قالب واحد، و`loadPinState` لم
	//    تُستدعَ قط). الرفع **مقيس** لا مُقنع: الكود الميت صار سطحًا يعمل،
	//    وهذا وحده يبرّر الأسطر. الاتجاه بعدها نزول فقط.
	// 2039 → 2037: أسماء ميسّرة (aria-label) لثمانية أزرار في صفحة الدخول، ونصوص
	// زر رمز الدخول السريع نُقلت إلى ثلاثة ثوابت في <script> بدل ternary من
	// خمسة أسطر في القالب. الاتجاه نزول فقط.
	["src/pages/Login.vue", 2037],
	["src/stores/itemSearch.js", 2620],
	// 1188 → 1150: column layout and cell formatting moved to focused modules as
	// the frozen-grid contract grew.
	["src/components/work/WorkDataGrid.vue", 1150],
]

const countLines = (relPath) => {
	const text = readFileSync(join(ROOT, relPath), "utf8")
	const lines = text.split("\n")
	if (lines[lines.length - 1] === "") lines.pop()
	return lines.length
}

describe("file-size ratchet", () => {
	it("the cap table is not stale (every listed file still exists)", () => {
		expect(CAPS.length).toBeGreaterThan(0)
		for (const [rel] of CAPS) {
			expect(
				() => readFileSync(join(ROOT, rel), "utf8"),
				`${rel} moved`,
			).not.toThrow()
		}
	})

	for (const [rel, cap] of CAPS) {
		it(`${rel} stays at or under ${cap} lines`, () => {
			const actual = countLines(rel)
			expect(
				actual,
				`${rel} is ${actual} lines (cap ${cap}). Extract a composable/module and lower the cap in tests/fileSize.test.js.`,
			).toBeLessThanOrEqual(cap)
		})
	}
})
