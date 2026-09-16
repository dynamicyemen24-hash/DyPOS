# 🎨 نظام تصميم DyPOS — الدليل الرسمي

**الإصدار**: 1.0 — حملة الترقية الكبرى لنظام التصميم
**الهوية**: DyPOS — أزرق ملكي × أخضر زمردي
**المبادئ**: عربي أولاً (RTL) • فاتح/داكن • تفاعلي حيوي • متاح للجميع (WCAG 2.2)

---

## 📐 البنية المعمارية — 6 طبقات

```
POS/src/styles/dypos/
├── tokens.css       ← الطبقة 1: الرموز الخام (ألوان، خطوط، تباعد، حركة)
├── themes.css       ← الطبقة 2: الثيمات الدلالية (فاتح/داكن عبر data-theme)
├── base.css         ← الطبقة 3: الأساس (طباعة، تركيز، تمرير، RTL)
├── components.css   ← الطبقة 4: المكوّنات dy-* الجاهزة
├── animations.css   ← الطبقة 5: الحركة والإطارات المفتاحية
├── utilities.css    ← الطبقة 6: الأدوات المساعدة (زجاج، تدرجات، شبكات)
└── index.css        ← نقطة الدخول الموحدة (الترتيب إلزامي)
```

يُستورد النظام تلقائيًا عبر `POS/src/index.css`، ولا حاجة لأي استيراد إضافي.

---

## 🎨 التسمية الحديثة الموحدة

كل رمز يتبع النمط: `--dy-<عائلة>-<درجة|دلالة>`

### عائلات الألوان الخام

| العائلة | الدلالة | الجوهر (600/700) |
|---------|---------|------------------|
| `--dy-brand-*` | الأزرق الملكي — هوية DyPOS | `#3b62e4` / `#1e40af` |
| `--dy-mint-*` | الأخضر الزمردي — نجاح/إيجاب | `#059669` |
| `--dy-crimson-*` | الأحمر — خطر/إلغاء | `#dc2626` |
| `--dy-amber-*` | الكهرمان — تحذير | `#d97706` |
| `--dy-cyan-*` | السماوي — معلومات | `#0284c7` |
| `--dy-ink-*` | حياد الحبر — نصوص/حدود/خلفيات | `#475569` |

كل عائلة بدرجات 50 → 950.

### الرموز الدلالية (تتبدل تلقائيًا مع الثيم)

| الرمز | الفاتح | الداكن |
|-------|--------|--------|
| `--dy-bg` | رمادي فاتح `#f8fafc` | حبر داكن `#020617` |
| `--dy-surface` | أبيض | `#0f172a` |
| `--dy-text` | `#0f172a` | `#f1f5f9` |
| `--dy-primary` | `#1e40af` | `#567df3` (مفتّح للتباين) |
| `--dy-success` / `--dy-danger` / `--dy-warning` / `--dy-info` | درجات 600 | درجات 500 (مفتّحة) |

التبديل يتم عبر السمة `data-theme="light|dark"` على `<html>` — وهي مربوطة أصلًا
بمدير الثيم `useAppTheme.js` (فاتح/داكن/النظام) دون أي تغيير إضافي.

---

## 🧩 المكوّنات الجاهزة (dy-*)

### الأزرار
```html
<button class="dy-btn dy-btn-primary dy-btn-md">حفظ</button>
```
- **الأنواع**: `dy-btn-primary` • `dy-btn-secondary` • `dy-btn-soft` • `dy-btn-ghost`
  • `dy-btn-success` • `dy-btn-danger` • `dy-btn-warning` • `dy-btn-hero` (متدرج متوهج)
- **المقاسات**: `dy-btn-sm` (32) • `dy-btn-md` (40) • `dy-btn-lg` (48) • `dy-btn-xl` (56)

### البطاقات
```html
<div class="dy-card dy-card-interactive dy-card-accent">
  <div class="dy-card-header">…</div>
  <div class="dy-card-body">…</div>
  <div class="dy-card-footer">…</div>
</div>
```
- `dy-card-glass` — تأثير الزجاج الضبابي
- `dy-card-accent` — شريط تدرج علوي بالهوية
- `dy-card-interactive` — ارتفاع وتوهج عند التحويم

### الحقول
```html
<label class="dy-label">اسم العميل</label>
<input class="dy-input dy-input-md" />
<p class="dy-hint">اختياري</p>
<p class="dy-error">هذا الحقل مطلوب</p>
```
- `dy-input-invalid` — حالة الخطأ مع حلقة حمراء
- المقاسات: `dy-input-sm|md|lg`

### الشارات والشرائح
```html
<span class="dy-badge dy-badge-success dy-badge-live">متصل</span>
<button class="dy-chip dy-chip-active">الكل</button>
```

### أخرى
- `dy-skeleton` — هيكل تحميل بلمعان متحرك
- `dy-avatar dy-avatar-sm|md|lg` — صور المستخدمين
- `dy-switch` + `dy-switch-on` — مفتاح تبديل يدعم RTL بمتغير `inset-inline-start`
- `dy-kbd` — أزرار لوحة المفاتيح
- `dy-progress` + `dy-progress-bar` — أشرطة تقدم (وحالة `dy-progress-bar-indeterminate`)

---

## 🎬 الحركة

- المنحنيات: `--dy-ease-standard` • `--dy-ease-decelerate` • `--dy-ease-accelerate` • `--dy-ease-spring`
- المدد: `--dy-dur-instant` (80ms) → `--dy-dur-deliberate` (600ms)
- الأدوات: `dy-anim-fade-in` • `dy-anim-fade-up` • `dy-anim-fade-down` • `dy-anim-pop` • `dy-anim-glow` • `dy-anim-spin`
- الدخول المتسلسل: ضع `dy-anim-stagger` على الحاوية ويتأخر كل ابنٍ 40ms تلقائيًا
- **كل الحركة تُلغى تلقائيًا** مع `prefers-reduced-motion: reduce`

---

## 🌉 فرض الهوية عبر Tailwind (لا كسر توافق)

في `POS/tailwind.config.js`:
- **سلم `indigo` بالكامل أُعيد ربطه بسلم DyPOS الملكي** — كل الكود القائم الذي يستخدم
  `bg-indigo-600` و`text-indigo-700` وغيرها يكتسي هوية DyPOS فورًا دون تعديل أي مكوّن.
- سلم الهوية الرسمي متاح تحت `dypos-*` (مثل `bg-dypos-700`).
- سلم `mint-*` للأخضر الزمردي.
- رموز دلالية: `bg-dy-surface` • `text-dy-text` • `border-dy-border` • `bg-dy-primary`… (تتبدل مع الثيم تلقائيًا).
- ظلال الارتفاع: `shadow-dy-1` → `shadow-dy-5` + `shadow-dy-brand|dy-mint|dy-crimson`.
- استدارات موحدة: `rounded-md` = `--dy-radius-md` (12px)… إلخ.
- طبقات: `z-dy-nav` • `z-dy-modal` • `z-dy-toast`…
- لمس: `min-h-touch` (44px) • `min-h-touch-comfort` (48px).

---

## ✅ معايير الجودة المفروضة

| المعيار | التطبيق |
|---------|---------|
| WCAG 2.2 — أهداف اللمس | `--dy-touch-min: 44px` |
| WCAG — تقليل الحركة | إلغاء تلقائي شامل |
| التركيز المرئي | حلقة موحدة `--dy-ring` على كل العناصر التفاعلية |
| RTL | كل المكونات بمتغيرات منطقية (`inset-inline-*`) |
| الأرقام والعملات | `.dy-numeric` بأرقام جدولية معزولة LTR |
| الخطوط | Cairo عربي • Inter لاتيني • رمز الريال السعودي مدمج |
| الوصولية المخفية | `.dy-sr-only` للقارئات الصوتية |

---

## 🚀 دليل الهجرة

| القديم | الجديد الموحد |
|--------|---------------|
| ظلال عشوائية | `shadow-dy-1..5` |
| قيم `rounded-*` متفاوتة | سلّم الاستدارة الموحد |
| `z-[999]` وما شابه | `z-dy-*` |
| ألوان hex مباشرة في الكود | `text-dy-*` / `var(--dy-*)` |
| انتقالات مكتوبة يدويًا | `duration-dy ease-dy / ease-dy-spring` |

**قاعدة ذهبية**: لا قيم سحرية — كل قيمة تمر عبر رمز `--dy-*`.
