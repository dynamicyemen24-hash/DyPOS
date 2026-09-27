# DyPOS Deployment Guide — dypos.smartportssoft.com

## حالة النشر الآن (2026-09-27)
- **الموقع حيّ ويعمل** ويقدّم الإصدار `1.37.0` (بناء 2026-09-26) — أي **قبل** آخر
  عمل على `main`.
- **كل عمليات النشر من CI فاشلة منذ 2026-09-25** (12 محاولة متتالية): التوكن
  يجتاز فحص `/user/tokens/verify` لكنه لا يملك صلاحية `Cloudflare Pages:Edit`،
  فيرد Cloudflare بـ `Authentication error [code: 10000]` عند الرفع.
- كل بوابات ما قبل النشر خضراء (اختبارات + lint + parity + عقد + ميزانية البناء)،
  و`npm run verify:live` يعطي 6/6 على الموقع الحالي ويفشل بسبب واحد فقط:
  `version.json = 1.37.0` بينما المستودع على `1.38.0` — أي أن البوابة تصف
  العطل بدقة بدل أن تصمت.

### الخطوة الواحدة المطلوبة (للمالك فقط — لا تُكتب قيمة التوكن في المستودع أبدًا)
1. لوحة Cloudflare → My Profile → API Tokens → **Create Token**
2. الصلاحية: **Account → Cloudflare Pages → Edit** (وإن أردت تنقية كاش النطاق:
   `Zone → Cache Purge`). **بلا IP allowlist** — رنّرات GitHub ليست في أي قائمة.
3. `gh secret set CLOUDFLARE_API_TOKEN` ثم `gh workflow run deploy-cloudflare.yml`.

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
   → node scripts/verify-live.mjs      تحقق حي: النطاق يقدّم إصدار هذا المستودع
```

**لماذا زيادة رقم الإصدار جزء من الإصدار لا زينة:** التحقق الحي يقارن
`/version.json` برقم `package.json` — فبلا زيادة يمرّ التحقق فوق نشر **فاشل**،
لأن النطاق يقدّم الرقم القديم سلفًا. لذلك كل إصدار يرفع الرقم في المصادر الأربعة
(`package.json` + `POS/package.json` + `server/package.json` + `server/lib/version.js`).

### مطلوب مرة واحدة
```bash
gh secret set CLOUDFLARE_API_TOKEN     # Account → Cloudflare Pages: Edit (بدون IP restriction)
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
- `/api/ping` → 200 (Worker الـAPI على نفس النطاق)

> **نبض الإنتاج**: `.github/workflows/uptime.yml` يشغّل نفس السكربت كل 15 دقيقة.
> الفحوص القديمة كانت تستطلع `/assets/DyPOS/pos/version.json` وتطلب حزمة `?v=` —
> مسارات تخطيط Worker المتقاعد، فكان النبض أحمر على موقع سليم.

## ملاحظات مسار IIS القديم (أرشيف — غير مستخدم في الإنتاج)
مسار النشر القديم (IIS + `deploy_dypos.bat` + `C:\inetpub\wwwroot`) متروك
للتوثيق التاريخي فقط. الإنتاج الحالي **Workers Static Assets** عبر CI
(`.github/workflows/deploy-cloudflare.yml`). لا يوجد IIS على خادم البناء.

## Royal production runbook (subscriber #1)
المشترك الأول: **رويال العالمية لتجارة أدوات التجميل والعطور** (`RGT`).
```powershell
cd server
node db/migrate.js      # schema v23
npm run seed:royal      # 64 SKUs + stock + users (atomic, idempotent)
npm run e2e:royal       # 14-check proof: login→shift→sale→pay→stock→void→close
```
- البذر ذري (`BEGIN/COMMIT`) وآمن للمفاتيح (`ON CONFLICT DO UPDATE` — لا حذف).
- كلمات المرور bcrypt حقيقية (تُطبع مرة واحدة)؛ حساب `admin` يُجبر على التغيير.
- سكربت E2E يلغّي فاتورته ويغلق ورديته — قاعدة الإنتاج تبقى نظيفة.

## Version Info (حالي)
- **Version:** `1.38.0` (single source: root `package.json`)
- **Date:** September 27, 2026
- **Framework:** Vue 3 + Chart.js + dypos-ui
- **PWA:** Yes (SW root scope، `build:pages` → `POS/dist/pos`)
- **Deploy:** push to `main` → GitHub Actions → `wrangler pages deploy` → `npm run verify:live`
- **Live:** `https://dypos.smartportssoft.com/` — يقدّم `1.37.0` حتى ينجح أول نشر
  بعد إصلاح صلاحية التوكن (`Cloudflare Pages:Edit`)
- **Tests:** server 446/446 (142 مجموعة) · POS 763/763 (59 ملفًا) · method contract 107/107 · biome 0 errors · pg parity OK · bundle 575KB ≤ 900KB

## Backend topology (why `/api` needs an origin)
- The Worker serves the frontend + proxies same-origin `/api/*` → `DYPOS_BACKEND_URL`
  (Worker secret, set from repo secret `DYPOS_BACKEND_URL` on every deploy; unset → clean Arabic 503).
- Run the API anywhere (VPS `docker compose up -d`), then expose it via Cloudflare Tunnel
  (`docker compose --profile tunnel up -d cloudflared` with `CLOUDFLARED_TOKEN`), e.g.
  `api.dypos.smartportssoft.com` → `http://dypos-server:3001`. Zero open ports, no CORS changes
  (`DYPOS_CORS_ORIGIN` already allows the frontend domain).
