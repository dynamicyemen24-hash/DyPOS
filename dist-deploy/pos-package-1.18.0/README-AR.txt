DyPOS — حزمة النشر الإنتاجية v1.18.0
========================================

المحتويات:
- pos.html ......... الواجهة (عربية RTL، بدون Jinja، مع كسر كاش ?v=1.18.0)
- assets\DyPOS\pos . ملفات البناء الجديدة (تحوي شاشات الدخول/التسجيل العربية)
- web.config ....... حماية IIS (CSP/HSTS + منع كاش HTML و SW)
- ORIGIN-DEPLOY.bat  سكربت النشر على خادم الأصل (يحذف الملفات القديمة تلقائياً)

خطوات النشر على الخادم الأصل (Origin):
1) انسخ مجلد الحزمة كاملاً إلى الخادم الأصل.
2) شغّل ORIGIN-DEPLOY.bat كمسؤول (Run as Administrator).
3) تأكد من ظهور: LOCAL BUILD 1.18.0 OK ثم LIVE VERSION 1.18.0 OK
   (النص الحرفي من ORIGIN-DEPLOY.bat — ابحث عنه كما هو).

Cloudflare (مهم — وإلا ستستمر الشاشة القديمة):
1) افتح: dash.cloudflare.com → smartportssoft.com → Caching → Purge Cache
2) Purge Everything — أو Custom Purge لهذه الروابط الثلاثة:
   - https://dypos.smartportssoft.com/pos.html
   - https://dypos.smartportssoft.com/assets/DyPOS/pos/*
   - https://dypos.smartportssoft.com/sw.js
3) Rules → Caching: اجعل pos.html و sw.js و version.json = Bypass cache
   (ملف web.config يضبطها من جهة IIS أيضاً).

في المتصفح (لكل جهاز اختبار):
1) Ctrl+Shift+R (تحديث صلب)
2) DevTools → Application → Service Workers → Unregister ثم Clear site data
3) أعد فتح https://dypos.smartportssoft.com/pos.html
4) تحقق من الفوتر/الكونسول: يجب أن تظهر النسخة 1.18.0
   (افتح version.json للتأكد: /assets/DyPOS/pos/version.json)

ملاحظة: مجلد C:\inetpub\wwwroot على جهاز التطوير الحالي ليس هو خادم
الإنتاج (لا توجد خدمة IIS عليه) — النشر الحقيقي يجب أن يتم على الخادم
الأصل الذي يشير إليه سجل DNS ثم تنقية كاش Cloudflare.