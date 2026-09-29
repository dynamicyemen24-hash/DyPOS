# DyPOS Deployment Guide — dypos.smartportssoft.com

## حالة النشر الآن (2026-09-29)
- **الإصدار المستهدف:** `1.40.0`. إذا كان النطاق الحي يعرض إصدارًا أقدم، يعتبر النشر **فاشلًا** ولا يجوز اعتباره مكتملًا حتى تتطابق الواجهة والـAPI مع `main`.
- **العطل السابق مُثبَت برمجيًا** (لا استنتاج): `scripts/pages-preflight.mjs` كان
  يحصل على `HTTP 403` + `code 10000` على `GET /accounts/{id}/pages/projects`
  بعد نجاح `/user/tokens/verify` — أي أن المشروع موجود والرمز صالح، لكن
  `Cloudflare Pages:Edit` كانت غائبة. تم تحديث الرمز قبل تشغيل هذه الدفعة.
- كل بوابات ما قبل النشر خضراء (اختبارات + lint + parity + عقد + ميزانية البناء)،
  و`npm run verify:live` يعطي 6/6 على الموقع الحالي ويفشل بسبب واحد فقط:
  `version.json = 1.37.0` بينما المستودع على `1.40.0` — أي أن البوابة تصف
  العطل بدقة بدل أن تصمت.

### صلاحيات رمز النشر (لا تُكتب قيمة التوكن في المستودع أبدًا)
- **Account → Cloudflare Pages → Edit** لنشر `dypos-pos`.
- **Account → Workers Scripts → Edit** لنشر Worker `dypos-api`.
- **Zone → Workers Routes → Edit** عند إنشاء أو تعديل route لأول مرة.
- `Zone → Cache Purge` اختيارية لتنقية الكاش، وبدون IP allowlist لأن رنّرات GitHub
  ليست في قائمة ثابتة.

> إن ردّت Cloudflare `Contact account super admin` فالحساب نفسه يمنع الصلاحية
> ويتطلّب مديرًا أعلى ليمنحها.

## 🚀 النشر الآلي (المسار الافتراضي — أي دفع إلى `main` يصل للعملاء)

خط الأنابيب: `.github/workflows/deploy-cloudflare.yml`

```
push إلى main (أو تشغيل يدوي)
   → npm ci (POS)                      مثبّت على POS/package-lock.json
   → npm run verify                    بوابة الجودة: vitest + lint + vue-tsc
   → npm ci (server) + npm run lint && contract && parity
   → npm run build:pages               base "/" + sw.js في جذر النطاق + مسح outDir
   → npm run size                      ميزانية الحزمة (gzip JS+CSS ≤ 900KB)
   → فحص التوكن + wrangler pages deploy POS/dist/pos --project-name=dypos-pos
   → wrangler deploy --config wrangler.api.toml (dypos-api)
   → node scripts/verify-live.mjs      تحقق حي: النطاق يقدّم إصدار هذا المستودع
```

**لماذا زيادة رقم الإصدار جزء من الإصدار لا زينة:** التحقق الحي يقارن
`/version.json` برقم `package.json` — فبلا زيادة يمرّ التحقق فوق نشر **فاشل**،
لأن النطاق يقدّم الرقم القديم سلفًا. لذلك كل إصدار يرفع الرقم في المصادر الأربعة
(`package.json` + `POS/package.json` + `server/package.json` + `server/lib/version.js`).

### مطلوب مرة واحدة
```bash
gh secret set CLOUDFLARE_API_TOKEN     # Pages Edit + Workers Scripts Edit (+ Routes Edit عند الحاجة)
gh secret set CLOUDFLARE_ACCOUNT_ID    # Account ID من لوحة Cloudflare (Overview)
# اختياري:
gh secret set CF_ZONE_ID               # Zone ID لتنقية كاش إجبارية بعد كل نشر
```

### تشغيل يدوي
```bash
gh workflow run deploy-cloudflare.yml          # من أي مكان
gh run watch                                    # أو: gh run list --workflow=deploy-cloudflare.yml
```

### نشر محلي بديل (بلا CI — يحتاج npx wrangler وتوكن صالح في البيئة)
```bash
npm --prefix POS run build:pages
npx wrangler pages deploy POS/dist/pos --project-name=dypos-pos --branch=main
npx wrangler deploy --config wrangler.api.toml
npm run verify:live
```

---

## التحقق الحي بعد كل نشر
قياس واحد، نفس الملف للبشر و CI والـheartbeat:
```bash
npm run verify:live                     # = node scripts/verify-live.mjs
node scripts/verify-live.mjs --site=http://127.0.0.1:8080    # أي أصل آخر
```
يفحص 6 عهود على النطاق الحي ويرد **1** إن سقط أي منها:
- `/version.json` = رقم إصدار المستودع (طابع الإصدار)
- `/` → 200 والحزمة المُشار إليها (`/assets/index-*.js`) تُخدَم فعلًا 200
- `/sw.js` → 200 (Service Worker بمدى الجذر = Offline-First)
- `/manifest.webmanifest` → 200 (قابل للتثبيت)
- `/pos/deep-link-probe` → 200 + قوقعة التطبيق (الرابط العميق لا يكسر Ctrl+F5)
- `/api/health` → 200 + `version === package.json.version` (تطابق إصدار الـAPI مع الواجهة)

> **نبض الإنتاج**: `.github/workflows/uptime.yml` يشغّل نفس السكربت كل 15 دقيقة.
> الفحوص القديمة كانت تستطلع `/assets/DyPOS/pos/version.json` وتطلب حزمة `?v=` —
> مسارات تخطيط Worker المتقاعد، فكان النبض أحمر على موقع سليم.

## ملاحظات مسار IIS القديم (أرشيف — غير مستخدم في الإنتاج)
مسار النشر القديم (IIS + `deploy_dypos.bat` + `C:\inetpub\wwwroot`) متروك
للتوثيق التاريخي فقط. الإنتاج الحالي **Cloudflare Pages** عبر CI
(`.github/workflows/deploy-cloudflare.yml`). لا يوجد IIS على خادم البناء.

## Royal production runbook (subscriber #1)
المشترك الأول: **رويال العالمية لتجارة أدوات التجميل والعطور** (`RGT`).
```powershell
cd server
   node db/migrate.js      # schema v24
npm run seed:royal      # 64 SKUs + stock + users (atomic, idempotent)
npm run e2e:royal       # 14-check proof: login→shift→sale→pay→stock→void→close
```
- البذر ذري (`BEGIN/COMMIT`) وآمن للمفاتيح (`ON CONFLICT DO UPDATE` — لا حذف).
- كلمات المرور bcrypt حقيقية (تُطبع مرة واحدة)؛ حساب `admin` يُجبر على التغيير.
- سكربت E2E يلغّي فاتورته ويغلق ورديته — قاعدة الإنتاج تبقى نظيفة.

## Version Info (حالي)
- **Version:** `1.40.0` (single source: root `package.json`)
- **Date:** September 29, 2026
- **Framework:** Vue 3 + Chart.js + dypos-ui
- **PWA:** Yes (SW root scope، `build:pages` → `POS/dist/pos`)
- **Deploy:** push to `main` → GitHub Actions → Cloudflare Pages + `dypos-api` Worker → `npm run verify:live`
- **Live قبل هذه الدفعة:** `https://dypos.smartportssoft.com/` يقدّم `1.37.0`؛ يُحدّث
  إلى `1.40.0` بعد نجاح خط النشر والتحقق الحي.
- **Tests:** server 463/463 (147 مجموعة) · POS 1028/1028 (70 ملفًا) · method contract
  64 فعلًا / 64 مغطّى · biome 0 errors · pg parity OK · بوابة وصولية بلا كود ميت
  (`POS/tests/deadCode.test.js` + `server/tests/deadCode.test.js`)

## Backend topology (why `/api` needs an origin)
- Cloudflare Pages serves the frontend from `dypos-pos`; a separate `dypos-api` Worker owns
  same-origin `/api/*` and returns `/api/ping` directly.
- The Express API can run on a VPS (`docker compose up -d`) and be exposed through a
  Cloudflare Tunnel (`docker compose --profile tunnel up -d cloudflared` with
  `CLOUDFLARED_TOKEN`). Keep the API origin and credentials in deployment secrets; never
  commit them to the repository.
