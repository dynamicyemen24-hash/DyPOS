# DyPOS — نظام الطباعة وفق معايير SAP (تصميم شامل)

> الإصدار: 1.34 (تصميم) — الوضع: بانتظار الموافقة قبل التنفيذ
> النطاق: نظام Spool/طابور مهام طباعة مركزي، توجيه المخرجات، محرك نماذج مرن،
> سجل/إعادة طباعة، مراقبة من الواجهة.

---

## 1. الخلاصة التنفيذية

نظام الطباعة الحالي يعمل بشكل مباشر (fire-and-forget): عند ضغط "طباعة" يُستدعى
`silentPrintInvoice()` أو `printInvoiceCustom()`، وكل مسار يمسك الطابعة مباشرة،
وإذا فشل QZ يقع للـ browser print. لا توجد حالات موثقة، ولا إعادة محاولة ذكية،
ولا توجيه حسب نوع المستند، ولا نسخ متعددة، ولا سجل طباعة قابل للتدقيق، ولا
إعادة طباعة بأصل النموذج.

يقترح هذا التصميم تحويل طبقة الطباعة إلى نظام **Spool بمعايير SAP**:

- كل عملية طباعة تُسجَّل **Job** في طابور ثابت (IndexedDB) يحمل حالة موثقة
  (`QUEUED → PROCESSING → COMPLETED / FAILED / CANCELLED`).
- **Output Determination**: قواعد توجيه (نوع المستند → جهاز + نموذج + عدد نسخ).
- **محرك نماذج مرن**: كل نوع مستند له نموذج/قالب، قابلة للتخصيص (تذييل/ترويسة/
  شعار/QR/مقاس ورق) بعيداً عن الكود.
- **Reprint**: إعادة طباعة بأصل النموذج + تتبع "طُبع كذا مرة".
- **مراقبة**: شاشة Print Monitor لحالة الوظائف (إعادة محاولة/إلغاء/نسخ).
- طبقة سيرفر اختيارية لمزامنة السجل + إدارة القوالب/الأجهزة.

يُبنى بالكامل على البنية القائمة (QZ Tray، `printInvoice.js`، `hardware_devices`،
`document_print_configs`) دون تعطيل أي مسار حالي؛ الحوافز موجودة في الكود فتعمل فوراً.

---

## 2. مقابلة مفاهيم SAP → DyPOS

| مفهوم SAP | الاداة في SAP | المعادل في DyPOS |
|---|---|---|
| طلب الطباعة | Spool Request (SP01) | `PrintJob` في الطابور المحلي |
| جهاز الطباعة | Output Device (SPAD) | `hardware_devices` + طابعات QZ المكتشفة |
| توجيه المخرجات | Output Determination (NACE / Condition Records) | `print_routing_rules` |
| نموذج الطباعة | Smart Forms / Adobe Forms / SAPScript | `print_templates` (HTML + متغيرات) |
| وحدة التنفيذ | Print Controller / Host Spool | `PrintDispatcher` (العميل، تسلسلي لكل جهاز) |
| إعادة الطباعة | Reprint من SP02 | `reprintOf` + علامة "COPY" عند الاقتضاء |
| الأرشيف/التدقيق | ArchiveLink / SP00 | `print_history` + سجل محلي |
| معاملات الطباعة | Print Parameters (copies/tray/etc.) | `copies`, `paper`, `margin`, `orientation` |

---

## 3. بنية الطبقات

```
┌──────────────────────────────────────────────────────────────┐
│  الطبقة 1 — مصادر الطباعة (Callers)                            │
│  Checkout Success · EOD Shift · Reprint · Drafts · Reports    │
│  InvoiceHistory · OfflineList · Dashboard print                │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌────────────────PrintJob API (غير المباشر — لا يمسك الطابعة)────┐
│  submitPrintJob(job) → يبنى الـ payload ويسجل في الطابور فوراً   │
│  submitAndWait(job) → سابقة + انتظار الحالة النهائية            │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Output Determination (قواعد التوجيه) ──────────┐
│  docType + posProfile + silentPrint + qzState                  │
│  → deviceId · formId · copies · paper · priority · fallback    │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Spool / Queue (IndexedDB — Dexie) ─────────────┐
│  dypos_print_jobs  (ثبات عبر إعادة التحميل والوضع دون اتصال)     │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Print Dispatcher (مجدول التنفيذ) ──────────────┐
│  تنفيذ تسلسلي لكل deviceId · مهلة · تراجع بتزايد · Dead-letter  │
│  dispatch(job): QZ (HTML) → [Browser fallback] → mark printed  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Form Engine + QZ Tray ────────────────────────┐
│  formRenderer.render(job) → HTML (مع QR/متغيرات/أنماط)          │
│  qzTray.printHTML(html, printer, opts)                        │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Print Monitor UI ─────────────────────────────┐
│  قائمة وظائف: state · reprint · cancel · copies · retry        │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────── Server Sync (اختياري/مزامنة) ──────────────────┐
│  POST /api/print/jobs (history mirror, when online)            │
│  GET/PUT /api/print/templates · /api/hardware/devices (موجود)  │
└───────────────────────────────────────────────────────────────┘
```

**قاعدة ساسية**: الطباعة عملية **جهازية محلية** (QZ Tray على نفس الكاشير)، لذا
الطابور **محلي بالكامل** في IndexedDB — يعمل بدون إنترنت تماماً. السيرفر اختياري
للسجل/الإدارة فقط، ولا يدخل في مسار التنفيذ.

---

## 4. نموذج البيانات

### 4.1 عميل — جدول `dypos_print_jobs` (IndexedDB via Dexie)

```ts
interface PrintJob {
  id: string                    // uuid — مفتاح الوظيفة
  spoolNo: string              // رقم بشري SPR-000123 (مشترك/متراكم)
  docType: string              // invoice | eod | draft | quotation |
                               // return_receipt | report_daily | custom
  docId: string                // معرف المستند (invoice name / offline_id / shift)
  title: string                // تسمية العرض (فاتورة INV-01 …)
  status: PrintJobStatus       // QUEUED | PROCESSING | COMPLETED |
                               // FAILED | CANCELLED | PARTIAL
  payload: object              // لقطة بيانات المستند للطباعة (مجمدة)
  formId: string               // معرّف قالب النموذج
  deviceId: string             // معرّف الجهاز في hardware_devices أو "browser"
  copies: number               // عدد النسخ (≥1)
  priority: number             // 0 عادي · 1 عاجل (EOD/قفل)
  attempts: number             // عدد المحاولات
  maxAttempts: number          // حد إعادة المحاولة
  lastError: string | null     // آخر رسالة خطأ
  qzPrinter: string | null     // اسم طابعة QZ عند التنفيذ
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  reprintOf: string | null     // معرّف الوظيفة الأصلية عند إعادة الطباعة
  printedCount: number         // إجمالي مرات طباعة نفس المستند تاريخياً
  requestedBy: string          // اسم المستخدم
  terminalId: string           // معرّف الكاشير
  pendingRetryTime: number | null // وقت الإعادة المجدول (تراجع)
}

type PrintJobStatus =
  | "QUEUED" | "PROCESSING" | "COMPLETED"
  | "FAILED" | "CANCELLED" | "PARTIAL"
```

### 4.2 عميل — جدول `dypos_print_history` (سجل دائم، غير قابل للحذف عبر الجلسة)

سجل قراءة-فقط: لكل وظيفة `jobId`, docType, docId, printer, copies, status,
requestedBy, terminalId, timestamps, reprintOf. يُملأ من الطابور عند كل تغيّر
حالة ويُمسح محلياً بالحد الأقصى (مثلاً 2000 سجل) أو يُرفع للسيرفر.

### 4.3 سيرفر — جداول قائمة (تُوسَّع)

| الجدول الحالي | الإضافة المقترحة |
|---|---|
| `hardware_devices` | إضافة `copies_default`, `paper_size`, `is_fallback_browser`, `enabled` |
| `document_print_configs` | إضافة `template_body` (HTML مرن + متغيرات), `copies`, `orientation`, `priority` |
| `hardware_audit_logs` (موجود) | يُستخدم كما هو لتسجيل إجراءات الطباعة |

### 4.4 سيرفر — جدول جديد اختياري `print_jobs_mirror`

للمزامنة عند الاتصال فقط: `id, spool_no, doc_type, doc_id, status, copies,
finished_at, requested_by, terminal_id, reprint_of, payload_hash`. يُرفع عبر
`POST /api/print/jobs` مع `idempotency` بالمفتاح `job:id`.

---

## 5. آلة الحالة (Spool State Machine)

```
               submitPrintJob()
                     │
                     ▼
             ┌──► [QUEUED] ───────  cancel()  ───► [CANCELLED]
             │       │
             │    dispatch()
             │       ▼
             │  [PROCESSING] ── per-copy loop ──► [COMPLETED]
             │       │
             │    error/timeout
             │       ▼
             │  [FAILED] ───── retry()/auto-retry (backoff) ──► [QUEUED]
             │       │
             │   maxAttempts,لم يعد ممكناً
             │       ▼
             │  [FAILED] (dead-letter) — يُظهر في Monitor/Reprint
             │
             └─ copies>1 وفشل البعض بعد نجاح آخرين ──► [PARTIAL] → retry الباقي
```

قواعد النزاع:
- **QZ غير متاح** → لا نلوّث CE: `FAILED` مع `maxAttempts` تزايدي، ويظهر
  `Reprint`/`Browser fallback` للمشغّل. (سلوك جلسة القفل الحالية محفوظ بحذر.)
- **مهلة** كل وظيفة (افتراضي 15 ثانية) → محاولة جديدة بتراجع أسي
  (1s→2s→4s… حتى 60s، حد أقصى 3 محاولات يدوية + تلقائية).
- **نسخ متعددة** → تُطبع تسلسلياً في نفس الجلسة؛ إذا فشل بعضها تُعامل كـ `PARTIAL`
  وتُعاد للمتبقي.
- **الترتيب**: له الأولوية داخل نفس `deviceId` (FIFO عادل) وبين الأجهزة (متوازي).
  وظائف `priority=1` تسبق في الصف.
- **Idempotency**: لا تُنشأ وظيفة مكررة لنفس `(docType, docId, reprintOf)` خلال
  نافذة 3 ثوان (يُدمج النقر المتكرر على زر الطباعة).

---

## 6. Output Determination — قواعد التوجيه

القواعد تُقرأ من `document_print_configs` (سيرفر) مع خيار تجاوز محلي في
`localStorage` (للمرونة في فرع يتعامل مباشرة مع QZ). ترتيب أولوية تطبيق القاعدة:
`productCard → posProfile match → docType match → default`.

قاعدة نموذجية (JSON):

```json
{
  "docType": "invoice",
  "match": { "silentPrint": true, "profile": "*" },
  "deviceId": "dev-thermal-1",
  "formId": "cfg-invoice",
  "copies": 1,
  "paper": "80mm",
  "priority": 0,
  "fallback": ["browser"]
}
```

سلوك القرار:
1. يحلّل `outputDetermination.resolve(jobCtx)` → `{deviceId, formId, copies, paper}`.
2. **لا يمسك الطابعة في هذه المرحلة** أبداً — القرار بيانات فقط.
3. إذا كان `silent_print` مفعّلاً لكن QZ غير متاح → `fallback` يتضمن `browser`:
   يفتح `/printview` أو النموذج المحلي بالحوار (المسار الحالي محفوظ).

---

## 7. محرك النماذج المرن (Form Engine / قوالب قابلة للتخصيص)

### المبدأ
النموذج = **قالب HTML منشعب إلى Blocks** + بيانات المستند. لا كود طباعة مدمج في
القالب — القالب مزوّد بمتغيّرات وتخطيط مسبق.

### كتل النموذج المدمجة (Blocks)
- `header`: اسم المنشأة/الشعار/VAT — من `company_*` الموارد وبطاقة ZATCA.
- `invoice_info`: الرقم/التاريخ/العميل/الفرع/رقم الضريبة.
- `items`: جدول الأصناف (اسم/كمية/سعر/خصم/ضريبة/سيريال) مدعوم بالخصومات والهدايا.
- `totals`: المجموع الفرعي/الضريبة/الخصم الإضافي/الإجمالي/المدفوع/المتبقي.
- `payments`: طرق الدفع/التغيير.
- `qr`: **QZ الأول:** Base64 TLV (ZATCA) يُعرض كـ `<img>`؛ عند غياب الـ VAT
  يقع إلى JSON payload (توافق/تطوير) — نفس منطق `print.js:zatcaQrBase64`.
- `footer`: رسالة الشكر/التذييل القابلة للتخصيص (من `document_print_configs`).

### التخصيص المرن
- **متغيرات** بسيطة: `{{company_name}}`, `{{invoice_no}}`, `{{customer}}`,
  `{{grand_total}}`, `{{payment_methods}}` … من `formData` المجمد.
- **CSS** لكل قالب + حقول `primary_color`, `font_family` من الـ config.
- **مقاسات**: `80mm / 58mm / A4` + `orientation` — تُمرَّر إلى
  `qzTray.createHTMLPrintConfig` (بنية موجودة في `normalizePrintOptions`).
- **تجاوز HTML**: حقل `template_body` في config يكتب كتلة مخصصة كاملة
  (للمطورين/المتقدمين) بدل الكتل المدمجة. يُفسَّر عبر تقييم آمن `{{var}}` فقط —
  لا `v-html` مع كود خارجي دون تعقيم.
- **نسخ**: `copies` من القاعدة؛ قابل لتغيير يدوي من Monitor.

### تنفيذ التقديم
- `formRenderer.render(job)` → `{html, paper, orientation, printer}`:
  - يستخدم `buildReceiptHTML` (الموجود) للمستندات المحلية/المؤجلة.
  - يستخدم `frappe.www.printview.get_html_and_style` أو `silentPrintDoc`
    للمستندات المسجلة — عبر `printInvoice.js` الحالي دون تغيير المسارات.
  - يدمج `printStyles` عند الحاجة (لوحات/تقارير A4).
- **لا يحدث أي طبع من داخل الـ renderer** — يعيد الـ HTML فقط.

### شاشة تحرير القوالب (السيرفر/الإدارة)
- `GET/PUT /api/print/templates` لعرض/تعديل `document_print_configs` + `template_body`.
- الواجهة: `POSSettings.vue` → قسم "Printing & Peripherals" → تبويب **Templates**.

---

## 8. تنفيذ Order/dispatch (Print Controller)

```ts
// كل deviceId له "ممر تنفيذ" مستقل:
for (job of nextReadyJobs(sortByPriorityThenCreated)) {
  const html = await formRenderer.render(job)   // لا يطبع
  const ok = await dispatchToDevice(job, html)  // QZ → fallback
  if (ok) markCompleted(job)
  else scheduleRetry(job)                       // backoff
}
```

- **التسلسل**: داخل نفس الجهاز تُنفَّذ واحدة تلو الأخرى (عازل ضد تداخل الإيصالات).
- **المحاولة العاجلة**: وظائف EOD/قفل لها `priority=1` وتقطع الوظائف غير الحرجة
  المنتظرة.
- **إعادة الاتصال**: الاستدعاء يمر عبر `connect()` الحالي الذي يعيد الاتصال
  داخلياً → لا حاجة لمنطق إضافي هنا.
- **علامة الطباعة المؤجلة**: عبر `markOfflineInvoicePrinted` (الموجود) عند نجاح
  الطباعة للفواتير المحلية، كي تظهر `was_printed` في `OfflineInvoicesDialog`.

---

## 9. إعادة الطباعة (Reprint) والنسخ

- **Reprint من السجل**: `reprintPrintJob(jobId)` → ينسخ `payload` الأصلي + `formId`
  وينشئ Job جديدا بـ `{reprintOf: jobId, printedCount: job.printedCount+1}`.
  النموذج يرسم **علامة COPY** إذا كان `reprintOf != null` (ميزة أمنية بمعايير SAP
  للنسخ الأصلية).
- **النسخ**: لكل `copy` في الوظيفة يُدمج `{{copy_no}}/{{total_copies}}` في النموذج
  عند الطلب.
- **منع فقدان الأصل**: عند تعديل فاتورة محلية طُبعت (`was_printed`) يبقى التحذير
  الحالي في `OfflineInvoicesDialog` — لا يتغير السلوك.

---

## 10. التكامل (نقاط النداء الحالية → PrintJob API)

| النقطة الحالية | الملف | الاستبدال |
|---|---|---|
| طباعة بعد نجاح الكاش | `POSHeader`/ZATCAHeader `printer-click` → `printInvoice` | `submitPrintJob({docType:"invoice", docId})` |
| طباعة يدوية من السجل | `InvoiceHistoryDialog` `print-invoice` | `submitAndWait` |
| طباعة من الفواتير | `InvoiceManagement` `print-invoice` | `submitPrintJob` |
| فاتورة معلقة محلياً | `OfflineInvoicesDialog` `print-invoice` | `submitPrintJob` (hydrate محفوظ) |
| المسودة | `DraftInvoicesDialog.printInvoiceCustom` | `submitPrintJob({docType:"draft"})` |
| EOD | `ShiftClosingDialog.printEODReport` | `submitPrintJob({docType:"eod", priority:1})` + keep retry UI |
| لوحات A4 | `DashboardShell/DashboardLayout handlePrint` | `submitPrintJob({docType:"report_daily", paper:"A4"})` |

كل النقاط تحافظ على **اشتراكها الحالي** (إشارة نجاح/خطأ) إلا أنها تمر عبر الطابور
بدل الإمساك المباشر بالطابعة.

---

## 11. شاشة المراقبة (Print Monitor UI)

`components/printing/PrintMonitor.vue` — مفتوح من أيقونة الطابعة (حالة QZ) أو من
الإعدادات:
- جدول الوظائف: `spoolNo`, نوع، مستند، جهاز، نسخ، حالة، خطأ، أزرار
  `Retry` / `Cancel` / `Reprint`.
- عدّادات لحظية: قيد الانتظار، تعمل، مكتملة اليوم، فشلت.
- فلاتر: بالحالة/المستند/الجهاز.
- يُفتح عند الحاجة (لا عند كل فاتورة) ولا يزاحم الشاشة الرئيسية.

---

## 12. واجهات السيرفر (اختيارية — مزامنة/إدارة)

| الطريقة | المسار | الاستخدام |
|---|---|---|
| POST | `/api/print/jobs` | رفع سجل وظائف (history mirror, idempotent) |
| GET | `/api/print/configs` | موجود (`printConfigs.js`) — للقوالب |
| PUT | `/api/print/configs/:docType` | موجود — تحديث القوالب |
| GET/POST | `/api/hardware/devices` | موجود (`hardware.js`) — الأجهزة |
| PUT | `/api/hardware/devices/:id` | جديد — تحديث جهاز (نسخ/مقاس/تعطيل) |

لا يتطلب هذا التصميم تغيير بروتوكول QZ أو الـ signing الحالي
(`get_certificate`/`sign_message`).

---

## 13. خطة الملفات (Files)

### جديد (عميل)
- `POS/src/print/spool/printJobStore.js` — Pinia store + Dexie (تخزين الطابور/السجل).
- `POS/src/print/spool/printJobFactory.js` — بناء Job + spool numbering.
- `POS/src/print/spool/printDispatcher.js` — مجدول التنفيذ وآلة الحالة.
- `POS/src/print/rules/outputDetermination.js` — قواعد التوجيه + cache.
- `POS/src/print/forms/formRenderer.js` — التقديم (QB/HTML/أنماط).
- `POS/src/print/history/printHistory.js` — سجل + Reprint + sync to server.
- `POS/src/print/index.js` — الواجهة العامة `submitPrintJob`, `submitAndWait`,
  `reprintPrintJob`, `getPrintStatus`.
- `POS/src/components/printing/PrintMonitor.vue`.

### تعديل (عميل)
- `POS/src/utils/printInvoice.js` — يُبقى الكود الكامل لكن يُضاف ممر عبر الطابور
  للنداءات الجديدة (لا حذف مسارات).
- `POS/src/utils/printEod.js` — عبر الطابور بلا تغيير صيغة النداء.
- `POS/src/components/settings/POSSettings.vue` — ربط Monitor + أجهزة.
- `POS/src/main.js` — init الطابور بعد bootstrap.

### سيرفر (اختياري، لاحقاً إن أُريد السجل المركزي)
- `server/routes/printJobs.js` (جديد) + `server/routes/printConfigs.js` (توسعة).

### اختبارات (Vitest — البنية موجودة)
- `POS/tests/print/outputDetermination.test.js` — القواعد/الأولوية/الـ fallback.
- `POS/tests/print/jobStateMachine.test.js` — انتقالات الحالة/التراجع/الحد الأقصى.
- `POS/tests/print/idempotency.test.js` — دمج النقر المكرر.
- `POS/tests/print/formRenderer.test.js` — تعويض المتغيرات + ZATCA QR fallback.

---

## 14. التحقق / خطوات القبول

البوابة الآلية: `cd POS && npm run verify:print` (مجموعة اختبار الطابعة كاملة).

| # | الخطوة | الحالة |
|---|--------|--------|
| 1 | `npm run verify` (vitest + biome) | تلقائي — أخضر ✅ |
| 4 | طباعة مزدوجة سريعة → وظيفة واحدة (idempotency) | تلقائي — `tests/print/idempotency.test.js` |
| 5 | نسخ = 2 → نسختان مع `copy_no` | تلقائي — `tests/print/acceptanceFlow.test.js` |
| 6 | Reprint → `reprintOf` + COPY watermark | تلقائي — `tests/print/acceptanceFlow.test.js` |
| 8 | EOD أثناء فاتورة → يسبقها (priority) | تلقائي — `tests/print/acceptanceFlow.test.js` |
| 3 | غلق QZ → FAILED + زر Reprint (لا تعليق) | آلي جزئياً (`dispatcherFlow`) + فحص جهاز |
| 2 | فاتورة ناجحة → QZ → COMPLETED + `was_printed` | **يدوي — جهاز QZ حقيقي** |
| 7 | عبر الإنترنت وغير متصل → سلوك واحد | **يدوي — تبديل الحالة على الجهاز** |

### سكربت الفحص اليدوي للجهاز (البنود 2 و3 و7)

على محطة كاشير مثبت عليها QZ Tray وطابعة:

1. شغّل POS → أجرِ بيعاً مكتملاً → تأكد أن زر «طباعة آخر فاتورة» (في رأس
   الشاشة، يظهر عندما يكون `allow_print_last_invoice` مفعّلاً) يوضّب الوظيفة
   (`SPR-xxxxxx`) ويطبع خلال ثوانٍ، وتظهر الحالة `COMPLETED` في Print Monitor،
   وتُعلَّم الفاتورة المؤجلة محلياً `was_printed`.
2. أغلق QZ Tray → اضغط الطباعة → انتظر فشل البند البري: الوظيفة → `FAILED` مع
   رسالة الخطأ وزر Retry/Reprint في Print Monitor، ولا يُعلّق تنفيذ البيع أبداً.
3. افتح QZ Tray → اضغط Retry → تعود الوظيفة وتُطبع (أطوال backoff 1s→2s→4s).
4. افصل الانترنت وقم ببيع آفلان → نفس المسار (بلا تنازل) — ثم أعد الاتصال.
5. افتح وظيفتين (فاتورة + EOD) دفعة واحدة → يتقدم EOD أولاً (priority 1).

---

## 15. الحدود / الملاحظات

- إعادة الطباعة للفواتير المؤجلة محلياً تُطبَع من `hydrateLocalOnlyInvoice`
  (سلوك قائم) — بعد المزامنة تُطبع من السيرفر.
- `PARTIAL` حالة طارئة للنسخ المتعددة فقط؛ لا تُستخدم لـ EOD.
- لا يُضاف أي اعتماد جافاسكربت جديد (Dexie موجود، QZ موجود).
- تصميم لا يتطلب تغيير الـ schema للمستخدمين الحاليين قبل موافقة الإدارة؛
  التوسعات على السيرفر تُدار بـ migrations كـ `db.exec CREATE TABLE IF NOT EXISTS`.