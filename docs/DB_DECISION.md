# DyPOS — قرار طبقة قاعدة البيانات (محسوم)

## القرار
- **الآن (Tier-1):** SQLite كاتب-واحد (WAL + `busy_timeout` + مفاتيح خارجية) هو قاعدة الإنتاج.
  السقف: متجر/سلسلة صغيرة — عشرات النقاط، حتى ~مليون فاتورة/سنة لكل عقدة.
- **لملايين المشتركين (Tier-2):** PostgreSQL — ملف `server/db/schema-postgres.sql`
  مطابق لمخطط v3 (نقود `NUMERIC`, فهارس idempotency, جلسات). ترحيل درايفر التطبيق
  عمل لاحق مُتتبَّع، وليس تبديلًا صامتًا.

## ضمانات مطبقة في الكود
- `server/db/mode.js`: إذا ضُبط `DYPOS_DATABASE_URL=postgres://...` يرفض الإقلاع
  برسالة صريحة بدل الكتابة الصامتة في SQLite الخاطئة.
- `server/middleware/requirePrimary.js`: مع `DYPOS_READ_ONLY=1` تُرفض كل الطفرات
  بـ `409 READ_ONLY_REPLICA` (إعادة المحاولة على الكاتب الأساسي).
- `GET /api/health` يعرض `mode` و `size_bytes` لتخطيط السعة.
- `GET /api/admin/db/integrity` (ADMIN): فحص `PRAGMA integrity_check`.

## متى ننتقل إلى Tier-2؟
- حجم ملف SQLite يقترب من عشرات GB، أو كتابة متزامنة من عدة عقد، أو حاجة
  multi-tenant بصلاحيات على مستوى الصف (RLS). عندها: نشر Postgres + استيراد
  المخطط + ترحيل الدرايفر + اختبار الحمل `k6` قبل التحويل.
