# DyPOS Deployment Guide — dypos.smartportssoft.com

## 🚀 النشر الآلي (المسار الافتراضي — أي دفع إلى `main` يصل للعملاء)

خط الأنابيب: `.github/workflows/deploy-cloudflare.yml`

```
push إلى main (أو تشغيل يدوي)
   → yarn install (POS)
   → npm run verify            (بوابة الجودة: اختبارات + noConsole)
   → yarn build                (مثبّت على إصدار package.json — لا طوابع زمنية)
   → node scripts/build-pages-site.mjs   (تجميع الموقع: إزالة Jinja + ?v= + SW root scope)
   → rm -f .pages-site/_redirects        (SPA عبر not_found_handling في Worker)
   → wrangler deploy --assets .pages-site (Cloudflare Workers Static Assets → dypos-pos)
   → تحقق حي: version.json + الحزمة الرئيسية على dypos.smartportssoft.com
```

> **مسار Pages القديم مهجور:** النشر كـ Worker بأصول ثابتة
> (`wrangler.toml` + `worker.js`). نطاق التوكن المطلوب:
> `Workers Scripts Edit` + `Zone Workers Routes Edit` (بدون قيود IP).

### مطلوب مرة واحدة (أنت فقط — التوكن لا يُكتب في المستودع أبدًا)
```bash
gh secret set CLOUDFLARE_API_TOKEN     # Workers Scripts Edit + Zone Workers Routes Edit (بدون IP restriction)
gh secret set CLOUDFLARE_ACCOUNT_ID    # Account ID من لوحة Cloudflare (Overview)
# اختياري:
gh secret set CF_ZONE_ID               # Zone ID لتنقية كاش إجبارية بعد كل نشر
```

### ربط النطاق بالـ Worker ✅ (تم 2026-09-24)
النطاق `dypos.smartportssoft.com/*` مربوط بالـ Worker `dypos-pos`
(Zone Workers Routes). أُضيف تلقائيًا في `wrangler.toml` `[[routes]]`
في كل نشر. إن انتهى التوكن أو تغيّر:

1. لوحة Cloudflare → Workers & Pages → `dypos-pos` → Settings → **Routes**
2. تأكد من: `dypos.smartportssoft.com/*` → Zone: `smartportssoft.com`
3. أو أضف صلاحية `Zone → Workers Routes Edit` للتوكن ثم `gh workflow run deploy-cloudflare.yml`

بدون هذا الربط يبقى الموقع الحي على القديم (`index-FF_1PWVh.js`) رغم نجاح deploy.

### تشغيل يدوي
```bash
gh workflow run deploy-cloudflare.yml          # من أي مكان
gh run watch                                    # أو: gh run list --workflow=deploy-cloudflare.yml
```

### نشر محلي بديل (Worker بدون CI)
```bash
yarn --cwd POS build
node scripts/build-pages-site.mjs
rm -f .pages-site/_redirects
npx wrangler deploy --name dypos-pos --assets .pages-site --compatibility-date 2026-09-24
```

---

## التحقق الحي بعد كل نشر
- `https://dypos.smartportssoft.com/` يُحمّل حزمة حديثة (hash يتغيّر كل build؛
  لا يظهر `index-FF_1PWVh.js` القديم)
- `https://dypos.smartportssoft.com/assets/DyPOS/pos/version.json` = الإصدار المتوقع
- `https://dypos.smartportssoft.com/pos.html` و SPA fallback (`/login`)
- `https://dypos.smartportssoft.com/assets/DyPOS/pos/sw.js` + `manifest.webmanifest` (200)
- دعم RTL بالعربية يعمل

## ملاحظات مسار IIS القديم (أرشيف — غير مستخدم في الإنتاج)
مسار النشر القديم (IIS + `deploy_dypos.bat` + `C:\inetpub\wwwroot`) متروك
للتوثيق التاريخي فقط. الإنتاج الحالي **Workers Static Assets** عبر CI
(`.github/workflows/deploy-cloudflare.yml`). لا يوجد IIS على خادم البناء.

## Version Info (حالي)
- **Version:** `1.36.0` (single source: root `package.json`)
- **Date:** September 24, 2026
- **Framework:** Vue 3 + Chart.js + frappe-ui
- **PWA:** Yes (SW root scope via Worker assets)
- **Deploy:** push to `main` → GitHub Actions → `wrangler deploy` → live verify
- **Live:** `https://dypos.smartportssoft.com/` serves Worker `dypos-pos`
  (bundle hash changes every build; verified by `?v=1.36.0` + `version.json`)
- **Tests:** server 362/362 · POS 552/552 · method contract 105/105 · biome 0 errors · pg parity OK
