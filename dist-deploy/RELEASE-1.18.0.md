# إصدار DyPOS 1.18.0 — تعليمات النشر على الأصل (Origin Publish)

> الحزمة: `dist-deploy/pos-package-1.18.0.zip` — لا تُنفَّذ من هنا. المشغّل البشري ينفّذ على خادم الأصل فقط كمسؤول.

## 1) محتويات الإصدار
- `pos.html` — واجهة عربية RTL، بدون Jinja، كسر كاش `?v=1.18.0`، تشير إلى `index-BhIo9O6U.js`.
- `assets/DyPOS/pos/` — بناء الإنتاج الجديد (يستبدل `index-BtwtUPYI.js` القديم الحي).
- `assets/DyPOS/pos/version.json` — `{"version":"1.18.0"}`.
- `web.config` — حماية IIS (CSP/HSTS + منع كاش HTML و SW).
- `ORIGIN-DEPLOY.bat` — مرآة robocopy `/MIR` تحذف المقاطع القديمة تلقائيًا + تحقق محلي وحي.
- الإصلاح: الموقع الحي كان يقدّم `pos.html` خامًا بوسوم Jinja (`{% for key in boot %}`) وبدون كسر كاش.

## 2) أوامر المشغّل على الأصل (بالترتيب)
1. انسخ مجلد الحزمة كاملًا إلى خادم الأصل:
   ```cmd
   xcopy /E /I /Y D:\SulationDy\DyPOS\dist-deploy\pos-package-1.18.0 C:\Temp\pos-package-1.18.0
   ```
2. شغّل كمسؤول (Run as Administrator):
   ```cmd
   C:\Temp\pos-package-1.18.0\ORIGIN-DEPLOY.bat
   ```
   السكربت ينفّذ: `[1/5]` مرآة `assets` → `C:\inetpub\wwwroot\assets`، `[2/5]` نسخ `pos.html` + `web.config`، `[3/5]` إعادة تشغيل `iisreset /restart`، `[4/5]` تحقق محلي، `[5/5]` تحقق حي.
3. المخرجات المتوقعة:
   - `LOCAL BUILD 1.18.0 OK` (= ‏`BUILD 1.18.0 LIVE` المطلوب محليًا)
   - `LOCAL JINJA CLEAN (GOOD)`
   - `live pos.html: 200`
   - `LIVE VERSION 1.18.0 OK`
   - `live bundle index-BhIo9O6U.js: 200`
   - `LIVE CSP OK`
   - `DONE. Expected: 200 / OK / 200 / CSP OK.`

## 3) تنقية Cloudflare (إلزامي — وإلا بقيت الشاشة القديمة)
1. افتح `dash.cloudflare.com` ← ‏`smartportssoft.com` ← ‏`Caching` ← ‏`Purge Cache`.
2. نفّذ `Purge Everything`.
3. ثم `Custom Purge` لهذه الروابط الثلاثة:
   - `https://dypos.smartportssoft.com/pos.html`
   - `https://dypos.smartportssoft.com/assets/DyPOS/pos/version.json`
   - `https://dypos.smartportssoft.com/assets/DyPOS/pos/assets/index-BhIo9O6U.js`

## 4) تحقق ما بعد النشر
| الفحص | الأمر/الرابط | القيمة المتوقعة |
|---|---|---|
| `pos.html` | `curl -i https://dypos.smartportssoft.com/pos.html?v=1.18.0` | `200`، لا توجد `{% for`، يوجد `?v=1.18.0` |
| `version.json` | `curl https://dypos.smartportssoft.com/assets/DyPOS/pos/version.json` | `"version": "1.18.0"` |
| الحزمة | `curl -o NUL -w "%{http_code}" .../assets/DyPOS/pos/assets/index-BhIo9O6U.js` | `200` |
| CSP | `curl -D - -o NUL .../pos.html \| findstr CSP` | `content-security-policy` موجود (من `web.config`) |
| المتصفح | `Ctrl+Shift+R` + مسح Service Worker ثم فتح `/pos.html` | الفوتر/الكونسول يعرض `1.18.0` |

## 5) التراجع (Rollback إلى 1.17.0)
1. على الأصل كمسؤول: انسخ `pos-package-1.17.0` ثم شغّل `ORIGIN-DEPLOY.bat` الخاص به (يعيد المرآة إلى بناء 1.17.0).
2. نفّذ `Purge Everything` في Cloudflare + تنقية نفس الروابط الثلاثة لنسخة 1.17.0.
3. تحقق: `version.json` = `1.17.0` و `pos.html` = `200`.

## 6) بصمة الحزمة
- الملف: `dist-deploy/pos-package-1.18.0.zip`
- `SHA256: CF7DF990446A38DC140DC8CC53BF7B25056D7B9C7B46E490162450A187D3A976`
- عدد الملفات: `71` ملفًا — مطابق لمجلد `pos-package-1.18.0/` (‏`71` ملفًا).

## 7) فروقات سابقة — أُصلحت قبل التسليم
1. ~~مسار مختصر للحزمة في الدليل~~ → أصبح `assets/DyPOS/pos/assets/index-BhIo9O6U.js`.
2. ~~نص `BUILD 1.18.0 LIVE`~~ → أصبح النص الحرفي `LOCAL BUILD 1.18.0 OK` / `LIVE VERSION 1.18.0 OK`.
3. ~~رابطا تنقية في README~~ → أصبحت 3 روابط صريحة (القسم 3).
