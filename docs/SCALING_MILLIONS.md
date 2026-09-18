# DyPOS — مسار الملايين (Scaling to Millions)

**الإصدار:** server v1.11.0 — 2026-09-17
**الهدف:** دعم ملايين المشتركين والجلسات المتزامنة بتقنيات معيارية، مع الحفاظ على Tier-1 SQLite كخيار أحادي الكاتب.

---

## 1. المبدأ المعماري (Single-Writer + Read Acceleration)

```
                    ┌─ nginx / LB (TLS, gzip, sticky-IP optional)
                    │
        ┌───────────┼───────────────┐
        │           │               │
   worker:1 ... worker:N (DYPOS_CLUSTER=1)
        │           │               │
        └───────────┼───────────────┘
                    │  writes (SQLite WAL, busy_timeout 5s)
                    ▼
              ┌───────────┐      ┌──────────┐
              │ PRIMARY   │─────▶│ replicas │  (DYPOS_READ_ONLY=1, 409 retry@primary)
              │ dypos.db  │ VACUUM INTO
              └───────────┘      └──────────┘
                    │
        ┌───────────┼────────────────┐
        │           │                │
   LRU cache   Redis (opt)     Prometheus/Grafana
   (5s TTL)    (shared hits)   (alerts.yml)
```

- **SQLite يبقى الكاتب الوحيد** (Tier-1): كل `POST/PUT/PATCH/DELETE` يمر عبر `requirePrimary` — النسخ تقرأ فقط وترد `409 READ_ONLY_REPLICA`.
- **التوسع الأفقي للقراءة:** `GET /products`, `/stock`, `/invoices` مخزنة 3–5 ثوانٍ + `ETag/304` + `stale-while-revalidate` — عاصفة تصفح الكتالوج لا تلمس قاعدة البيانات.
- **Tier-2 Postgres:** المسار محفوظ (`DYPOS_DATABASE_URL=postgres://…` يرفض الإقلاع صراحة بدل الكتابة الصامتة في المكان الخطأ — `db/mode.js`). DDL جاهز في `db/schema-postgres.sql`.

## 2. ما أُضيف في v1.5.0 (تقنيات معيارية)

| التقنية | المعيار | الملف | الأثر المقاس |
|---|---|---|---|
| Read-through LRU + TTL + SWR | HTTP Caching (RFC 9111) | `lib/cache.js` | `X-Cache: HIT/MISS`, `hit` يُغني عن استعلامين (COUNT+LIST) |
| `ETag` ضعيف + `304` | Conditional Requests (RFC 9110) | `lib/cache.js:sendCached` | توفير DB + bandwidth لأطراف تعيد الطلب |
| `Cache-Control: private, max-age, swr` + `Vary: Authorization` | CDN/LB friendly | `routes/products.js`, `stock.js`, `invoices.js` | LB يفرّق بين المستخدمين بأمان |
| `X-Response-Time`, `X-Request-Id`, `X-QR-Kind` | Observability headers | `server.js`, `routes/print.js` | تتبع عبر LB/SIEM |
| OpenAPI 3.0 | API contract standard | `routes/openapi.js` → `/api/openapi.json` | توليد SDK لأي ERP |
| عدادات `authAttempts{ok,fail,locked}` + `cacheOps{hit,miss}` + `dbQueryDuration{operation}` | Prometheus RED/USE | `middleware/metrics.js` | تنبيه brute-force صار حيًا (كان ميتًا) |
| قفل حساب 8 فشل/15د → `429` | OWASP Brute-Force | `routes/auth.js` | يمنع credential stuffing أحادي العقدة |
| `revokeAllSessions` + `POST /logout-all` + إبطال الكل عدا الحالي عند تغيير كلمة المرور | Session hygiene (OWASP) | `middleware/auth.js`, `routes/auth.js` | الجلسات المسروقة تموت فورًا |
| مروحة Webhook متوازية (Promise.allSettled لكل مشترك، كتابات DB تسلسلية) | Outbox pattern | `lib/webhooks.js` | مشترك بطيء واحد لا يحجب الدفعة (500s ← ~8s) |
| `total/hasMore` في كل القوائم + `offset` للتصدير | Cursor/pagination contract | `invoices`, `products`, `stock`, `shifts`, `export`, `auth/users` | تفريغ جداول الملايين صفحة صفحة |
| `POST /invoices/:id/return` (يعكس مخزون/ولاء/ائتمان، `RETURNED`) | Functional completeness | `routes/invoices.js` | تقرير `daily refunds` صار حيًا (كان صفرًا دائمًا) |
| فرض `credit_limit` (402 عند التجاوز) | Financial guard | `routes/invoices.js` | منع ائتمان بلا سقف |
| RBAC على `stock/adjust` + `products DELETE` + `sync/push` | Least privilege | `routes/*` | الكاشير يبيع فقط؛ الكتالوج/المخزون للإدارة |
| `sync/push` fail-closed للأنواع المجهولة | No silent loss | `routes/sync.js` | بدل `SYNCED` كاذب → `FAILED` صريح |
| QR زاتكا TLV (Base64) عند ضبط `DYPOS_VAT_NUMBER` | ZATCA e-invoicing | `routes/print.js` | `X-QR-Kind: zatca-tlv` جاهز للامتثال |
| `GET /shifts` + تحقق `closingCash` + تحقق `customers PUT` | Validation parity | `routes/*` | تدقيق الورديات + بيانات نظيفة |
| تقسيم حِزم الواجهة (`vendor-frappe/charts/realtime/print`) + `target es2020` + `chunkLimit 500` + قاعدة `flagcdn` | Web performance budget | `POS/vite.config.js` | كاش طويل الأمد + PWA أخف |
| إصلاح `POSFooter` (كان يستورد `useI18n` غير الموجود → كسر البناء) | Build integrity | `POS/.../POSFooter.vue` | البناء لا ينكسر عند التوسع |

## 3. التشغيل (SRE)

- **الصحة الموسعة** `GET /api/health`: `database` + `cache{entries,hits,misses}` + `outbox{pending,dead}` + `memory{rss,heap}` + `uptime`.
- **الجاهزية** `GET /api/ready`: استعلام DB فعلي (يستخدمه Docker/K8s probe).
- **المقاييس** `GET /api/metrics`: `dypos_http_request_duration_seconds`, `dypos_db_query_duration_seconds{operation}`, `dypos_auth_attempts_total{outcome}`, `dypos_cache_operations_total{result}`, `dypos_invoices_created_total`, `dypos_sync_operations_total`.
- **النسخ:** `VACUUM INTO` + احتفاظ 7 + `backup:verify` في CI. الاستعادة تدريجية عبر `restore.pending` مع نسخة `pre-restore-*` للتراجع.
- **الأحمال المثبتة (in-memory):**
  - v1.11.0: `stress-campaign 8/8` (soak 5s، قاعدة نظيفة): burst 313rps p95 142ms + idempotency (1+29) + pay race (1 winner) + stock 800 + mixed 300 (0 errors) + security + replica 409 + soak 1820 فاتورة p95 38ms.
  - `npm test`: **server 111/111** + **frontend 348/348** + `npm audit` صفر + `npm run parity` أخضر (33 جدولًا SQLite بما فيها ظلال FTS، 28 Postgres).
  - ملاحظة منهجية: تشغيل `load` ثم `campaign` على نفس `‎:memory:` يُفشل bootstrap الـADMIN (صحيح أمنيًا) — الحملة تسقط إلى CASHIER وتفشل D برسالة صريحة؛ القياسات أعلاه على قاعدة نظيفة.

## 4. حدود معلنة + الخطوة التالية للملايين الحقيقية

1. **SQLite كاتب واحد:** السقف العملي ~مئات الكتابات/ثانية لكل عقدة. للملايين يوميًا: شغّل عقدة كاتبة واحدة + N قارئات، أو انتقل إلى Tier-2 Postgres (pool + `SELECT FOR UPDATE` بدل `UPSERT` الحالي).
2. **Rate-limit ذاكرة محلية:** الحد الفعلي = `limit × workers`. أمام LB متعدد العقد اضبط `DYPOS_REDIS_URL` + مخزن Redis مركزي (الكود جاهز للتبديل، `ioredis` اختياري).
3. **الجلسات في SQLite:** كل طلب = lookup إبطال مفهرس واحد. عند >10k rps انقل الجلسات إلى Redis مع TTL = `JWT_EXPIRES`.
4. **التقارير الثقيلة:** `daily` و`export` بلا مهام خلفية بعد — للملايين أضف طابور مهام (BullMQ) + تخزين S3 للملفات.
5. **ZATCA الكاملة:** QR/TLV جاهز؛ المتبقي: onboarding (CSR/CSID)، SDF/XML + OFS/PDF، مزامنة async + hash-chain على `zatca_audit_trail` (انظر `docs/V2_PLAN.md` المحور 1).

## 5. التشغيل السريع

```bash
# كاتب واحد + 4 عمال + كاش 5s
DYPOS_CLUSTER=1 DYPOS_WORKERS=4 DYPOS_CACHE_TTL=5 node entrypoint.js

# مراقبة
curl localhost:3001/api/health | jq .cache,.outbox
curl localhost:3001/api/openapi.json | jq .info.version

# حملة الضغط (تتطلب ADMIN bootstrap على DB نظيفة)
npm run campaign -- --base http://127.0.0.1:3001 --soak 5
```
