# DyPOS Deployment Guide — dypos.smartportssoft.com

## حالة النشر الآن (2026-10-03)
- **الإصدار الحي:** `1.44.6` على `https://dypos.smartportssoft.com/`؛ تحقق النطاق 6/6، وWorker مربوط بـD1.
- **المزامنة الخلفية متوقفة:** `/api/health` يعيد `503 UPSTREAM_MISCONFIGURED` لأن أصل Express لم يُجهز أو يُربط. هذا لا يمنع البيع المحلي دون اتصال، لكنه يمنع المزامنة السحابية.
- **بيانات المشترك:** لم تُزرع بيانات؛ قواعد المستودع لا تثبت أنها المصدر المعتمد لبيانات المشترك الأول.
- اجتازت بوابات هذا الإصدار اختبارات POS والخادم، Biome، schema parity، method contract، وميزانية الحزمة.

### 🔴 إحياء الـAPI الحيّ — سبب احمرار `Live verify` و`Uptime Monitor`

**القياس (2026-10-03):**

| المسار | الرد |
|--------|------|
| `/api/ready` | `200 {"status":"ready","database_bound":true}` — الحافة وD1 سليمان |
| `/api/health` | `503 UPSTREAM_MISCONFIGURED` — `BACKEND_URL` غير مضبوط إلى أصل خلفي صالح |

**جذر السبب (ثلاث حقائق متسلسلة، لا استنتاج):**

1. `wrangler.api.toml` لا يحتوي `BACKEND_URL` في `[vars]`، وهذا مقصود لتفادي self-proxy.
2. النطاق السابق `dypos-api.smartportssoft.com` ليس أصلًا صالحًا للـWorker؛ الحارس يرفض توجيهه إلى نفسه.
3. لم يُعثر على خدمة Express أو Docker daemon أو مشروع Railway مرتبط أو اعتماد Cloudflare Tunnel في بيئة الإصدار. لذلك يبقى التطبيق Offline-First والمزامنة معلّقة حتى توفير أصل Node.js موثوق.

**المعالجة — بالترتيب، وكل خطوة تُقاس:**

```bash
# 1) وفّر مضيف Node.js دائمًا أو VPS، وانشر server/ مع تخزين دائم ونسخ احتياطي.
#    لا تستخدم قاعدة التطوير أو البيانات التجريبية للمشترك.

# 2) اختياري: اكشف الخادم عبر Cloudflare Tunnel من المضيف نفسه
CLOUDFLARED_TOKEN=<token> docker compose --profile tunnel up -d cloudflared
#    Zero Trust → Networks → Tunnels → Create → Public hostname
#    (مثال) api.dypos.smartportssoft.com → Service: http://dypos-server:3001

# 3) بعد التحقق من أصل API مستقل وصحي، وجّه الحافة إليه — لا إلى نطاق الحافة
npx wrangler secret put BACKEND_URL --config wrangler.api.toml

# 4) البوابة الوحيدة التي تُقر
npm run verify:live        # يجب أن تعطي 6/6
```

> **قاعدة دائمة:** أي `BACKEND_URL` إمّا مُدرج في `DYPOS_EDGE_HOSTS` أو لا يحلّ في DNS = إنتاج بلا API. الحافة لا تنتحل الصحة أبدًا؛ تردّ `503` باسم العطل، والنبض كل 15 دقيقة يعيد تكراره بدقّة.

تتحقق البوابة من إصدار الواجهة وWorker وجاهزيته وربط D1 ضمن الفحوص الستة
الإلزامية. حالة `/api/health` تُعرض كتنبيه مستقل لأنها تمثل خادم المزامنة
الاختياري؛ لا يُعدّ التنبيه نجاحًا للمزامنة، ولا يمنع نشر PWA القابل للعمل دون
اتصال.

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
   → npm run upstream                  بوابة الأصل الخلفي: لا BACKEND_URL مدقق يحلّ للحافة نفسها (تمنع عودة 503)
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
- `/api/edge-health` + `/api/ready` → الإصدار المتوقع وD1 مربوطان؛ `/api/health` فحص اختياري لأصل Express ويظهر تحذيرًا عند غيابه

> **نبض الإنتاج**: `.github/workflows/uptime.yml` يشغّل نفس السكربت كل 15 دقيقة.
> الفحوص القديمة كانت تستطلع `/assets/DyPOS/pos/version.json` وتطلب حزمة `?v=` —
> مسارات تخطيط Worker المتقاعد، فكان النبض أحمر على موقع سليم.

## ملاحظات مسار IIS القديم (أرشيف — غير مستخدم في الإنتاج)
مسار النشر القديم (IIS + `deploy_dypos.bat` + `C:\inetpub\wwwroot`) متروك
للتوثيق التاريخي فقط. الإنتاج الحالي **Cloudflare Pages** عبر CI
(`.github/workflows/deploy-cloudflare.yml`). لا يوجد IIS على خادم البناء.

## Subscriber #1 data safety
الاسم المسجل للمشترك الأول (`RGT`) ليس إثباتًا أن قاعدة محلية أو ملف seed هو
مصدر بياناته الحقيقي. `npm run seed:royal` ينشئ بيانات عينة ثابتة، ولذلك أصبح
ممنوعًا في `NODE_ENV=production` ويرفض قواعد البيانات التي تحتوي مستأجرين أو
منتجات أو فواتير. لا تشغّل `e2e:yaqoub` أو أي اختبار يكتب فواتير على قاعدة
الإنتاج. استيراد بيانات العميل يتطلب ملفًا موثقًا منه، مراجعة مطابقة، نسخة
احتياطية، ثم استيرادًا تجريبيًا على قاعدة منفصلة قبل cutover.

## Version Info (حالي)
- **Version:** `1.44.6` (single source: root `package.json`)
- **Date:** October 3, 2026
- **Framework:** Vue 3 + Chart.js + dypos-ui
- **PWA:** Yes (SW root scope، `build:pages` → `POS/dist/pos`)
- **Deploy:** push to `main` → GitHub Actions → Cloudflare Pages + `dypos-api` Worker → `npm run verify:live`
- **Live:** النطاق وWorker على `1.44.6`، والتحقق الحي 6/6؛ API sync backend غير متاح حتى توفير أصل Express.
- **Tests:** POS 2094 اختبارًا / 114 ملفًا · server 627 اختبارًا / 187 مجموعة · method contract 75 فعلًا / 104 موقع استدعاء / 249 معالجًا · Biome وPG parity ناجحان.

## Backend topology (why `/api` needs an origin)
- Cloudflare Pages serves the frontend from `dypos-pos`; a separate `dypos-api` Worker owns
  same-origin `/api/*`. The edge answers `/api/edge-health` and `/api/ready` itself and proxies every other path — `/api/ping` included — so a missing authoritative backend reads as 503 on all of them.
- The Express API can run on a VPS (`docker compose up -d`) and be exposed through a
  Cloudflare Tunnel (`docker compose --profile tunnel up -d cloudflared` with
  `CLOUDFLARED_TOKEN`). Keep the API origin and credentials in deployment secrets; never
  commit them to the repository.
