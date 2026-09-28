# 🎨 نظام تصميم DyPOS — الدليل الرسمي

| | |
|---|---|
| **الهوية** | DyPOS — أزرق ملكي × أخضر زمردي |
| **الموقع** | عربي أولًا (RTL) · Latin first for numerals · Light-first |
| **الإصدار** | 2.0 — مصدر واحد مُقاس، موحّد مع معايير enterprise |
| **معيار الوصولية** | WCAG 2.2 AA |
| **مصدر الحقيقة** | `POS/src/styles/dypos/` — 9 طبقات، ترتيبها إلزامي |
| **البوابة** | `POS/tests/designTokens.test.js` — 6 قواعد تمنع عودة الازدواجية |

> **قاعدة هذا الدليل:** كل رقم فيه **مقيس من الشجرة** لا مكتوب من الذاكرة.
> أي قيمة لا تجدها هنا برقمها فابحث عنها أولًا في `tokens.css` قبل أن تكتبها في
> وثيقة أخرى.

---

## 0. أين نقف مقارنةً بالمعايير العالمية

لا يدّعي هذا النظام أنه «مثل SAP» — يدّعي أنه **مقيس**، وأن كل قرار فيه قابل
للتحقق. هذا جدول المواءمة، وهو صادق في الاتجاهين:

| معيار عالمي | المبدأ الذي نأخذه | أين نطبّقه | الحالة |
|---|---|---|---|
| **SAP Fiori 3** | الفصل بين *primitive* (reference) و*semantic* token | `tokens.css` ⇢ `themes.css` | ✅ مُطبَّق |
| **SAP Fiori** | «SAP Fiori theme designer»: الهوية قابلة للتبديل بلا لمس المكوّن | `data-accent` (6 هوية) | ✅ مُطبَّق |
| **Oracle (Redwood/ADF)** | فصل الأدوار: حدّ (stroke) · محتوى (content) · مكوّن (component) | `--dy-border*` / `--dy-surface*` / `--dy-control-h-*` | ✅ مُطبَّق |
| **Oracle** | «Plus 8» لأهداف اللمس (48px للأصابع، 40px للمؤشر) | `--dy-touch-min: 44px` · `--dy-touch-comfort: 48px` | ⚠️ نأخذ حدًّا أدنى أعلى قليلًا من Oracle |
| **Microsoft Fluent 2** | تسمية الأدوار لا الألوان (`surface` لا `gray-100`) | `--dy-surface-*` · `--dy-text-*` · `--dy-color-status-*` | ✅ مُطبَّق |
| **Microsoft Fluent 2** | `Elevation` channels مشتقّة من اللون نفسه | `--dy-elevation-*` من `--dy-ink-c-*` | ✅ مُطبَّق |
| **Microsoft Dynamics** | تبديل السمة على `<html>` لا على المكوّن | `useAppTheme` يكتب `data-theme` على الجذر | ✅ ممُطبَّق |
| **W3C DTCG** | فصل *reference* / *alias* / *component* tokens | 9 طبقات + `semantic.css` كجسر alias | 🟡 جزئي (CSS، بلا DTCG JSON) |
| **Material 3** | `tonal palette` + أدوار دلالية | 11 درجة لكل عائلة (50→950) | ✅ مُطبَّق |
| **Apple HIG** | `safe-area` + `dvh/svh` + أهداف لمس | 9 usages + `svh` fallback | ✅ ممُطبَّق |
| **WCAG 2.2 AA** | 1.4.3 تباين · 2.5.8 هدف لمس · 2.3.3 حركة | `prefers-contrast` + `--dy-touch-min` + reduced-motion | ✅ ممُطبَّق |
| **CSS Color 4** | `color-mix()` و`oklch` | غير مستخدمة عمدًا (تSupporting أقدم) | 🟡 قرار مؤجَّل |

**ما لا ندّعيه:** هذا ليس Fiori وليس Fluent. الفارق جوهري: Fiori وFluent مبنيّان
على React/Svelte وكتل مكوّنات؛ DyPOS CSS خام على Vue بدون طبقة أدوات. لذلك نأخذ
*مبادئهم* (التسمية، الفصل، الأدوار) لا *توزيعاتهم* (قائمة مكوّنات كاملة).

---

## 1. معمارية الطبقات التسع

```
POS/src/styles/dypos/
├── tokens.css       ① الرموز الخام (342 تصريحًا) — لا قيم دلالية هنا إطلاقًا
├── themes.css       ② الفاتح/الداكن عبر data-theme (223)
├── semantic.css     ③ جسر الأسماء: 150 اسمًا بديلًا، صفر قيمة جديدة
├── accents.css      ④ الهوية القابلة للتبديل عبر data-accent (201)
├── base.css         ⑤ الأساس: طباعة، تركيز، RTL، safe-area
├── components.css   ⑥ 81 صنف dy-* جاهز
├── animations.css   ⑦ 26 تصريحًا + إطارات مفتاحية
├── utilities.css    ⑧ 128 أداة
├── density.css      ⑨ الكثافة (آخر طبقة عمدًا — تتجاوز الجميع)
└── index.css        نقطة الدخول، الترتيب إلزامي
```

### ⚠️ طبقة التوافق — ليست نظام تصميم

`POS/src/styles/brand/variables.css` (221 سطرًا) طبقة **أسماء بديلة فقط**،
تُستورد **بعد** كل شيء في `main.js`. قاعدتها مفروضة ببوابة:

| ممنوع | ما الذي حدث فعلًا |
|---|---|
| رمز يملكه `styles/dypos/*` بقيمة حرفية | كان الملف يُعرّف **74 رمزًا** بقيمة مختلفة ويفوز في كل تعارض |
| `[data-theme]` فيه | كان يُسقط كل سطح داكن لأن `:root` هنا يأتي متأخرًا |
| رمز لا يقرأه أحد | نقطة ثانية تتغيّر عند تغيّر التصميم |

قبل التوحيد كان الوضع الداكن **ميّتًا فعليًا** وتبديل اللون **ميّتًا فعليًا** —
لا في نظرية، بل في كل تحميل للصفحة.

---

## 2. التسمية — عقد صارم

نمط الاسم: `--dy-<عائلة>-<درجة | دور>`

### 2.1 عائلات الألوان الخام (primitive / reference)

كلها 11 درجة: `50 · 100 · 200 … 900 · 950`، ولكل درجة قناة RGB مقابلة
(`--dy-<family>-c-<step>`) تُستخدم في `rgb(... / alpha)` بدل قيمة hex ثابتة.

| العائلة | الدور | 600 | 700 |
|---|---|---|---|
| `--dy-brand-*` | هوية DyPOS (تُبدَّل بـ`data-accent`) | `#3b62e4` | `#1e40af` |
| `--dy-mint-*` | نجاح / إيجاب | `#059669` | `#047857` |
| `--dy-crimson-*` | خطر / إلغاء | `#dc2626` | `#b91c1c` |
| `--dy-amber-*` | تحذير | `#d97706` | `#b45309` |
| `--dy-cyan-*` | معلومات | `#0284c7` | `#0369a1` |
| `--dy-ink-*` | محايد: نص، حدود، أسطح، ظلال | `#475569` | `#334155` |

> `ink` ليست رمادية عامة — هي **مصدر الارتفاع** كله: ظلال `--dy-elevation-1..5`
> مشتقّة من `rgb(var(--dy-ink-c-950) / α)` لا من rgba ثابت. لذلك يضيء الوضع
> الداكن الظلال تلقائيًا بلا قاعدة إضافية.

### 2.2 الأدوار الدلالية (semantic)

`tokens.css` لا يحتوي ولا رمز `primary/success/danger` — هذا مقيس لا عُرف. هذه
القيم في `themes.css` وهي **التي تتبدّل**:

| الدور | الفاتح | الداكن |
|---|---|---|
| `--dy-bg` | `#ffffff` | `--dy-ink-950` |
| `--dy-bg-sunken` | `--dy-ink-50` | `#020617` |
| `--dy-surface` | `#ffffff` | `--dy-ink-900` |
| `--dy-surface-hover` | `--dy-ink-50` | `--dy-ink-800` |
| `--dy-text-strong` | `--dy-ink-950` | `#ffffff` |
| `--dy-text` | `--dy-ink-900` | `--dy-ink-50` |
| `--dy-text-secondary` | `--dy-ink-600` | `--dy-ink-400` |
| `--dy-text-muted` | `--dy-ink-500` | `--dy-ink-500` |
| `--dy-border` | `--dy-ink-200` | `--dy-ink-800` |
| `--dy-border-strong` | `--dy-ink-300` | `--dy-ink-700` |
| `--dy-primary` | `var(--dy-accent)` | `var(--dy-accent)` |
| success / danger / warning / info | درجات **600** | درجات **500** |

**قاعدة الـ 600/500:** الحالات في الفاتح على 600 (تباين كافٍ على أبيض)، وفي
الداكن على 500 لأن 600 على سطح داكن يهبط تحت 4.5:1. لا يكتب أي مكوّن رمز حالة
يدويًا — المكوّن يقرأ الدور.

### 2.3 الجسر الدلالي — `semantic.css`

150 اسمًا بديلًا **بقيمة جديدة واحدة: صفر**.أسماء مثل `--dy-border-width-thin`
كانت تُقرأ في مواضع دون أي تعريف في الشجرة، فتسقط إلى `medium` = 3px بدل 1px.
طبقة الجسر هي ما يحوّل «اسمًا أستخدمه» إلى «رمزًا معرَّفًا».

### 2.4 السلالم المقيسة

| السلم | القيم |
|---|---|
| المسافة (4pt وأنصافها) | `0 · 0_5(2) · 1(4) · 1_5(6) · 2(8) · 2_5(10) · 3(12) · 4(16) · 5(20) · 6(24) · 7(28) · 8(32) · 10(40) · 12(48) · 16(64) · 20(80) · 24(96)` |
| الاستدارة | `xs(4) · sm(8) · md(12) · lg(16) · xl(20) · 2xl(24) · 3xl(32) · full` |
| المدد | `instant(0) · micro(100) · fast(150) · snappy(180) · base(220) · moderate(280) · slow(360) · emphasis(450)` |
| المنحنيات | `linear · standard(.2,0,0,1) · decelerate(.05,.7,.1,1) · accelerate(.3,0,.8,.15) · emphasized · spring(.34,1.56,.64,1)` |
| الارتفاع | `0…5` من قنوات الحبر + `6` و`inner` في طبقة التوافق |
| التكديس | `base(0) · sticky(40) · nav(60) · menu(80) · popover(100) · overlay(120) · modal(140) · toast(160) · offline(9999)` |
| أهداف اللمس | `min 44px · comfort 48px · large 52px` |
| ارتفاع الحقول | `xs(32) · sm(36) · md(44) · lg(48) · xl(56)` — وcompact يخفض md→40 وlg→46 |
| الخطوط | `sans (Cairo+Inter) · arabic · english · money · mono` |
| التتبع | `tight(-.015em) · normal · wide(.015em) · wider(.035em)` |
| ارتفاع السطر | `none(1) · tight(1.25) · snug(1.375) · normal(1.5) · relaxed(1.75)` |

> **الطباعة ساكنة لا سائلة:** كل `--dy-font-size-*-min = *-max`. السبب مقيس: حقل
> إدخال لا يجوز أن يتغيّر حجمه بتغيّر عرض النافذة — يقفز المؤشر ويخطئ الكاشير.
> (الطباعة السائلة مفيدة للعرض، مضلّلة للإدخال.)

### 2.5 الهوية القابلة للتبديل — `data-accent`

`royal` (افتراضي) · `indigo` · `violet` · `teal` · `emerald` · `rose`.
كل هوية تعيد ربط `--dy-brand-*` وقنواتها، فتتبعها **كل** الظلال والتوهجات
والحلقات المشتقّة — بلا لمس أي مكوّن. تديرها `useAppTheme` مع تزامن بين
التبويبات عبر حدث `storage`.

---

## 3. المكوّنات — 81 صنفًا في `components.css`

### الأزرار
```html
<button class="dy-btn dy-btn-primary dy-btn-md">حفظ</button>
```
- **الأنواع**: `primary · secondary · soft · ghost · success · danger · warning · hero`
- **المقاسات**: `sm(32) · md(40) · lg(48) · xl(56)`
- **الحالات**: `dy-btn--loading` (مؤشّر انتظار) · `dy-btn--disabled` · `dy-btn-icon`
- الطابع اللمسي: `dy-press` في `base.css` هو البديل المفضَّل

### البطاقات
`dy-card` مع `dy-card-glass` · `dy-card-elevated` · `dy-card-accent` ·
`dy-card-interactive`، وتن Luigiّاتها `dy-card-header` / `-body` / `-footer`.

### الحقول
`dy-label` (+`dy-label-required`) · `dy-input dy-input-sm|md|lg` (+`dy-input-invalid`)
· `dy-hint` · `dy-error` · `dy-field` / `dy-field-row` / `dy-field-full` · `dy-icon-btn`

### الحالة والتغذية الراجعة
`dy-badge` بست نغمات + `dy-badge-live` (نقطة نابضة) · `dy-status-dot` بخمس نغمات
· `dy-status-surface` (+ `-icon/-title/-description`) · `dy-skeleton` بأربعة أشكال
· `dy-progress` + `dy-progress-bar` (+ `-indeterminate`)

### التنقّل والعرض
`dy-chip` (+ `dy-chip-selectable` · `dy-chip-active` · `dy-chip-disabled`) ·
`dy-switch` / `dy-switch-on` · `dy-avatar` (sm/md/lg/xl) · `dy-kbd` · `dy-divider`

### الأساس — `base.css`
`dy-root` · `dy-app-shell` · `dy-full-height` · `dy-heading`(display/1–4) ·
`dy-text-{primary,secondary,muted,strong}` · `dy-numeric`/`dy-price`/`dy-quantity`/
`dy-total`/`dy-code` · `dy-ltr-embed`/`dy-rtl-embed` · `dy-sr-only`/`dy-not-sr-only`
· `dy-safe-{top,bottom,inline-start,inline-end}` · `dy-scroll{,-x,-y}` ·
`dy-touch` · `dy-press` · `dy-no-select`/`dy-select`

### الأدوات — 128 في `utilities.css`
`dy-flex*` · `dy-grid-*` · `dy-gap-*` · `dy-w/h-*` · `dy-pt/pb/px-*` · `dy-m*` ·
`dy-text-*` · `dy-rounded-*` · `dy-elevation-*` · `dy-glass*` · `dy-gradient-*` ·
`dy-*-glow` · `dy-truncate` · `dy-line-clamp-2|3` · `dy-focus-ring` ·
`dy-color-scheme-light|dark|normal` · `dy-scrollbar-thin|none` · `dy-touch` · `dy-press`

> **الطبقات المنطقية:** `safe-*` و`inset-*` و`text-start/end` تستخدم الخصائص
> المنطقية (`inset-inline-start`)، فالنظام RTL-first بلا قلب يدوي — وهو شرط
> مشترك بين Apple HIG وSAP Fiori.

---

## 4. الحركة

- الدخول: `dy-anim-fade-in|up|down|left|right` · `dy-anim-pop` · `dy-anim-scale-in`
- الخروج: `dy-anim-fade-out` · `dy-anim-scale-out`
- الانتظار: `dy-anim-spin{,-fast,-slow}` · `dy-anim-pulse{,-soft}` ·
  `dy-anim-shimmer` · `dy-anim-indeterminate`
- **الدخول المتسلسل**: `dy-anim-stagger` (+`-fast`/`-slow`) يؤخّر كل ابنٍّ 40ms
- `prefers-reduced-motion: reduce` ⇒ **كل المدد تصبح 0ms** عبر `tokens.css`
  وحدها — طبقة واحدة تخدم كل النظام، لا استثناء لكل مكوّن
- `@media print` ⇒ الظلال والوهجات كلّها `none`

---

## 5. الوصولية — ما هو مُنفَّذ فعلًا

| المتطلب | التنفيذ | الموضع |
|---|---|---|
| **2.5.8** هدف لمس ≥ 24px (WCAG 2.2 AA) | 44px كحد أدنى، 48/52 مريح | `--dy-touch-*` |
| **1.4.3** تباين النص | أدوار نصّ بدرجتين للضوء | `themes.css` |
| **1.4.11** تباين غير نصّي | حدود + حلقة تركيز | `--dy-border-strong` |
| **2.4.7** تركيز مرئي | `:focus-visible` + `--dy-focus-ring-color` | `index.css` |
| **2.3.3** تفضيل تقليل الحركة | كل المدد 0ms | `tokens.css` §reduced |
| **1.4.1** ألوان وحدها لا تكفي | كل حالة تحمل أيقونة ونصًّا | `dy-status-surface` |
| **1.3.1** معلومات واتجاه | RTL عبر الخصائص المنطقية | `base.css` |
| **1.1.1** محتوى غير نصّي | `dy-sr-only` و`aria-hidden` للزخرفة | `utilities.css` |
| تباين مُعزَّز | `@media (prefers-contrast: more)` يعيد التصريح بأدوار أغمق/أفتح | `themes.css` §04 |
| Windows High Contrast | `@media (forced-colors: active)` → `CanvasText`/`LinkText` | `index.css` §24 |
| الطباعة | إخفاء الأثاث + أسود على أبيض | `index.css` §25 |

### قاعدة عربية: لا `letter-spacing` سالب على نص عربي
التباعد السالب يكسر اتصال الحروف (reshaping). كان `-0.035em` مطبَّقًا على عنواني
شاشة الدخول (عنوان الهوية وعنوان اللوحة) وعُدِّل إلى `--dy-tracking-tight`. أي
تتبّع سالب يُقبل على اللاتيني فقط.

---

## 6. الربط مع Tailwind — بلا كسر توافق

`POS/tailwind.config.js` — هذا **الاسم الفعلي** للأصناف، لا ما يوهم به تسمية شبيهة:

| السلم | يُنتج | المصدر |
|---|---|---|
| `brand` / `dypos` / `indigo` | `bg-brand-600` · `bg-dypos-700` · `bg-indigo-600` | `--dy-brand-*` |
| `accent` | `bg-accent-600` · `text-accent-500` | `--dy-accent-*` (بدائل لسلّم brand) |
| دلالي (مبثوث في `colors`) | `bg-surface` · `text-text` · `border-border` · `bg-primary` | `semantic` |
| حالات | `text-success` · `bg-danger-soft` · `text-warning` | `--dy-*-soft` |
| `spacing` | `p-4` = 16px … | `--dy-spacing-*` |
| `borderRadius` | `rounded-md` = 12px | `--dy-radius-*` |
| `boxShadow` | `shadow-1`…`shadow-6` · `shadow-brand-2` · `shadow-inner` | `--dy-elevation-*` |
| `zIndex` | `z-modal` · `z-toast` · `z-skipLink` | `--dy-z-*` |
| `minHeight` | `min-h-touch` (44px) | `--dy-touch-min` |
| `transitionDuration` | `duration-dy-fast` … | `--dy-dur-*` |
| `animation` + `keyframes` | `animate-dy-fade-in` | `@keyframes dy*` |

> **`indigo` مربوط بالهوية:** كل `bg-indigo-600` قائم في الشجرة يكتسي الأزرق
> الملكي فورًا بلا تعديل مكوّن. هذا **جسر ترقية** لا توصية: كود جديد يستخدم
> `brand` أو الأدوار الدلالية.

---

## 7. الحوكمة — ما يمنع الانحدار

| البوابة | ما تفرضه |
|---|---|
| `tests/designTokens.test.js` | ست قواعد: لا طغيان للطبقة المؤرخة · لا رمز ميت · لا `var()` بلا تعريف · لا دورة · `themes.css` وحده يملك الثيم · الفحص ليس فارغًا |
| `tests/buildConfig.test.js` | كل مسار تذكره إعدادات البناء موجود فعلًا؛ كل حزمة pre-bundle معلَنة في البيان |
| `tests/deadCode.test.js` | لا وحدة في `src/` خارج graph الوصول من `main.js` |
| `tests/fileSize.test.js` | رافعة أحجام تنزل **في نفس** الالتزام الذي يخفض الملف |
| `tests/loginPageIntegrity.test.js` | لا معرّف غير مربوط · لا تصريح مكرر · لا binding ميت في `Login.vue` |
| `tests/brandingIdentity.test.js` | الأيقونات والبطاقة والرابط الرسمي موجودة كملفات حقيقية |

**قاعدة القيمة السحرية:** لا لون/مسافة/مدّة/استدارة حرفية في `<style>` ولا inline.
كلها تمر عبر `--dy-*`. الاستثناء الوحيد المسموح: `transparent` و`currentColor`
و`0`/`100%` — لأنها ليست قيم تصميم.

---

## 8. دليل الترحيل

| قبل | بعد | لماذا |
|---|---|---|
| `var(--dy-color-primary-bg, #059669)` | `var(--dy-primary)` | طبقة الجسر وُجدت للتخلّص من هذا |
| `var(--surface, #fff)` | `var(--dy-bg)` | الأول كان يقرأ رمزًا غير موجود فيرتدّ إلى hex |
| `z-[999]` | `z-modal` / `z-toast` | سلم واحد بدل أرقام متفرقة |
| `box-shadow: 0 2px 8px rgba(0,0,0,.1)` | `var(--dy-elevation-3)` | الظل مشتقّ من قناة الحبر فيتبع الثيم |
| `transition: all .2s` | أسماء محدّدة + `var(--dy-dur-fast) var(--dy-ease-standard)` | `all` يحرّك كل خاصية مستقبلية أيضًا |
| `#0d6e6e` | `var(--dy-brand-600)` | انظر «نظامان» في `CHANGELOG.md` |
| `letter-spacing: -.03em` (عربي) | `var(--dy-tracking-tight)` | يفسد اتصال الحروف |
| `min-height: 40px` على زر | `min-height: var(--dy-touch-min)` | متطلب 2.5.8 |

**تسلسل مقترح:** (1) استبدل الألوان الحرفية بالأدوار الدلالية · (2) اربط
الزوايا والظلال والطبقات بسلالمها · (3) أضف `dy-*` عند الحاجة · (4) احذف الطبقة
المؤرخة عندما تنتهي دورة حياة الأسماء القديمة.

---

## 9. خارطة الطريق — قيود معروفة، صريحة

| القيد | السبب | البديل الآن |
|---|---|---|
| لا `oklch()` / `color-mix()` | دعم أقدم من Safari 15.4 / Chromium 111 | قنوات `--dy-*-c-*` مع alpha |
| لا DTCG JSON | المشروع CSS-first بلا خطوة بناء | 9 طبقات تحفظ الفصل نفسه |
| لا كتالوج مكوّنات (Storybook) | لا طبقة عرض | `components.css` + جدول §3 |
| `data-density` يدعم Compact فقط | المريح هو الافتراضي في `tokens.css` | — |
| `forced-colors` في `index.css` لا في `components.css` | قرار مركزي عمدًا: طبقة واحدة تخدم الكل | — |
| الطبقة المؤرخة باقية | أسماء قديمة ما زالت في الشجرة | بوابة تمنع النمو + خطة حذف في §8 |

