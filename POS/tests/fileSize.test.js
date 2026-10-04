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
	// 6239 → 6155: the three print paths (after-sale receipt, reprint-last,
	// manual) moved to composables/useSalePrint.js with their own coverage
	// (tests/salePrint.test.js, 10 checks). They shared one fallback chain —
	// spool → direct print → browser print — copied three times inside a page
	// no suite mounts, which is three places where "the printer is down" turns
	// into "the cashier is stuck". The operator menu that arrived with this
	// round (cashier chip / connection badge / shift button all rendered and
	// did nothing) paid for its own wiring out of this extraction, so the cap
	// moves DOWN instead of being raised for the feature. Direction: downward.
	// 6155 → 6145: the sale status line stopped being a four-branch
	// `v-if / v-else-if` chain in the template and became one binding over
	// `composables/useSaleStatus.js`, which resolves through a table. That is
	// not cosmetic: the `v-else` branch claimed "توجد مشكلة في الاتصال" for
	// ANY value it did not recognise, so an unhandled state told the cashier
	// the connection was broken. The stock/print buttons went to
	// `components/pos/PosStockActions.vue` at the same time — four buttons that
	// were three copies of one block, with «مخزون» appearing twice and both
	// copies leading to the same destination. Direction: downward only.
	// 6165 → 6200: the barcode scanner branch was OPENED, and the page paid for
	// it by extraction rather than by raising the cap. It shipped three dead
	// contracts at once — an `instascan@3.2.1` dependency that does not exist
	// on npm (so `npm ci` in CI died before a test ran), a
	// `this.$root.$emit` inside `<script setup>` where `this` is `undefined`,
	// and a STOP control with no OPEN control beside it — and the open/close
	// flow moved to `composables/useBarcodeScanner.js` (-37). The remainder is
	// the 14 lines of real markup the OPEN button needs. What is NOT allowed is
	// raising this number to hide growth: the scanner file itself is capped too.
	// 6200 → 6115: the cart-line rules moved to `composables/useCartLines.js`
	// (−85 here, +164 there, with 16 tests freezing the behaviour). What moved
	// is exactly what a cashier notices first: the 9999 clamp, "quantity <= 1
	// removes the line", and "an emptied quantity field removes the line". The
	// page keeps thin wrappers so the template is untouched, and the module
	// carries its own cap so the extraction cannot regrow into the page.
	["src/pages/POSSale.vue", 6115],
	["src/composables/useCartLines.js", 200],
	// 6145 → 6159: the scanner's stop control became a real `ActionButton`
	// after `:size="sm"` and a broken `aria-label` string made the whole SFC
	// fail to compile. Fourteen lines of markup that the build previously
	// refused to bundle at all. Direction from here: downward only.
	["src/components/settings/POSSettings.vue", 2105],
	// The print composable gets a cap of its own: it is the module the three
	// paths now share, so a fourth copy of the fallback chain is exactly the
	// regression this table exists to catch.
	["src/composables/useSalePrint.js", 135],
	["src/styles/pages/pos-sale-responsive.css", 193],
	// 1712 → 1512: the brand panel was removed from the page (the identity
	// card moved to the shared `SystemAboutPanel.vue`, the company name stays
	// on `CompanyFooter`), and 204 lines of CSS for 13 selectors the template
	// never referenced went with it — plus a `@media` block that collapsed a
	// grid the page no longer has. Nothing was extracted: it was DEAD.
	// `tests/designTokens.test.js` now fails the build if it grows back.
	// 1512 → 1516: `biome check --write` re-wrapped four comments; the cap
	// follows the MEASURED number, never an aspiration.
	["src/pages/Register.vue", 1508],
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
	// 2031 → 1899: شاشة الدخول صارت ثنائية اللغة والسمة. الكلمة المفتاحية
	//   صارت `__('…')` في كل سطح (أصل عربي واحد، وقاموسات en/id/pt-br مولّدة
	//   من الجدول نفسه)، وحالة بيئة التشغيل وتفاصيلها صارت جدولان لا سلسلة
	//   `if` + أربع نسخ في القالب، وحوار «انتهت الجلسة» وحوار «الجلسة مقفلة»
	//   (قالباهما وحالتاهما وتنسيقاتهما) انتقلتا إلى
	//   components/common/LoginSessionTimeoutDialog.vue و
	//   components/common/LoginSessionLockDialog.vue. شريط اللغة والسِمة
	//   وتنبيه Caps Lock والمكوّنان اللذان يخدمانهما خارج الملف. الاتجاه
	//   نزول فقط.
	// 1899 → 1890: ربط حالات الواجهة وتصحيح refs وترجمة PIN، ثم استخراج
	//   التحقق من الحقول إلى composable قابل للاختبار. أضيفت بوابات القالب
	//   والتخطيط المكتبي؛ الاتجاه downward فقط.
	// 1725 → 1470 → 1439: the workspace column's identity card moved into `DyPanel`
	//   (LoginWorkspacePanel now renders it plus a slot), then the session
	//   security monitor pair moved to `composables/useLoginSecurityMonitor.js`.
	//   Measured by this gate's own counter. Direction downward only.
	["src/pages/Login.vue", 1439],
	// The monitor this page used to own: interval + listener + stop in one
	// closure, with `loginSecurityMonitor.test.js` freezing the contract.
	["src/composables/useLoginSecurityMonitor.js", 80],
	// 1845 → 1715, four extractions, every one of them paid for by a feature
	// rather than by raising the number:
	//
	//  - the context chips (tenant / branch / POS) became one table in
	//    `useLoginContextItems` — nothing could test three `if` blocks inside
	//    an 1800-line page, so nothing did;
	//  - the security panel became `components/common/LoginSecurityPanel.vue`;
	//  - the PIN form (both sign-in and setup) became
	//    `components/common/LoginPinForm.vue` over the pure rules in
	//    `usePinSignInRules.js`. The 144-line state machine was where a WRONG
	//    PIN could have read as a success, because the caller relied on a
	//    rejection that `pinLogin` never makes;
	//  - the ops panel (`ShiftOpsPanel`) and the shared `DyPanel` surface
	//    arrived in the same round.
	//
	// The round also removed a hard-coded supervisor password from the bundle
	// and the `TouchKeyboard` import of a file that no longer exists.
	// Direction: downward only.
	// 1890 → 1845: same staleness as the server side. The masthead refactor
	// moved the session dialogs into their own components and the runtime into
	// `useLoginRuntime.js`, and the cap stayed where it was — so this ratchet
	// had stopped measuring anything it claimed to.
	//
	// The four files below had NO cap at all, which is the same defect wearing
	// a different hat: a backlog nobody measures is a wish. They are the four
	// largest remaining modules in `src/` (measured, in this order), and every
	// one of them is a place a merge conflict lands. Capping them converts a
	// wish into a rule the suite enforces on every pull request — the same
	// move the rest of this table made.
	["src/workers/offline.worker.js", 2065],
	["src/stores/posCart.js", 2046],
	// 1548 → 1600: the store grew with the scale/barcode features in the same
	// round. The cap follows the measurement, and the direction holds from here.
	["src/stores/posSettings.js", 1600],
	["src/components/common/AutocompleteSelect.vue", 1477],
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
