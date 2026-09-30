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
	// 6255 → 6264: زر «التسويات» في رأس شاشة البيع (9 أسطر) الذي يفتح شاشة
	// التسويات الجديدة في workScreens.js. رُفع السقف لأن الزرDead code كان
	// أخطر من حجمه: شاشة تسويات موجودة بلا مدخل إليها. الاتجاه بعده نزول فقط.
	// 6279 → 6075: كتل Responsive/الحركة/الألوان القسرية/الطباعة (~204 أسطر،
	// ومنها إصلاح catalog-actions للشاشات 420px) استُخرجت إلى
	// styles/pages/pos-sale-responsive.css (نفس نمط styles/pages/login.css)
	// مع `<style scoped src>` ثانٍ، فيُقاس الملفان معًا والاتجاه نزول فقط.
	["src/pages/POSSale.vue", 6075],
	["src/styles/pages/pos-sale-responsive.css", 193],
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
	//   زر رمز الدخول السريع نُقلت إلى ثلاثة ثوابت في <script> بدل ternary من
	//   خمسة أسطر في القالب. الاتجاه نزول فقط.
	// 2037 → 2031: صقل بصري لشاشة الدخول (شريط تقدّم، شارة حالة، رابط تسجيل
	//   داخل البطاقة). الميزانية جُمعت من تكثيف سطور موجودة فعلًا: ثمانية
	//   `aria-label` كانت في سطر منفصل أسفل سطرها، وستة أغلفة عناصر
	//   (`<span class="…" aria-hidden="true">`) كانت أربعة أسطر لكل واحد،
	//   و`pinLength` المحذوف كان computed يقرأ نفسه (كان يطبع "٧ خانات على
	//   الأقل" بعد كتابة سبع خانات). الاتجاه نزول فقط.
	["src/pages/Login.vue", 2031],
	// 2620 → 2561: the per-code tracking bookkeeping (registry buckets, the
	// empty-bucket pruning that keeps a long session from leaking one Set per
	// code it ever sold, and the list mutators) moved to
	// stores/itemListRegistry.js — one implementation for the browse list and
	// the search results, with its own coverage
	// (tests/itemListRegistry.test.js, 12 checks). The cap moves downward only.
	["src/stores/itemSearch.js", 2561],
	["src/stores/itemListRegistry.js", 178],
	// 1188 → 1150 → 1145: column layout and cell formatting moved to focused modules as
	// the frozen-grid contract grew; the narrow-screen contract (scrollable
	// table + pinned key column, WCAG 2.5.8) then moved to
	// workDataGrid.responsive.css so it has one named home and one test target
	// (tests/workGridResponsive.test.js) instead of an @media block buried in a
	// 1200-line SFC.
	["src/components/work/WorkDataGrid.vue", 1145],
	["src/components/work/workDataGrid.responsive.css", 72],
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
