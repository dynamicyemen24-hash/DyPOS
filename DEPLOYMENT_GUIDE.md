# DyPOS Deployment Guide — dypos.smartportssoft.com

## حالة النشر الآن (2026-09-30)
- **الإصدار المستهدف:** `1.42.0`. إذا كان النطاق الحي يعرض إصدارًا أقدم، يعتبر النشر **فاشلًا** ولا يجوز اعتباره مكتملًا حتى تتطابق الواجهة والـAPI مع `main`.
- **رمز Cloudflare سليم الآن — مُثبت بالقياس لا بالافتراض**: التشغيل `36703778984` (2026-09-30 10:39Z) اجتاز `pages-preflight`، ونشر Pages، ونشر `dypos-api`؛ سقطت خطوة واحدة فقط: `Live verify`. خلل `403 + code 10000` (غياب `Cloudflare Pages:Edit`) انتهى بعد تجديد الرمز في 2026-09-29 21:28Z.
- **⚠️ العطل الوحيد المتبقي: `/api/health` → `503 UPSTREAM_MISCONFIGURED`** — بسببه يبقى `Live verify` و`Uptime Monitor` أحمرَّين. التفصيل والمعالجة في القسم «إحياء الـAPI الحيّ» أدناه. البوابة الآن تطبع اسم العطل لا رقمًا مجرّدًا.
- كل بوابات ما قبل النشر خضراء (اختبارات + lint + parity + عقد + ميزانية البناء + `vue-tsc`).

### 🔴 إحياء الـAPI الحيّ — سبب احمرار `Live verify` و`Uptime Monitor`

**القياس (2026-09-30):**

| المسار | الرد |
|--------|------|
| `/api/ready` | `200 {"status":"ready","database_bound":true}` — الحافة نفسها سليمة |
| `/api/health` · `/api/ping` · `/api/version` | `503 {"code":"UPSTREAM_MISCONFIGURED","detail":"BACKEND_URL (https://dypos-api.smartportssoft.com) resolves to this worker (dypos.smartportssoft.com)…"}` |

**جذر السبب (ثلاث حقائق متسلسلة، لا استنتاج):**

1. `wrangler.api.toml` يضبط `[vars] BACKEND_URL = "https://dypos-api.smartportssoft.com"`.
2. ذلك المضيف مُدرج في `worker-edge-hosts.mjs#DYPOS_EDGE_HOSTS`، أي أنه **الـWorker نفسه** — فحارس `isSelfProxy` يرفض التوجيه (سلوك مقصود، مغطّى بـ`server/tests/worker-edge-hosts.test.js`)؛ ولو فتح الحارس لكان المرور إلى مضيف بلا سجل DNS ⇒ نفس النتيجة.
3. **لا يوجد أصل خلفي أصلًا**: لا سجل DNS لـ`dypos-api.smartportssoft.com` (NXDOMAIN)، ولا خادم Express ولا نفق `cloudflared` مُشغَّلان على هذا النطاق. التطبيق يعمل اليوم بوضع Offline-First فقط (المبيعات محلية في IndexedDB، والمزامنة معلّقة).

**المعالجة — بالترتيب، وكل خطوة تُقاس:**

```bash
# 1) أصل مفوّض دائم (VPS أو حاوية) يشغّل الخادم
cd server && npm ci && npm run migrate && node entrypoint.js
#    أو من جذر المستودع: docker compose up -d

# 2) كشفه خلف نفق Cloudflare بلا منافذ مفتوحة
CLOUDFLARED_TOKEN=<token> docker compose --profile tunnel up -d cloudflared
#    Zero Trust → Networks → Tunnels → Create → Public hostname
#    (مثال) api.dypos.smartportssoft.com → Service: http://dypos-server:3001

# 3) توجيه الحافة إليه — ولا يجوز أبدًا أن يكون المضيف ذاته
npx wrangler secret put BACKEND_URL --config wrangler.api.toml
#    ثم احذف BACKEND_URL من [vars] في wrangler.api.toml حتى لا يعيد أي نشر كتابة القيمة الخاطئة

# 4) البوابة الوحيدة التي تُقر
npm run verify:live        # يجب أن تعطي 6/6
```

> **قاعدة دائمة:** أي `BACKEND_URL` إمّا مُدرج في `DYPOS_EDGE_HOSTS` أو لا يحلّ في DNS = إنتاج بلا API. الحافة لا تنتحل الصحة أبدًا؛ تردّ `503` باسم العطل، والنبض كل 15 دقيقة يعيد تكراره بدقّة.
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
npm run e2e:yaqoub      # 17-check run as subscriber #1's own manager account
```

- البذر ذري (`BEGIN/COMMIT`) وآمن للمفاتيح (`ON CONFLICT DO UPDATE` — لا حذف).
- كلمات المرور bcrypt حقيقية (تُطبع مرة واحدة)؛ حساب `admin` يُجبر على التغيير.
- سكربت E2E يلغّي فاتورته ويغلق ورديته — قاعدة الإنتاج تبقى نظيفة.

### The final operational run as subscriber #1

`npm run e2e:yaqoub` boots a real Express server against the production database
and authenticates as the human manager account itself (`yaqoub.sahel`), not a
synthetic one: login, session identity, wrong-password rejection, unauthenticated
read rejection, catalog, opening stock, shift open, paid invoice, stock
decrement, daily report, customers, settings, shift settlement at variance 0 --
then voids the invoice and restores stock. The last two checks are cleanup, not
nails: the void keeps the audit row and the books stay clean.

> The run re-provisions the `yaqoub.sahel` password (bcrypt cost 12) and sets
> `must_change_password=0` so the run is repeatable. For the credential you
> actually hand the subscriber: set `DYPOS_OP_PASSWORD=<their-code>` before the
> run so that exact code is stored. **Rotate it on first login**
> (`/api/auth/change-password`).

## Version Info (حالي)
- **Version:** `1.42.0` (single source: root `package.json`)
- **Date:** September 30, 2026
- **Framework:** Vue 3 + Chart.js + dypos-ui
- **PWA:** Yes (SW root scope، `build:pages` → `POS/dist/pos`)
- **Deploy:** push to `main` → GitHub Actions → Cloudflare Pages + `dypos-api` Worker → `npm run verify:live`
- **Live قبل هذه الدفعة:** `https://dypos.smartportssoft.com/` يقدّم `1.40.0` (Pages منشورة بنجاح في 2026-09-30)؛ تُحدَّث إلى `1.41.1` بعد نجاح `Live verify` — والمعوّق حاليًا هو `/api/health` (أصل خلفي مفقود) لا الواجهة.
- **Tests:** server 569/569 (173 مجموعة) · POS 1136/1136 (83 ملفًا) · method contract 75 فعلًا / 104 موقع استدعاء مغطّاة / 249 معالجًا · biome 0 errors · pg parity OK · بوابة وصولية بلا كود ميت (`POS/tests/deadCode.test.js` + `server/tests/deadCode.test.js`)

## Backend topology (why `/api` needs an origin)
- Cloudflare Pages serves the frontend from `dypos-pos`; a separate `dypos-api` Worker owns
  same-origin `/api/*`. The edge answers `/api/edge-health` and `/api/ready` itself and proxies every other path — `/api/ping` included — so a missing authoritative backend reads as 503 on all of them.
- The Express API can run on a VPS (`docker compose up -d`) and be exposed through a
  Cloudflare Tunnel (`docker compose --profile tunnel up -d cloudflared` with
  `CLOUDFLARED_TOKEN`). Keep the API origin and credentials in deployment secrets; never
  commit them to the repository.
