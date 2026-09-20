# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.27.0] - 2026-09-20 — محرّك الاشتراكات + سلامة فوترة لا تتكرر (Recurring Commerce)

### Added — Subscription engine (schema v18 → v19)
- `server/routes/subscriptions.js` + `POST/GET /api/subscriptions/*`: باقات
  (ADMIN/MANAGER)، اشتراك العملاء، pause/resume/cancel بحالات مُقيَّدة،
  تشغيل فوترة، تقرير (byStatus/MRR/المستحقات)، وكشف فواتير لكل عميل.
- الفوترة الحقيقية بلا استثناءات: كل تحصيل يكتب صفًا في
  `subscription_billings` وقيدًا في دفتر المحفظة (`wallet_transactions`)
  + `loyalty_transactions` داخل معاملة واحدة؛ الرصيد غير الكافي → `due`
  للمتابعة اليدوية (لا تخطٍ صامت ولا تجديد وهمي).
- `POS/src/adapters/rest/api.js` + `POS/src/adapters/index.js`: 11 دالة
  اشتراكات في طبقة الـ Adapter (لا وصول شبكي مباشر من المكوّنات).

### Added — Replay-safe billing (schema v19)
- `subscription_billings.period_start` + `periods_consolidated` و
  فهرس فريد جزئي `idx_sbill_period(subscription_id, period_start)`:
  **يستحيل** تحصيل الفترة نفسها مرتين حتى مع إعادة الإرسال أو تزامن تشغيلين.
- الجدولة تُدوَّر دائمًا إلى ما بعد تاريخ التشغيل، وتُدمج الفترات الفائتة في
  تحصيل واحد (`amount = price × periods`, بحد أقصى 1200 فترة) — بلا انفجار
  مبالغ ولا حذف صامت لاستحقاق. الاستجابة تعرض `periods` و`periodStart`
  و`skipped` للتدقيق.
- ترحيل v19 محصّن: يفشل الفهرس الفريد فقط (تحذير) ولا يمنع إقلاع الخادم أبدًا.

### Fixed — Input validation & tenant isolation
- `intervalDays: 0` كان يُستبدل صامتًا بـ 30 → الآن 400 صريح؛ القيم الفارغة
  فقط ترجع للافتراضي.
- عزل المستأجرين في مسارات الاشتراكات: كل قراءة (قائمة/تقرير/كشف/باقات)
  مُفلترة بالمستأجر، وكل كتابة عبر الحدود → **404** لا تسريب وجود؛ وتشغيل
  فوترة مُقيَّد بمستأجر لا يلمس عملاء مستأجر آخر (مُثبت باختبارات).

### Fixed — سلامة طبقة المحوّلات (Adapter integrity)
- `POS/src/adapters/rest/api.js`: صنف `ApiClient` كان بلا فعل `patch()` بينما
  `updateSubscriptionPlan` ينادي `api.patch(...)` → انهيار `TypeError` عند أول
  تعديل باقة (تعارض مع مسار الخادم `PATCH /plans/:id`). أُضيف الفعل ليكتمل العقد.
- `POS/src/adapters/frappe/api.js`: كان يُصدِّر 9 أسماء فقط من 39 تُصدِّرها
  الواجهة الموحّدة `adapters/index.js` → 30 اسمًا تصبح `undefined` **بصمت**
  عند `VITE_DYPOS_BACKEND=frappe` (انهيار وسط البيع). الآن كل اسم إما منفَّذ
  فعليًا أو **يفشل بصوت عالٍ** برسالة عربية صريحة — لا سلوك وهمي ولا
  `undefined is not a function`.

### Added — بوابات عقد تحرس الفجوات من الارتداد
- `POS/tests/adapterContract.test.js` (8 اختبارات): تكافؤ الواجهة الموحّدة مع
  المحوّلين، سلامة كل `api.<verb>()` مقابل أفعال `ApiClient`، وعقد مسارات
  الاشتراكات (adapter ↔ `server/routes/subscriptions.js`) طريقةً ومسارًا.
- `POS/tests/versionDrift.test.js` (4 اختبارات): مصدر الإصدار الواحد
  (root ≡ server/package ≡ server/lib/version ≡ POS/package) + طابع البناء عند
  وجوده؛ كان موثّقًا في `server/lib/version.js` بلا أي حارس ينفّذه.

### Fixed — بوابة lint للخادم (كانت معطّلة تمامًا)
- `server/package.json`: أُضيف `@biomejs/biome@1.9.4` كـ devDependency —
  `npm run lint` كان يفشل بـ `'biome' is not recognized` فلم تُنفَّذ البوابة قط.
- `server/biome.json`: كان **مخالفًا لمخطط Biome 1.9.4** (`useIgnoreFile` ككائن،
  `includes`، `javascript.quoteStyle`) → أُعيد كتابته صحيحًا، مع **تعطيل
  التنسيق صراحةً**: الأسلوب المضغوط في الخادم مقصود، وإعادة تنسيق 95 ملفًا دين
  مؤجَّل موثّق في `docs/TECH_DEBT_PAYDOWN.md` (وكذلك تعطيل قواعد شكلية بحتة
  مع بيان السبب، وحفظ `noDelete` في الاختبارات لأن `delete process.env.X`
  تختلف دلاليًا عن الإسناد).
- إصلاحات حقيقية كشفتها البوابة فور تفعيلها: `lib/device.js` (سلسلة اختيارية)،
  `middleware/auth.js`، `middleware/metrics.js` (`const`)،
  `scripts/check-pg-parity.mjs` (ثلاث حلقات `exec` → `matchAll` + إزالة فرع ميت
  `&& false`)، `scripts/stress-campaign.mjs`، و`scripts/drill-ops.mjs`
  (متغيران ميتان).

### Removed — سكربتات تشخيص مكسورة + فوضى الجذر
- 6 سكربتات `server/scripts/_*` من جلسة حفر سابقة، **اثنان منها لا يُحلَّلان
  نحويًا** (`acabou` و`ой` داخل المصدر) + `drill-err.txt`.
- 24 ملف تشخيص/لقطة في جذر المستودع (`_tmp_*.mjs`، `_live-*.html`،
  `_test-*.txt`، `_probe*.bat`، `server-test-*.txt`…) — مُنعت بأنماط في
  `.gitignore` فلا تعود.

### CI — تحصين البوابة
- `.github/workflows/ci.yml`: الفرع `main` صار مُبوَّبًا (كان `develop` فقط ⇒
  إصدارات `main` بلا أي CI)، وأُضيفت خطوتا **lint** و**parity** لوظيفة الخادم.
- وظيفة Frappe القديمة (`tests`) كانت مستحيلة النجاح (تثبيت من
  `frappe/DyPOS@version-15` غير موجود + تثبيت مزدوج + وحدة تقع في
  `legacy/pos_next`) → `if: false` بتوثيق السبب (سابقة موجودة في `linter.yml`).

### Verified — Quality gates (إصدار إنتاجي)
- Server node:test: **191/191** ✅ — Frontend vitest: **366/366** ✅ —
  Biome: POS **334 ملفًا** نظيفًا ✅ + Server **89 ملفًا** نظيفًا ✅ —
  parity SQLite↔Postgres: **ok:true (v19 — 43/38 جدولًا، صفر نواقص)** ✅.
- بناء الإنتاج مثبّت على `DyPOS_BUILD_VERSION=1.27.0` (لا طوابع زمنية):
  `dist-deploy/pos-package-1.27.0/` + zip (76 ملفًا، 3.2MB) — Jinja = 0،
  كسر كاش `?v=1.27.0` على كل الأصول، SW بنطاق الجذر، `version.json` = 1.27.0.
- الحزمة الرئيسية `assets/index-B45Lrdhs.js` (168 KB / gzip 53.75 KB) —
  PWA precache: **73 مدخلًا (4295.90 KiB)**.

### Fixed — Production delivery (dypos.smartportssoft.com)
- النطاق الحيّ كان يخدم `pos.html` يشير إلى حزمة أصول **مفقودة** (`/assets/DyPOS/pos/**`
  → 404 = شاشة بيضاء للعملاء). أُعيد نشر الحزمة الكاملة على مشروع Cloudflare Pages
  `dypos-pos` (نفس مشروع النطاق) مع الحفاظ على صفحة الجذر التعريفية القائمة.

## [1.26.0] - 2026-09-19 — الإصدار الاحترافي (Performance & UX release)

### Added — Unified cached resource (SWR reads)
- `POS/src/composables/useCachedResource.js`: façade تفاعلية واحدة فوق
  `memoizeAsync` لكل قراءات الـ POS (مجموعات الأصناف، الماركات، الإعدادات،
  لوحات القياسات…) — الاستدعاءات المتزامنة تتشارك وعدًا واحدًا قيد التنفيذ،
  والقيم القديمة تُبقي الواجهة فورية بينما يجري إعادة التحقق في الخلفية.
- `POS/tests/useCachedResource.test.js`: 5 اختبارات (تجميع الوعود، SWR،
  الإبطال، منع تلبس البيانات عند تعاقب المفاتيح).

### Added — Device adaptation (performance budget)
- `POS/src/composables/useDevice.js`: استكشاف الجهاز (هاتف/تابلت/سطح مكتب)
  من أرخص إشارة موثوقة (viewport + touch points ← صنف الخادم ← ميزانية
  العتاد: الأنوية/الذاكرة/Save-Data/نوع الشبكة)، مع فئات على `body`
  ووضع خفيف تلقائي للأجهزة الضعيفة وتحذير عربي فشل-طري لا يمنع البيع أبدًا.
- `POS/tests/useDevice.test.js`: 6 اختبارات (تصنيف، isLowSpec، idempotent init).

### Enhanced — Client update delivery
- `main.js` watchdog: الاستطلاع كل 15 دقيقة + **فحص عند العودة للاتصال**
  (حدث online → فحص `version.json` خلال 5 ثوانٍ) فتتعلم الأجهزة المقطوعة
  عن النشر الجديد خلال ثوانٍ من عودة الشبكة.

### Fixed — Postgres parity v17
- `schema-postgres.sql` يضم جدول `alert_notifications` + فهارسه
  (v17) — `npm run parity`: **ok:true**.

### Verified — Quality gates (release)
- Frontend vitest: **354/354** ✅ — Server node:test: **171/171** ✅ —
  Biome lint: **332 ملفًا نظيفًا** ✅ — Parity: **ok:true** ✅.
- إصدار بناء الواجهة مثبّت عبر `DyPOS_BUILD_VERSION=1.26.0`
  (لا طوابع زمنية في الحزم الاحترافية).

### Deploy
- حزمة إنتاج نظيفة: `dist-deploy/pos-package-1.26.0/` (+zip) — Jinja 0،
  كسر كاش `?v=1.26.0`، تسجيل SW بنطاق الجذر. النشر على خادم الأصل عبر
  `ORIGIN-DEPLOY.bat` كمسؤول ثم تنقية كاش Cloudflare
  (pos.html + assets/DyPOS/pos/* + sw.js).


## [1.25.2] - 2026-09-18 — Self-healing + alerting backbone

### Added — Self-healing watchdog
- `scripts/watchdog.mjs` (zero-dep): owns ONE backend child, probes
  `/api/ready` every 10s, restarts after 3 failures with exp backoff
  (1s → 60s cap), attaches safely if port already owned, recovers from
  silent OOM/kill without human intervention. Exposed as `npm run
  supervise`; run via Task Scheduler / NSSM / pm2 / docker --restart.

### Added — Alerting delivery (Alertmanager → backend inbox)
- Migration v17: `alert_notifications` table + indexes.
- `POST /api/admin/alerts/hook` (shared-secret, constant-time verify):
  Alertmanager delivers here; deduplicates by fingerprint; firing→resolved
  lifecycle tracked; resolved rows preserved for forensics.
- `GET /api/admin/alerts` (ADMIN): filtered inbox with status/severity.
- `docker-compose.yml` + `monitoring/alertmanager.yml`: production-ready
  routing (critical → paging, warning → team), delivered to the same
  backend via `X-Alert-Token` (no sidecar to operate).
- `DYPOS_ALERT_TOKEN` env required on both sides — fail-closed 503 if unset.

### Enhanced — Client update delivery
- `main.js` watchdog: existing 15-min poll + **reconnect check** (online
  event → check `version.json` within 5s) guarantees stale terminals
  learn about new deployments within seconds of reconnect.

### Verified
- DB: integrity ok, schema v17, indexes reviewed (no change needed).
- Tests: **171/171** (8 new heartbeat + alert tests).

## [1.25.1] - 2026-09-18 — Device heartbeat + DB audit

### Added
- `POST /api/devices/:id/heartbeat` (any role): refreshes `last_sync`,
  optionally reports `appVersion`; revoked devices get 423 with the
  record so a cut-off terminal shows why sync stopped. Unknown id → 404.

### Verified — Database level
- Live DB `integrity_check=ok`, schema v16, index inventory reviewed:
  invoices/products/payments/customers/shifts/stock fully covered
  (tenant/status/idempotency/chain) — no new index justified (writes
  pay per index).

### Tests
- `npm test`: **171/171** (1 new heartbeat test). One full run showed
  a single flaky failure in scale9 (timing-sensitive lockout test);
  scale9 alone 5/5 and full rerun 171/171 green — recorded, not code.

## [1.25.0] - 2026-09-18 — Gap closure (sync isolation + devices + parity green)

### Added — Device registry (schema v16)
- `devices` table + `POST /api/devices/register` (any role — terminal
  self-enrollment on first boot), `GET /api/devices` (tenant-filtered),
  `POST /:id/revoke` + `/:id/revive` (ADMIN/MANAGER).
- Re-registration never clears REVOKED (423) — a lost device stays cut
  off until a manager revives it.

### Added — Sync tenant isolation (schema v16)
- `sync_log.tenant_id`: pull filters `(tenant_id=? OR tenant_id IS
  NULL)` for scoped callers — cross-tenant rows never returned.
- Push stamps `tenant_id` (COALESCE — legacy rows untouched).

### Added — Sync push idempotency (schema v16)
- `sync_log.idempotency_key` (partial UNIQUE): replayed batches return
  `{deduped:true}`; UNIQUE-race on concurrent retries is treated as
  dedupe, never FAILED.

### Fixed — Postgres parity RED → GREEN
- `schema-postgres.sql` was missing 5 tables (v12–v14) + 4 columns
  (v15): `dispatcher_lock`, `payment_methods`, `business_settings`,
  `fiscal_years`, `invoice_sequences`, `invoice_items.name_ar/
  free_qty/is_free_item`, `invoices.version`. `npm run parity`: **ok:true**.

### Evaluated — Dependencies
- `npm audit`: **0 vulnerabilities**. `npm outdated`: only major bumps
  available (express 4→5, zod 3→4, …) — deliberately NOT upgraded in a
  production release; tracked for a dedicated major-upgrade window.

### Fixed — Stale IIS root file
- `C:\inetpub\wwwroot\pos.html` was from the previous build while
  assets were current — deploy step now syncs root entry + assets
  together.

### Changed
- Version bumps: server `1.25.0`, root `1.25.0`, Docker `1.25.0`.
  Frontend unchanged (`2.4.0`).

### Verified
- `npm test`: **170/170** (7 new gap tests) — `npm run parity`:
  **ok:true** — production health: `env=production`.

## [1.24.1] - 2026-09-18 — Production env fix (third-party audit patch)

### Fixed — Critical boot debt (found by external audit)
- **`server/.env` was silently ignored**: static `import` hoisting runs
  before `dotenv.config()` in `server.js`, so top-level reads
  (`NODE_ENV`, `DYPOS_JWT_SECRET`, `DYPOS_DB_PATH`) never saw the env
  file. `entrypoint.js` now calls `process.loadEnvFile()` before every
  `process.env` read and before the dynamic `server.js` import.
- **Backend now runs `NODE_ENV=production`**: masked error responses
  (no stack leaks), localhost CORS origins removed, production rate
  limits + startup guards active. Strong 96-char JWT secret generated
  into gitignored `server/.env` (existing tokens invalidated once —
  users re-login).
- **Fresh backup + restore drill**: `dypos-2026-09-18T18-32-33.db`
  (512KB, integrity ok, schema v15).

### Verified
- `npm test`: **163/163** — frontend vitest: **354/354** —
  `doctor.mjs`: all ok — CORS whitelist enforced (evil origin blocked,
  prod origin allowed) — `/api/health` reports `env=production`.

## [1.24.0] - 2026-09-18 — UX polish + resilience + interaction speed (final operational release)

### Fixed — Resilience
- **`LoadingSpinner` hardening** (`POS/src/components/common/LoadingSpinner.vue`):
  explicit `__` import (was window-global dependent), `role="status"` +
  polite live region, static ring under `prefers-reduced-motion`.
- Verified shell safety net covers sale → pay → close without cart loss
  (dismiss clears banner, transaction state preserved).

### Verified — End-User Journey (login → last screen)
- Login: autofocus (email or password when remembered), Enter/Escape
  handling, show/hide password, `autocomplete` + `inputmode`, disabled
  states while submitting, CSRF + offline-runtime readiness gates.
- POS → checkout → reports: lazy routes, toast queue (4s, FIFO, no
  stacking), global error banner, PWA update banner, screen-reader
  announcements, SPA focus reset, skip link.

### Verified — Interaction Speed (measured 2026-09-18, warm)
- `GET /api/ready`: ~18ms | `GET /api/health`: ~18ms |
  `GET /api/openapi.json`: ~37ms.
- Frontend bundle: JS 35 files / 1451KB, CSS 9 files / 352KB, precache
  73 entries; heaviest chunks route-split (frappe 281KB, charts 191KB
  dashboard-only, print 118KB on demand).
- Note: `localhost` hostname resolution on this host adds seconds vs
  `127.0.0.1` (OS-level IPv6 fallback) — production uses relative URLs
  + domain, unaffected.

### Design System Quality
- RTL-first (logical properties, `border-s-4`, start/end), Arabic
  default, theme tokens, density modes, reduced-motion respected across
  shell/toast/spinner/gradients, content-visibility virtualized rows.

### Docs — Encryption deferred (advanced, next release, per customer)
- New `docs/ENCRYPTION_ADVANCED.md`: AES-GCM opt-in plan with
  performance acceptance gate (invoice p95 +50ms, search +1 frame,
  boot +300ms). v1.24.0 ships unencrypted for maximum speed on
  low-end POS hardware.

### Changed
- Version bumps: server `1.24.0`, frontend `2.4.0`, root `1.24.0`,
  Docker `1.24.0`.

## [1.23.0] - 2026-09-18 — Enterprise hardening (multi-tenant + brute-force guard + a11y + new routes)

### Added — Multi-Tenant Scoping
- All read/write routes (customers, products, shifts, stock, invoices) now respect `X-Tenant-Id` / `X-Org-Id` headers via `lib/tenant.js`.
- New routes: `tenants`, `masters`, `offers`, `fiscal`, `reports`, `settings`, `device`, `openapi`.
- `POST /api/admin/trail` — audit trail with before/after snapshots + IP + user.

### Added — Security Hardening
- **Brute-force lockout**: 8 failed logins in 15min → 429 for 15min. Cache-backed (Redis when available, local Map fallback). (`routes/auth.js`)
- `POST /auth/logout-all` + `revokeAllSessions` on password change.
- Auth attempt metrics: `dypos_auth_attempts_total{ok,fail,locked}`.
- Admin dashboard endpoint (`GET /admin` — `server/public/admin.html`).

### Added — Product Catalog
- FTS5 search with sanitization (`toFtsQuery` — prefix-match, quote-neutral).
- Read-through cache (5s) absorbs catalog browse storms.
- Sort (`name`/`price`/`created`) + `?count=false` + `total`/`hasMore` in all list responses.
- `?includeInactive` for ADMIN/MANAGER.

### Added — Frontend Accessibility (a11y)
- Skip link for keyboard users (bypass header/nav to `#dypos-main`).
- SPA focus reset on route change (screen-reader users land on new page).
- Global shell error boundary (`onErrorCaptured`) with dismiss/retry.

### Added — Device Adaptation
- `initDeviceAdaptation()` in `main.js` — classifies phone/tablet/desktop, warns on low-spec/save-data.

### Added — Webhook Hardening
- Async retry with payload signing + dedup.
- `lib/jobs.js` — background export jobs up to 100k rows.

### Added — Backend Libraries
- `lib/async.js` (`ah()`) — wraps all 23 handlers (Express 4 swallows promise rejections).
- `lib/cache.js` — LRU + TTL + SWR + optional Redis.
- `lib/loyalty.js` — earn/redeem/tier with tier auto-upgrade.
- `lib/money.js` — halala-precise rounding (half-up).
- `lib/dates.js` — indexable date helpers.
- `lib/trail.js` — audit trail records.
- `lib/fx.js` — currency conversion + UOM assertions.
- `lib/settings.js` — business settings resolver.
- `lib/chain.js` — invoice hash chain (ZATCA-ready).
- `lib/device.js` — UA classification + perf hints.
- `lib/rate-store.js` — shared rate limiter.

### Added — Postgres Parity
- `server/db/schema-postgres.sql` — full schema with tsvector + FTS indexes.

### Added — Tests (17 new files)
- `device`, `dispatcher-lease`, `finance-core`, `ops`, `stock-guard-strict`, `version`, `scale1`–`scale9`.

### Added — Infrastructure
- `scripts/doctor.mjs` — preflight checks (Node, migrations, disk, cluster).
- `scripts/check-pg-parity.mjs` — verify SQLite ↔ Postgres schema.
- `docs/SCALING_MILLIONS.md` — architecture guide for millions of terminals.

### Changed
- Version bumps: server `1.23.0`, frontend `2.3.0`, root `1.23.0`, Docker `1.23.0`.

### Verified (2026-09-18)
- `npm test`: **server 163/163** — 0 failures.
- Frontend production build: clean (73 entries, 4295 KB).

## [1.22.0] - 2026-09-18 — Arabic Smart User Edition (debt settlement + operational hardening)

### Fixed — Technical Debt
- **CORS production warning** now actionable: tells operators exactly what to set
  (`DYPOS_CORS_ORIGIN=https://domain.com`). (`server.js`)
- **Body limit raised** from 1MB → 2MB to support large invoices with 500+ lines,
  pricing_rules, batch/serial data, and free-item rows. (`server.js`)
- **Stock guard recommendation**: production now warns when `DYPOS_STOCK_GUARD`
  is not "strict" — guides operators away from legacy overselling risk. (`server.js`)
- **Metrics token warning** now suggests setting a token to restrict scraping. (`server.js`)
- **Backup warning** now mentions both `DYPOS_BACKUP_S3` and `DYPOS_BACKUP_DIR`. (`server.js`)

### Fixed — Functional Debt
- **`invoice_items` Arabic name + free-item tracking** (schema v15):
  - Added `name_ar` column — Arabic product name for RTL receipts and APIs.
  - Added `free_qty` column — BOGO free count on the paid line.
  - Added `is_free_item` column — flag for dedicated free rows (DyPOS convention).
  - Added `version` column on `invoices` for optimistic concurrency.
- **Server writes new columns**: `POST /api/invoices` now populates `name_ar`,
  `free_qty`, and `is_free_item` on each invoice item row. (`invoices.js`)
- **Product query upgraded**: batch-loads `name_ar` alongside `name`. (`invoices.js`)

### Fixed — Operational Debt
- **Shell error boundary** now covers the entire app (not just dashboards):
  a render throw during sale → pay → close surfaces a retryable banner
  instead of freezing the cashier. (`App.vue`)

### Added — Arabic Smart User Enhancements
- Improved Arabic error messages across server routes for better UX:
  - Stock guard 409 now shows `(المتاح N)` with available quantity.
  - Shift requirement message now more actionable.
  - Credit limit exceeded shows remaining capacity.
  - Payment method errors now include the method name in Arabic.
- `payment_methods.name_ar` displayed in API responses for Arabic clients.

### Infrastructure
- Version bumps: server `1.22.0`, frontend `2.2.0`, root `1.22.0`, Docker `1.22.0`.
- Schema migration: v14 → v15 (backward compatible, adds columns with defaults).

### Verified (2026-09-18)
- Schema migration: v14 → v15 applies cleanly.
- All existing invoice routes work with new columns.
- CORS, body limit, stock guard warnings verified in production mode.

## [1.21.0] - 2026-09-17 — Ops edition (console + doctor + load-tooling fixes)

### Added — وحدة تحكم التشغيل ( screens بلا بناء)
- `GET /admin` (عام كصفحة دخول، `no-store`): وحدة تحكم عربية RTL بملف واحد
  (`server/public/admin.html`) بلا خطوة بناء — 6 شاشات: نظرة عامة (الصحة+
  الجهاز)، طرق الدفع (تفعيل/إنشاء)، الإعدادات (نموذج الملف التجاري)، السنوات
  المالية (فتح/إغلاق/إعادة فتح)، الـ Outbox (ملخص + تصفية + إعادة + تشغيل
  دفعة)، سجل التدقيق. كل استدعاء بيانات JWT — تعقيم HTML ضد XSS.
- اختبارا انحدار `tests/ops.test.js` (تقديم HTML + تشغيل الطبيب).

### Added — الطبيب (preflight)
- `npm run doctor` (`server/scripts/doctor.mjs`): Node ≥22.5، تطابق النسخة،
  ترحيل قاعدة البيانات + سلامتها، وجود جداول الحملات، ضغط الـ outbox، مساحة
  القرص، وضعية الإنتاج (JWT/CORS/cluster) — JSON + خروج 0/1.

### Fixed — أدوات الضغط كانت مكسورة مع نموذج الصلاحيات
- `scripts/load-test.mjs` و`tests/load/k6-invoices.js` كانا يسجلان CASHIER
  فيفشل إنشاء الصنف (403) — الآن ADMIN (bootstrap). دخان مُقاس: **100/100،
  p95 ≈ 16ms، ≈397 طلب/ث**.
- `npm audit`: **0 ثغرات**.

### Verified (2026-09-17)
- `npm test`: **server 163/163** — strict **3/3** — frontend **354/354**.

## [1.20.0] - 2026-09-17 — Finance-core campaign (user-managed payments, any-country profile, fiscal control)

### Added — طرق دفع يديرها المستخدم (payment methods master)
- جدول `payment_methods` (ترحيل v13) + بذور: CASH/CARD/MADA/WALLET/BANK_TRANSFER/OTHER.
- `GET/POST /api/payment-methods` + `PATCH /:code/toggle` (نمط currencies؛ ADMIN للكتابة؛
  CASH مقفل — طريقة النظام الاحتياطية لا تُوقف أبدًا).
- `POST /api/invoices` و`/:id/pay` يتحققان من الطريقة: غير معرفة/موقوفة → 400،
  وطرق `requires_reference` (CARD/MADA/BANK_TRANSFER) ترفض الدفع بلا مرجع.
- WALLET يحتفظ بخصمه الخاص من الرصيد. الاختبارات القديمة (CASH/WALLET) خضراء بلا تغيير.

### Added — ملف النشاط التجاري لأي دولة (business profile)
- جدول `business_settings` (v13) + `GET/PUT /api/settings` (قراءة لأي دور، كتابة ADMIN،
  كل-أو-لا-شيء): business_name/country_code (ISO-3166)/currency (عملة نشطة)/tax_rate_default/
  tax_inclusive/invoice_prefix — كلها مُتحقق منها (القيم الأطول تُرفض ولا تُشذَّب لتصبح صالحة).
- الأصناف الجديدة ترث `tax_rate_default` (بدل 15 المكتوبة يدويًا) — يعمل لأي نسبة ضريبية.

### Added — سنوات مالية وترقيم متسلسل بلا فجوات (معيار الفوترة العالمي)
- جدولا `fiscal_years` + `invoice_sequences` (ترحيل v14)؛ السنة الميلادية الحالية
  تُستحدث OPEN تلقائيًا (صفر إعداد).
- أرقام الفواتير أصبحت `{prefix}-{YYYY}-{000000}` لكل (فرع/سنة)، تُخصص داخل المعاملة
  (ذرية بكاتب واحد)؛ طلبات idempotency المكررة تُخصم مسبقًا بلا استهلاك رقم.
- إغلاق السنة يحظر: الإنشاء + الدفع + الإلغاء + الإرجاع على فواتيرها (409) — الفترات
  المُبلغ عنها للضرائب ثابتة؛ إعادة الفتح متاحة (ADMIN) للطوارئ.
- `GET/POST /api/fiscal-years` + `/close` + `/reopen` (الكتابة ADMIN).

### Added — دقة التحصيل والتسعير (best-practice POS)
- الزيادة المدفوعة أصبحت `change` صريحًا: `paid/remaining` يُحَدَّدان عند الإجمالي
  فلا تظهر ذمم سالبة في التقارير أبدًا (الإنشاء والدفع)؛ المحفظة الرقمية تُخصم
  بحد ما تبقى فقط (النقدي يُسجَّل كاملًا ويُرجع الباقي — تدقيق الدرج سليم).
- `tax_inclusive=1` في الملف: الأسعار الشاملة تُفكك ضريبيًا بالهللة بدقة
  (`net = round(gross*100/(100+rate))`) — الإجمالي المحصَّل لا يتغير فلسًا.
- عملة الفاتورة الافتراضية من الملف (بدل SAR الثابتة)؛ اسم النشاط التجاري من
  الملف يظهر في رأس الفاتورة المطبوعة.

### Fixed (found by the new tests — best-practice class)
- محققو الإعدادات كانوا يشذّبون قبل التحقق (`USA`→`US` صالحة!) — الآن يُتحقق من القيمة
  الكاملة أولًا. اختبار انحدار يغطي `USAD` والبادئات الطويلة.
- تحقق طرق الدفع كان مُحضَّرًا على مستوى الوحدة قبل `migrate()` في قواعد جديدة —
  كان سيعطّل التحقق بصمت للأبد. أصبح الاستعلام كسولًا مع فحص مخبَّأ (يُحضَّر
  لكل استدعاء بعد الترحيل). مسح يؤكد: لا prepares على مستوى الوحدة لجداول مُرحَّلة.

### Docs
- `.env.example`: تحذير CLUSTER=1 (Postgres فقط) + توثيق `DYPOS_STOCK_GUARD`.
- OpenAPI: 409 التجاوز + مسارات `/payment-methods` و`/settings` و`/fiscal-years` و`/device`.

### Verified (2026-09-17)
- `npm test`: **server 155/155** (منها 14 مالية جديدة) — `npm run test:stock-strict`: **3/3** —
  frontend `vitest`: **354/354**.

## [1.19.0] - 2026-09-17 — Enterprise audit fixes C1–C5 + version unification + device adaptation

### Fixed — منع الجرد السالب (C1+C5)
- `POST /api/invoices` now decrements stock through a guarded statement
  (`UPDATE … WHERE qty+?>=reserved_qty`) inside the same write transaction —
  a sale that would drive `qty` below `reserved_qty` (available) is refused
  with **409 + Arabic message** and the whole invoice rolls back. Tracked
  stock can never go negative; a second oversell can no longer interleave
  (SQLite single-writer + in-transaction check).
- Missing-row policy via `DYPOS_STOCK_GUARD` (default `legacy`): untracked
  walk-in rows stay unlimited (backward compatible); `strict` treats a
  missing row as 0 available → 409 (enable on the origin once every sellable
  SKU carries a `stock_levels` row).
- Regression tests: `server/tests/stock-guard.test.js` (legacy, 6 tests) +
  `server/tests/stock-guard-strict.test.js` via `npm run test:stock-strict`
  (strict, 3 tests).

### Fixed — cluster + SQLite fail-fast (C2, verified in place)
- `DYPOS_CLUSTER=1` with the SQLite driver refuses to boot with an Arabic/
  English FATAL explaining the single-writer reality (zero write scale-out,
  N duplicate dispatchers) and the two fixes (single process, or PostgreSQL).

### Fixed — version single source (C3)
- New `server/lib/version.js` (`VERSION = '1.19.0'`) imported by `server.js`,
  `routes/openapi.js`, `routes/print.js`; `server/package.json` bumped to
  match; frontend build stamps `DyPOS_BUILD_VERSION` into
  `DyPOS/public/pos/version.json` (the old timestamp fallback is gone from
  releases — always build with the version env).
- Drift test `server/tests/version.test.js`: package.json ≡ lib ≡
  `/api/health` ≡ `/api/ready` ≡ `/api/openapi.json`.

### Fixed — webhook dispatcher leader lease (C4)
- Migration **v12** adds `dispatcher_lock`; `lib/webhooks.js` acquires a 20s
  lease every 10s tick and only the holder delivers the outbox — no duplicate
  deliveries with several processes on one SQLite file.
- Regression test `server/tests/dispatcher-lease.test.js` (acquire / refuse /
  renew / steal-expired).

### Added — device adaptation + perf warnings
- Public `GET /api/device` (`server/lib/device.js`): classifies the caller UA
  (mobile/tablet/desktop/bot), returns UI adaptation hints + Arabic warnings
  (bot traffic, unsupported/outdated browser, origin memory pressure).
- POS `src/composables/useDevice.js`, wired fail-soft into `main.js` boot:
  viewport+touch classification (catches iPad-as-Mac), body classes
  (`dypos-device-*`, `dypos-device-low-spec`), low-spec/save-data toast
  warnings that never block rendering.

### Verified (2026-09-17)
- `npm test`: **server 140/140** — `npm run test:stock-strict`: **3/3** —
  frontend `vite build` clean (bundle `index-gpZjn86c.js`, 0 Jinja blocks).

## [server v1.11.0] - 2026-09-17 — معيار المليارات (Async Safety + IDOR + Exact Money + FTS)

### Added / Hardened (كل عملية/استعلام/تقرير بمعيار: احترافي، موثوق، محمي، سريع، دقيق)
- أمان غير متزامن: `lib/async.js` (`ah()`) يغلف كل المعالجات الـ23 + الصحة/الجاهزية/المقاييس — لا طلب معلق أبدًا (Express 4 لا يلتقط رفض الوعود).
- منع IDOR عبر المستأجرين: `assertRecordTenant` (404 بلا تسريب وجود) على كل قراءة/كتابة برقم (أصناف/عملاء/فواتير/دفع/إلغاء/إرجاع/تدقيق/طباعة/ورديات/مخزون).
- دقة المال: `lib/money.js` (هللات صحيحة، تقريب نصف-لأعلى وحيد) + إعادة كتابة إجماليات الفواتير والدفعات — `0.1×3=0.30` و`19.99×3+15%=68.97` بالضبط.
- تواريخ قابلة للفهرسة: `lib/dates.js` + إسقاط `date()` من اليومي/الملخص/الطباعة/التصدير (بحث فهرسي بدل مسح كامل).
- بحث FTS5 للكتالوج (ترحيل v11 + triggers + تعبئة) مع سقوط LIKE + `toFtsQuery` المعقم + `idx_stock_qty`.
- keyset (`?after=` + `nextCursor` بترتيب مستقر) و`?count=false` للفواتير والأصناف.
- تكافؤ Postgres محدث (tsvector موثق + الفهرس) — الفاحص يتجاهل جداول FTS الظلية.

### Verified (2026-09-17)
- `npm test`: **server 111/111** (106+5) — `frontend 348/348` — `npm audit` صفر — `parity` أخضر.

## [server v1.10.0] - 2026-09-17 — الربط الآلي والاسترداد (API Keys + Recovery + Pay Idempotency)

### Added
- مفاتيح API للربط الآلي (ترحيل v10): `POST/GET /admin/api-keys` (السر يظهر مرة واحدة، hash فقط يُخزن) + تدوير + إبطال ناعم (يحفظ الأثر) + أدوار + نطاقات + مستأجر + انتهاء + `X-API-Key` مقبول في كل المسارات المحمية (آخر استخدام مختوم كل ساعة).
- استرداد كلمة المرور: `POST /auth/forgot` (200 دائمًا بلا تعداد، رمز وحيد 15 دقيقة) + `POST /auth/reset` (يبطل كل الجلسات) — الخام يُعرض خارج الإنتاج فقط.
- منع تكرار الدفع: `idempotencyKey` في `POST /:id/pay` (فهرس فريد جزئي + `{deduped:true}` للمعاد).
- مساحة القرص في الصحة (`disk.free_mb`, أفضل جهد).

### Verified (2026-09-17)
- `npm test`: **server 106/106** (102+4) — `frontend 348/348` — `npm audit` صفر — `parity` أخضر 26/26.

## [server v1.9.0] - 2026-09-17 — التعدد والتحكم (Tenancy + Masters + Trail)

### Added (فرض تعدد المشتركين والمؤسسات والفروع والمزامنة والرقابة)
- تعدد المستأجرين (ترحيل v8 + تكافؤ Postgres): `tenants → organizations → branches` (تسلسل مفروض كتابةً) + أعمدة نطاق (`tenant_id` للأصناف/العملاء/الفواتير/الورديات، `branch_id` للفواتير/الورديات) + `DYPOS_REQUIRE_TENANT=1` للفرض (افتراضي 0 للتوافق) + فلترة القراءات + سياق `X-Tenant-Id/X-Org-Id/X-Branch-Id`.
- حقول الرقابة: `created_by/updated_by` (أصناف/عملاء/فواتير) تُملأ من الجلسة في كل كتابة.
- تتبع الأثر الدائم: `audit_trail` (قبل/بعد + مستخدم + IP + مستأجر) عبر `lib/trail.js` مربوط في المنتجات/العملاء/الفواتير/المخزون/الورديات + `GET /api/admin/trail` (مفلتر ومرقم) — مكمل للحلقة المؤقتة.
- عملات (ترحيل v9 + بذور): `currencies` (SAR أساس + 7 عملات) + `GET/POST/PATCH /currencies` + `POST /currencies/convert` + تحقق الفواتير (400 لعملة مجهولة).
- وحدات قياس: `uoms` (12 وحدة: count/weight/volume/length) + `GET/POST /uoms` + `POST /uoms/convert` (نفس الفئة فقط) + تحقق الأصناف والفواتير.
- جلسات: `GET /auth/sessions` (بلا تسريب hash) + `DELETE /auth/sessions/:id` (إبطال واحد).
- عملاء: `DELETE /:id` (إيقاف ناعم ADMIN/MANAGER).
- ورديات: `POST /:id/handover` (إغلاق+فتح ذري مع ترحيل النقدية والنطاق).
- مخزون: `POST /stock/reserve` (تحقق المتاح = الكمية−المحجوز) + `POST /stock/release`.
- أصناف: `PATCH /:id` (جزئي + 409 للكود المكرر).
- مزامنة: `GET /pull?entity=` + تصدير `?fields=`.
- دفع بالمحفظة عند البيع: طريقة `WALLET` في الإنشاء والدفع اللاحق (402 للرصيد، 400 بلا عميل، ذرية مع الفاتورة + دفتر).
- تدوير الرموز: `POST /auth/refresh` (القديم يموت فورًا) + ربط `tenantId` بالتسجيل (404 للمجهول) ويظهر في الدخول و`/me` وقائمة المستخدمين.
- محرك العروض: `POST /offers/evaluate` (PERCENT/FIXED بالعتبات والنوافذ + BXGY أسطر مجانية + `one_time_per_customer`، بلا آثار).
- ورديات: `GET /:id/xreport` (لقطة بلا إغلاق + معاينة فرق).
- تقارير: `GET /api/reports/summary` (نطاق + متوسط تذكرة + أعلى 5 + حسب الحالة/الطريقة، ADMIN/MANAGER/AUDITOR).
- عملاء: `POST /:id/credit/pay` (سداد الائتمان بأرضية صفر).
- مخزون: `GET /stock?tenant=` عبر المستودعات.

### Verified (2026-09-17)
- `npm test`: **server 102/102** (96+6) — `frontend 348/348` — `npm audit` صفر — `parity` أخضر 26/26.

## [server v1.8.0] - 2026-09-17 — الدفتر والقفل المشترك وXML (Ledger + Shared Lockout + UBL)

### Added
- دفتر محفظة canonical (ترحيل v7 + تكافؤ Postgres): `wallet_transactions` (مبلغ/اتجاه/رصيد بعد) + تعبئة رجعية + كتابة مزدوجة في الشحن/الاستبدال + `GET /customers/:id/wallet` (كشف مرقم).
- إلزام الوردية الاختياري: `DYPOS_REQUIRE_SHIFT=1` يرفض البيع بلا `shiftId` مفتوحة (400/404/409) — افتراضي 0 للتوافق.
- قفل دخول مشترك عبر الكاش (ذاكرة أحادي + Redis متعدد العمال) بدل `Map` لكل عملية.
- مقياس `dypos_stock_low_products` + `stock{low_count,threshold}` في الصحة + تنبيه `DyPOSLowStock` + `DYPOS_LOW_STOCK_THRESHOLD`.
- فاتورة UBL 2.1: `GET /print/invoice/:id?format=xml` (مورّد/ضريبة/بنود/إجماليات، بلا اعتماديات) + توثيق OpenAPI.
- فاحص تكافؤ Postgres `npm run parity` (جداول/أعمدة/فهارس، يطبع الانحراف) — اصطاد `idx_products_name_active` المفقودة وأُضيفت.
- واجهة: `useCachedResource` (SWR تفاعلي فوق `memoizeAsync`) + 5 اختبارات + `dy-cv-row` (content-visibility) لقوائم الفواتير/المرتجعات/الكوبونات/الأصناف.

### Fixed (حرج)
- `GET /export/jobs` كان يبتلعه `/:entity` (404 دائم) — أُعيد الترتيب.
- عنصر `cac:Item` مكرر في UBL أُزيل.

### Verified (2026-09-17)
- `npm test`: **server 82/82** (39+18+13+7+5) — `frontend 348/348` — `npm audit` صفر — `parity` أخضر 20/20.
- `campaign --soak 5` (قاعدة نظيفة): **8/8 PASS** (burst 455rps p95 94ms، soak 2425 فاتورة p95 32ms).

## [server v1.7.0] - 2026-09-17 — الملايين الجاهزة (Shared Limits + Chain + Jobs + Shell)

### Added
- حد مشترك `lib/rate-store.js` (واجهة Store الرسمية): خرائط لكل محدد (`global`/`auth`) + Redis مشترك عند `DYPOS_REDIS_URL` — يغلق فجوة «الحد × العمال» مع `localKeys:true` (عقد MemoryStore) وسقوط آمن للذاكرة.
- سلسلة تشفير الفواتير (ترحيل v6 + تكافؤ Postgres): `invoices.chain_hash/chain_prev` + `invoice_audit` (number/status/total/action) + `zatca_settings` — ربط ذري في CREATE/PAY/VOID/RETURN عبر `lib/chain.js` + `GET /invoices/:id/audit` + `GET /admin/chain/verify` (إعادة تشغيل دقيقة).
- إعدادات زاتكا: `GET/PUT /admin/zatca/settings` (تحقق 15 رقمًا) — الطباعة تفضل DB على env في QR-TLV.
- مهام تصدير خلفية حتى 100k صف: `POST /export/:entity/jobs` (202) + `GET /export/jobs` + `GET /export/jobs/:id?download=1` عبر `lib/jobs.js` (دفعات 2000 + تنازل، نتائج 10 دقائق) — المتزامن يبقى ≤10k.
- واجهة: حد أخطاء عام في `App.vue` (يحمي مسار البيع الحرج، لا يدمر السلة) + skip-link عالمي + `main#dypos-main` + تركيز المسار في `router.afterEach`.
- اختبارات `tests/scale3.test.js` (7 حراس: مخزن، سلسلة، زاتكا، مهام، OpenAPI).

### Fixed (حرج)
- `ERR_ERL_DOUBLE_COUNT`: المخزنان المخصصان كانا يتشاركان `Map` ومفتاح نافذة واحد — حركة API كانت تأكل ميزانية الدخول (30). الآن عزل + نطاقات + `localKeys`.
- ترتيب مسارات التصدير: `GET /jobs` كان يبتلعه `/:entity` (404 دائم) — أُعيد الترتيب مع تعليق حارس.

### Verified (2026-09-17)
- `npm test`: **server 77/77** (39+18+13+7) — `frontend 343/343` — `npm audit` صفر.
- `load 400@20`: **338 rps, p95 83ms, 0 أخطاء** — `campaign --soak 5` (قاعدة نظيفة): **8/8 PASS** (burst 314rps، soak 1676 فاتورة p95 45ms).

## [server v1.6.0] - 2026-09-17 — استكمال الديون (Wallet/Loyalty + Offers/Coupons + Ops)

### Added
- محفظة: `POST /customers/:id/wallet` (شحن/خصم يدوي ADMIN/MANAGER، يمنع السالب،+Loyalty ledger) + `GET /:id/loyalty` (كشف النقاط المرقم).
- ولاء: `POST /:id/loyalty/redeem` (نقاط → محفظة بسعر `DYPOS_LOYALTY_RATE=0.1` + ترقية فئة تلقائية BRONZE→SILVER→GOLD→PLATINUM، وVIP يدوي) + ربط الكسب/العكس في إنشاء/إلغاء/إرجاع الفواتير (`lib/loyalty.js` مصدر حقيقة واحد).
- عروض/كوبونات (كانت جداول بلا API): `GET/POST /offers/offers` + `toggle` + `GET/POST /offers/coupons` + `toggle` + `POST /offers/coupons/validate` (بلا آثار) + حقل `couponCode` في إنشاء الفواتير (خصم ذري + `used_count` بسباق آمن، 409 عند النفاد).
- مخزون: `POST /stock/transfer` (نقل ذري بين المستودعات، 402 عند عدم الكفاية).
- إدارة: `PATCH /admin/users/:id` (تعطيل/دور، يبطل الجلسات عند التعطيل، يمنع تعطيل/تخفيض الذات) + `POST /admin/users/:id/reset-password` (يبطل الكل + `mustChangePassword`) + `GET /admin/audit` (نافذة ring-buffer قابلة للفلترة) + `DELETE /admin/backups/:file` (تقليم آمن) + قفل تزامن النسخ (409 عند التشغيل).
- ويبهوك: `PUT /:id` (تحديث url/events) + `POST /:id/rotate-secret` + إصلاح `DELETE` (404 عند الغياب) + `retry` يقبل `FAILED` + قراءة لـ MANAGER/AUDITOR + كتالوج أحداث موسع.
- ورديات: حد الفرق من `DYPOS_SHIFT_VARIANCE_LIMIT` (بدل 100 الثابتة).
- مراقبة: عدادا `dypos_webhook_outbox_pending/dead` (تُغذى من `/health`) + 4 تنبيهات جديدة (lockout، dead، backlog، miss-storm، DB slow) + وسم صور Docker `1.6.0`.
- واجهة: `manifest` في `index.html` + `preconnect` (fonts/flagcdn) + `noscript` + توحيد `manifest.webmanifest` مع إعداد Vite + حذف ملف `query` الدخيل (W3SVC).
- اختبارات `tests/scale2.test.js` (13 حارسًا) + حملة ضغط متسامحة مع DB غير نظيفة (ADMIN ثم CASHIER fallback).

### Verified (2026-09-17)
- `npm test`: **server 70/70** (39+18+13) — `frontend 343/343` — `npm audit` صفر.
- `load 400@20`: **442 rps, p95 64ms, 0 أخطاء** — `campaign --soak 5`: **8/8 PASS** (burst 316rps، soak 2113 فاتورة p95 31ms).

## [server v1.5.0] - 2026-09-17 — حملة الترقية للملايين (Scale + Hardening + Functional Debts)

### Added (تقنيات معيارية للملايين)
- كاش قراءة متعدد المستويات `lib/cache.js`: LRU + TTL (5s افتراضي) + SWR مع دعم اختياري لـ Redis عبر `DYPOS_REDIS_URL` (يسقط تلقائيًا للذاكرة دون `ioredis`).
- دلالات HTTP قياسية: `ETag` ضعيف + `304` + `Cache-Control: private, max-age, stale-while-revalidate` + `Vary: Authorization` على الكتالوج/المخزون/الفواتير + `X-Cache: HIT/MISS`.
- عقد OpenAPI 3.0 في `GET /api/openapi.json` (كل المسارات بما فيها الجديد `return` و`logout-all`).
- صحة موسعة `GET /api/health`: كاش + `outbox{pending,dead}` + ذاكرة + uptime؛ ترويسات `X-Response-Time` و`X-Request-Id` و`X-QR-Kind`.
- مقاييس حية: `dypos_auth_attempts_total{ok,fail,locked}` (كانت ميتة) + `dypos_cache_operations_total{hit,miss}` + `dypos_db_query_duration_seconds{operation}` عبر `observeDb`.
- قفل brute-force داخل الذاكرة (8 فشل/15د → 429) + `POST /auth/logout-all` + إبطال كل الجلسات الأخرى عند تغيير كلمة المرور (`revokeAllSessions`).
- مروحة Webhook متوازية لكل مشترك (8s timeout) مع كتابات DB تسلسلية — مشترك بطيء لا يحجب الدفعة.
- `POST /api/invoices/:id/return` (يعكس مخزون/ولاء/ائتمان، حالة `RETURNED`) — تقرير `daily refunds` صار حيًا.
- `GET /api/shifts` (سجل الورديات المرقم) + فلاتر `low/threshold` و`offset` للمخزون + `sort/order` و`includeInactive` للأصناف + `offset` للتصدير + `total/hasMore` في كل القوائم.
- QR زاتكا TLV (Base64) عند ضبط `DYPOS_VAT_NUMBER` (`X-QR-Kind: zatca-tlv` وإلا `json`).
- واجهة: إصلاح كسر البناء `POSFooter→useI18n` (استبدال بـ `useLocale+__`) + تقسيم حِزم (`vendor-frappe/charts/realtime/print`) + `target es2020` + حد 500KB + قاعدة `flagcdn` في PWA.
- توثيق `docs/SCALING_MILLIONS.md` (معمارية Single-Writer + حدود معلنة + خطوة Postgres/Redis التالية).
- اختبارات `tests/scale.test.js` (18 حارسًا جديدًا) + إصلاح حملة الضغط لتسجيل ADMIN (ضروري بعد RBAC).

### Changed / Fixed (سداد ديون وظيفية وأمنية)
- **RBAC:** `POST /stock/adjust` و`DELETE /products/:id` و`POST /sync/push` صارت ADMIN/MANAGER فقط (كانت مفتوحة للكاشير/المدقق).
- **مالية:** فرض `credit_limit` (402 عند التجاوز، 0 = غير محدود للتوافق) + إصلاح إرجاع `statusCode` في إنشاء الفواتير (كان دائمًا 400).
- **`sync/push` مغلق الفشل:** الأنواع المجهولة تُرفض `FAILED` بدل تعليم `SYNCED` كاذب.
- **تحقق متكافئ:** `PUT /customers` يتحقق من الهاتف/البريد/فئة الولاء مثل `POST`؛ `POST /shifts/:id/close` يتحقق من `closingCash`.
- **حملة الضغط 8/8 خضراء** بعد الإصلاح (burst 463rps p95 122ms، soak 5s: 1849 فاتورة p95 36ms، صفر أخطاء).

### Verified (أدلة التشغيل 2026-09-17، in-memory)
- `npm test`: **server 57/57** (39 قديمة + 18 جديدة) — `frontend 343/343` — `npm audit` صفر ثغرات.
- `load-test 400@20`: **621 rps, p95 37ms, errors 0** (الميزانية p95<800ms).
- `stress-campaign --soak 5`: **8/8 PASS** (انظر التقرير أعلاه).

## [server v1.4.0] - 2026-09-16 — منصة التكامل (Backup/Restore/Import/Export/Webhooks)

### Added
- تصدير `GET /api/export/:entity` (‏CSV متدفق + ‏JSON) لسبعة كيانات مع فلاتر
  وسقف 10k (أدوار قراءة: ADMIN/MANAGER/AUDITOR).
- استيراد `POST /api/import/:entity` (‏JSON + ‏CSV) مع `dryRun` وفشل مغلق
  وupsert غير مكرر التأثير للمنتجات/العملاء/المخزون، واستثناء معدّل الطلبات
  للاستيراد الكبير (بدون اعتماديات جديدة).
- استعادة حقيقية: تدريج عبر `POST /api/admin/restore` + تبديل ذري عند الإقلاع
  في `entrypoint.js` مع نسخة rollback — مُثبتة بتدريب حي (marker_count=0).
- Webhooks لأي نظام: اشتراكات + ‏Outbox + مرسل خلفية بتوقيع HMAC وإعادة
  محدودة + `X-DyPOS-*` headers (أحداث: فواتير/مخزون/منتجات/عملاء/ورديات).
- مصادقة عبر الكوكيز/التوافق القديم: الواجهة المنشورة تُعاد ربطها بدون
  إعادة بناء (‏Bearer أو ‏`dypos_token`).
- ترحيل مخطط v4 (‏SQLite + ‏Postgres parity).

### Fixed (حرج)
- `entrypoint.js` كان يُهاجر ولا يُشغّل المستمع أبدًا (‏isMainModule خاطئ عند
  الاستيراد) — حاوية Docker الإنتاجية كانت ستصمّ. الآن `start()` صريحة.
- إصلاح مسار النسخة المُدرجة (مجلد النسخ لا البيانات) + تحمّل BOM.

## [server v1.4.1] - 2026-09-16 — المتطلبات الوظيفية (إنتاج)

### Functional (بحث/إضافة/تعديل/طباعة/إيقاف/استيراد/تصدير)
- بحث موحّد `q` في الفواتير + فلتر `active` للعملاء + سقف pagination آمن.
- إيقاف/تفعيل: `PATCH /:id/toggle` للعملاء والمنتجات (ADMIN/MANAGER) +
  `POST /invoices/:id/void` (يعكس المخزون والولاء والائتمان).
- طباعة: `GET /api/print/invoice/:id` (‏HTML + ‏QR) و `GET /api/print/daily`.
- استيراد/تصدير: متكامل + فحوص `functional.test.js` (‏39/39).

### Schema
- ترحيل v5: ‏`customers.is_active` + ‏`invoices.voided_*` + فهارس.

## [server v1.3.2] - 2026-09-16

### Security / Operations
- `uuid` ‏10 ← ‏`11.1.1` (‏GHSA-w5hq-g745-h8pq) — `npm audit` صفر ثغرات.
- حراس بدء الإنتاج: تنبيه FATAL عند قاعدة بلا مستخدمين، وتحذيرات توكن
  المقاييس وغياب النسخ.
- `npm run backup:verify` + خطوة CI لاختبار الاستعادة تلقائيًا.
- ثغرات toolchain الواجهة (‏vite/vitest — تطوير فقط، لا تُشحن) مُوثقة كمقبولة
  لحين نافذة صيانة مع rebuild كامل.

## [server v1.3.1] - 2026-09-16

### Added / Fixed
- `DYPOS_RATE_LIMIT_MAX` و `DYPOS_AUTH_LIMIT_MAX` للتحكم بالمعدلات (حمل/اختبار).
- حملة ضغط `npm run campaign` خضراء 8/8 (انفجار، idempotency، سباق دفع،
  دقة مخزون، مزيج، مسابر أمنية، نسخة قراءة، ثبات) بعد إصلاح 4 عيوب في أدواتها.

## [1.18.0] - 2026-09-16

### Fixed — نشر الإنتاج (Production redeploy)
- إصلاح النشر المنشور على `dypos.smartportssoft.com`: النسخة الحية كانت ملف
  `pos.html` خامًا بوسوم Jinja غير معالجة (`{% for key in boot %}`) وبدون
  كسر كاش — أُعيد البناء بحزمة إنتاج نظيفة (Jinja مُزالة، `?v=1.18.0`).
- توحيد الحزمة عبر `scripts/build-prod-package.ps1` + `ORIGIN-DEPLOY.bat`
  (مرآة بأداة robocopy تحذف المقاطع القديمة تلقائيًا).

### Backend (server v1.3.0 — نفس اليوم)
- Invoices: ترتيب FK الصحيح، idempotency مفهرس، دفع/إغلاق ذري، توفير المستودعات.
- Auth: bcrypt غير حاجب، جلسات jti مع إبطال، منع تصعيد ADMIN ذاتي.
- Tier-1 SQLite معلن + مسار Postgres (`schema-postgres.sql`)، نسخ احتياطي
  (`VACUUM INTO`)، حمل مثبت (372 req/s، p95 ‏93ms)، تنبيهات Prometheus.

## [1.17.0] - 2026-09-16

### Added — المرحلة 2: تقنيات تنافسية متقدمة (معيار SAP/Odoo)

- **حجوزات المخزون الأوفلاين (Anti-Overselling)** — `services/stock-reservations.js`
  - حجز ذري داخل معاملة Dexie يمنع بيع نفس الوحدات من عدة طرفيات منقطعة
  - تثبيت الحجز عند نجاح البيع، تحريره عند الإلغاء، وتحرير تلقائي عند انتهاء الصلاحية (30 دقيقة)
  - قراءة المخزون الفعلي من الكاش المحلي وتجاهل الأصناف غير الموجودة به (لا حظر بسبب كاش قديم)
  - دمج كامل مع `submitSale` في متجر الجلسة + تحرير تلقائي عند فشل الإدراج

- **ترقيم فواتير أوفلاين منظم** — `services/offline-numbering.js`
  - صيغة `POS-{فرع}-{طرفية}-{yyyymmdd}-{تسلسل}` متوافقة مع متطلبات الفوترة الإلكترونية
  - عداد يومي ذري (معاملة Dexie) آمن مع عدة تبويبات على نفس الطرفية

- **مزامنة أولية مجزأة (Chunked Initial Sync)** — `sync-core.js`
  - جلب الكتالوجات الضخمة صفحة صفحة (500 صف/طلب) مع تطبيق فوري وتقدّم مباشر للواجهة
  - نقطة تفتيش من توقيت الخادم فقط (ساعات الأجهزة غير موثوقة) + حد أمان 200 صفحة
  - تشغيل تلقائي عند أول إعداد للطرفية وعند العودة للشبكة (`ensureInitialSync`)

- **أولويات دفع المزامنة** — `sync-core.js`
  - الفواتير أولًا ثم الدفعات فالمخزون فالعملاء فالأصناف فالإعدادات (مبدأ أولوية المستندات المالية)
  - FIFO داخل نفس الأولوية

- **مؤشر حالة المزامنة الحي** — `components/pos/SyncStatusIndicator.vue`
  - متصل / جارٍ المزامنة / تحميل أولي بالتقدم / غير متصل + شارة عدد العمليات المعلقة
  - تلميح بوقت آخر مزامنة ناجحة، استقصاء كل ثانيتين، دعم تقليل الحركة (reduced-motion)
  - مدمج في رأس شاشة البيع (POSSale) عبر خانة الإجراءات

- **قاعدة البيانات**: جدول `reservations` (إصدار v2) بفهارس مركبة للحجوزات

- **اختبارات جديدة (21 اختبارًا)**: `stockReservations` (9)، `offlineNumbering` (6)، `chunkedSync + أولويات الدفع` (6) — المجموع **343 اختبارًا ناجحًا**

### Previous — طبقة المزامنة الاحترافية (المرحلة 1)
- **خدمات المزامنة الست** (`POS/src/services/`):
  - `sync-protocol.js` — طبقة النقل HTTP مع إعادة المحاولة والانتهاء الزمني
  - `sync-auth.js` — مصادقة المنصة، إدارة الرموز، وإلغاء التفويض
  - `sync-error.js` — تصنيف الأخطاء (قابلة/غير قابلة لإعادة المحاولة)
  - `sync-validator.js` — التحقق من صحة البيانات قبل المزامنة
  - `offline-store.js` — مستودع التغييرات والنزاعات ونقاط التفتيش (Dexie/IndexedDB)
  - `sync-core.js` — دورة المزامنة (سحب/دفع مستقلان + تقدم نقطة التفتيش)
  - `sync-manager.js` — قائد المزامنة: الاستطلاع الدوري، حالة الاتصال، قائمة الانتظار
- **مستودع محلي كامل** (`db.js`): عملاء، أصناف، مخزون، فواتير، دفعات، جلسات، تقارير يومية، سجل مراجعة النزاعات
- **ربط كامل بالجلسة**: تهيئة عند تسجيل الدخول، إيقاف عند الخروج، ودفع الفواتير المحلية إلى قائمة المزامنة
- **اختبارات**: `syncCore.test.js` (6 اختبارات) و `offlineStore.test.js` (9 اختبارات) — المجموع 257 اختبارًا ناجحًا

### Changed
- إصلاح 18 ملاحظة جودة (تنسيق Biome + قواعد lint) في ملفات الاختبارات — الفحص نظيف بالكامل

### Fixed
- إصلاح اختبار `offlineNumbering` — تثبيت التاريخ في `peekSequence` لتفادي فشل التبعية على توقيت النظام (2026-09-15)
- تحسين `peekSequence` لدعم معامل `kind` للعدادات متعددة الأنواع

## [1.16.0] - 2026-04-01

### Added
- **Brands Filter** (#180)
  - Filter items by brand in the POS item selector
  - Brand handling integrated with POS Profile configuration
  - Offline brand filtering support in IndexedDB cache

- **Credit Return to Wallet** (#181)
  - Return invoices can credit the refund amount to customer wallet
  - Auto-create wallet on customer insert if wallet feature is enabled
  - Reverse wallet transactions for return invoices (full and partial returns)

- **POS-Only Pricing Rules** (#169)
  - New "POS Only" checkbox for Promotional Schemes and Pricing Rules
  - POS-only rules are automatically excluded from non-POS documents (desk, website)
  - Module-level monkey-patch for `get_other_conditions` since no Frappe hook exists

- **Sales Persons Offline Caching** (#174)
  - Sales persons list cached for offline use
  - Refresh button to manually reload sales persons

- **POS Reports Suite** (#158, #171, #172)
  - Sales vs Shifts Report with advanced analytics and chart visualization
  - Payments and Cash Control Report with expected amounts and per-shift rows
  - Inventory Impact and Fast Movers Report with improved filters
  - Cashier Performance Report
  - Offline Sync and System Health Report
  - Eliminated double-counting across all reports by using Sales Invoice Reference

- **Session Lock Screen** (#161)
  - Configurable session lock with password protection
  - Brute-force protection with progressive lockout
  - Offline unlock fallback
  - Persistence across page reloads via localStorage
  - Disabled by default in POS Settings

- **QZ Tray Silent Printing** (#143)
  - Self-signed certificate generation and server-side signing
  - Silent printing integration for receipt printers
  - Arabic translations for QZ Tray UI

- **Cart Sort & Filter** (#145)
  - Sort dropdown for cart items

- **Show Variants as Items** (#150, #153)
  - New POS setting to display item variants directly in the item grid
  - Configurable per POS Profile

- **Require Actual Closing Amounts** (#159)
  - Manual entry of actual closing amounts when closing shift (no auto-fill from expected)

- **Shift Reopen Initialization** (#160)
  - Default customer, warehouse, and offline cache properly initialized on shift reopen

- **Overpayment Confirmation** (#187)
  - Confirmation dialog when cashier enters payment amount exceeding invoice total
  - Closing shift reconciliation fixes

- **Allow User to Edit Rate** (#128)
  - Backend validation and audit logging for manual rate edits
  - Frontend rate tracking

- **Draft Invoice Printing** (#213, #223)
  - Print draft invoices from the Drafts dialog
  - Customizable print header and footer

- **Hide POS Actions When Shift is Closed** (#212, #226)
  - POS action buttons and print hidden when no active shift

- **Auto-Select Quantity in UOM Dialog** (#222)
  - Quantity input auto-selected when UOM dialog opens for faster editing

- **UOM Handling Refactor** (#225)
  - Refactored UOM handling in EditItemDialog for better price and factor display

- **Nexus POS Manager Role**
  - New role for desk switching functionality
  - "Switch To Desk" button in POS Sale page

- **Ignore Pricing Rule Setting** (#185)
  - `ignore_pricing_rule` configurable in POS Profile

- **Item Group Search** (#183)
  - Search items by item group name in POS search

- **Custom Fields Migration** (#179)
  - Convert custom fields and print format from fixtures to exported customizations

### Changed
- **Customer Search** (#208)
  - Server-side search filtering on name, customer_name, mobile_no, email_id (was browse-only before)
  - Customer creation routed through `DyPOS.api.customers.create_customer` instead of generic `frappe.client.insert`

- **Loyalty Program Assignment** (#208)
  - Context-aware loyalty assignment using explicit company/POS Profile
  - Ambiguity guard: skips auto-assignment when multiple different loyalty programs exist for the same company

- **Coupon Discount Base** (#219)
  - Coupon dialog now respects `apply_on` setting (Grand Total vs Net Total)
  - Previously all coupons calculated against subtotal regardless of configuration

- **Partial Payments** (#216)
  - Payment Entry creation now uses DyPOS core `get_payment_entry()` instead of manual field construction
  - Multi-currency support via core currency setup
  - Batch payment creation wrapped in database savepoint for atomic rollback on failure

- **Return Invoice Performance** (#174)
  - Optimized return invoice creation path

### Fixed
- **Payment Amount Preservation** (#228)
  - DyPOS's `set_missing_values()` no longer wipes cashier-entered payment amounts during invoice creation
  - Root cause: DyPOS removed the `if not self.get("payments")` guard in `set_pos_fields()`, causing `update_multi_mode_option()` to run unconditionally
  - Fix: use `set_missing_values(for_validate=True)` to skip the destructive payment rebuild

- **Customer Credit Redemption** (#218)
  - Frontend now preserves customer credit metadata through the POS submit flow
  - `customer_credit_dict` and `redeemed_customer_credit` properly sent to backend
  - Pure customer-credit POS sales (no cash/card payment) now submit correctly

- **Credit Source Ownership Validation** (#221)
  - Validates that credit source invoices/advances belong to the same customer and company as the target invoice
  - Defense-in-depth checks at both validation and mutation layers
  - Rejects non-Customer or non-Receive payment entries before advance allocation

- **One-Use Coupon Enforcement** (#205)
  - Coupon usage counted across both Sales Invoice and legacy POS Invoice doctypes
  - Prevents reuse of one-use coupons even when previous usage was on a different document type

- **Cross-Branch Return Payment Modes** (#177)
  - Foreign payment modes remapped on cross-branch return invoices
  - Desk form closing shift path also handles remapping

- **Stock Validation** (#168)
  - Stock validation enforced across all cart entry paths (manual add, barcode, offers)

- **Barcode Matching** (#129)
  - Changed barcode matching to exact match (was substring match, causing false positives)
  - Barcode scan queue prevents lost items at rapid scanning speeds

- **Free Item Handling** (#151, #152, #154, #155)
  - Warehouse assignment from POS Profile for free items
  - Free items that are different products handled correctly
  - Deduplicate free items from `mixed_conditions` pricing rules
  - Promotions list filtered to only show selling schemes

- **Pricing Rule Filter** (#155)
  - Guard `pos_only` pricing rule filter for sites without DyPOS installed

- **Discount Calculation**
  - Fixed discount calculation for fixed amount coupons
  - Draft cleanup restricted to only POS Sales Invoices

- **POS Profile Cache**
  - Cache invalidation when POS Profile is updated

- **Warehouse Settings**
  - Warehouse change event uses event bus instead of emit (fixes settings propagation)

- **Inclusive Tax Returns**
  - Return invoice processing correctly handles inclusive taxes

### Security
- **Credit Source Validation** (#221) — Prevents cross-customer/cross-company credit theft via client-supplied document names
- **Atomic Coupon Consumption** — Coupon usage increment protected by `SELECT FOR UPDATE` row locking (merged via #205)
- **Session Lock** — Brute-force protection with progressive lockout for session lock screen

## [1.15.0] - 2026-02-06

### Added
- **Customer Credit Balance as Payment Method**
  - New "Add to Customer Credit Balance" option in return dialog — cashiers can choose between cash refund or adding credit to customer balance
  - Customer credit payment method — use positive credit balance (from returns/advances) as payment
  - New `allow_customer_credit_payment` POS Setting to enable credit balance payments
  - Race condition protection using SELECT FOR UPDATE for concurrent credit redemption
  - Optimistic locking with modified timestamps to prevent stale credit usage
  - Return type indicators in Invoice Details: blue "Added to Customer Credit" vs green "Cash Refund"
  - Separated credit calculation: regular invoice outstanding (debt) vs return invoice credit, preventing double-counting

- **Shift Duration Improvements**
  - Timezone-safe shift duration calculation — server sends `server_now` timestamp, frontend computes elapsed time without timezone mismatch
  - Multi-day shift display with proper formatting (e.g., "2 Days 3 Hours 15 Minutes")
  - Full word time labels on desktop: Hours, Minutes, Seconds with proper singular/plural handling
  - Shift timer pauses automatically when closing dialog is open
  - Idle warning when shift closing dialog stays open for over 1 minute

- **Enhanced Mobile Payment UI**
  - Physical keyboard input support (0-9, decimal, backspace, Enter) for payment numpad
  - Consistent payment method layout across cash and non-cash payment types
  - Context-aware quick amounts: ceiling/rounded denominations for cash, exact fractional amounts for non-cash
  - Quick amounts always visible with proper disabled states

### Changed
- **Sidebar Navigation**
  - Settings button moved to bottom of sidebar for better visual hierarchy
  - Removed empty Dashboard and Reports placeholder components

- **Code Quality**
  - Centralized `DEFAULT_CURRENCY` and `DEFAULT_LOCALE` constants, eliminating hardcoded "USD" and "en-US" strings
  - Removed redundant credit sale check from `get_available_credit` API — fetching existing credit no longer requires credit sale to be enabled
  - Removed duplicate return success message (was showing twice from both dialog and parent)

### Fixed
- **Returns & Refunds**
  - Use `net_rate` for accurate return refund calculation, properly accounting for coupon and invoice-level discounts
  - Display customer name and posting date in return dialog
  - Calculate effective rate for refunds including taxes and discounts — customers refunded exactly what they paid

- **Monetary Calculations**
  - Use `roundCurrency` consistently across all payment, return, edit, and draft dialogs
  - 3-decimal precision (`round3`) for rate calculations preventing floating-point rounding discrepancies
  - Backend uses `flt(..., 3)` for rate calculations matching frontend precision
  - Fixed decimal precision issues causing incorrect "PARTIAL PAYMENT" status on fully paid invoices

- **Write-Off Feature**
  - Implemented write-off for small remaining payment amounts with visual toggle UI
  - Centralized currency rounding using Frappe's `flt()` as single source of truth

- **Invoice History**
  - Integrated ReturnInvoiceDialog directly into InvoiceHistoryDialog (no nested modals)
  - Fixed pagination — "Load More" button now correctly appends results
  - Changed invoice sorting from creation date to modified date
  - Added `canCreateReturn()` check to hide return button for fully returned invoices

- **Barcode**
  - Handle absent barcode UOM price with proper conversion factor calculation
  - Cache calculated prices for consistency across barcode operations

- **DyPOS v15/v16 Compatibility**
  - Support both `post_change_gl_entries` field locations (Accounts Settings vs Singles table)
  - Support both v15 `make_gle_for_change_amount()` and v16 `get_gle_for_change_amount()` methods
  - Convert `get_stock_availability` from SQL string to Query Builder for Frappe 16

- **Shift Timer**
  - Fixed negative shift duration (-1 Hours -60 Minutes) caused by timezone mismatch between server and browser

- **Translations**
  - Added Arabic, Indonesian, and Portuguese translations for all new features

## [1.14.0] - 2026-01-25

### Added
- **Frappe 16 Compatibility**
  - Converted SQL queries to Query Builder for full Frappe 16 support
  - Updated item filtering conditions using Query Builder patterns
  - Replaced pypika date functions with frappe.utils for date filtering

- **Enhanced Barcode Support**
  - Added POS Barcode Rules DocType for configurable barcode parsing
  - Integrated barcode rules into POS Settings for centralized management
  - Implemented resolved barcode handling for weighted and priced items
  - Auto-select UOM based on single barcode presence
  - Enhanced barcode resolution with POS profile settings integration
  - Warehouse availability now supports barcode UOM conversion

- **Offline Mode Enhancements**
  - Added offline support for invoice history and unpaid invoices
  - Cache batch/serial data for offline selection
  - Enhanced Return Invoice dialog with offline support and optimizations
  - Eager variant caching with offline verification
  - Disable clear cache button when offline mode is active

- **Sales Person Management**
  - Enhanced sales person selection with validation and dropdown support
  - Keep dropdown open for multiple sales person selection

- **Permissions & Roles**
  - Added new roles and permissions for system and sales managers
  - Correct POS Settings permissions with create for managers
  - Moved DyPOS Cashier permissions from fixtures to DocType definitions

- **Payment Improvements**
  - Added exact amount mode for payment processing
  - Optimized payment queries for better performance
  - Added Arabic translations for payment dialog
  - Extract shared constants and add payment composables
  - Add toast queue system for better notification management

- **Localization**
  - Added Indonesian translations
  - Updated terminology and translations
  - Corrected CSV escaping and RTL toast positioning

- **POS Settings**
  - Added use_exact_amount field with validation

### Changed
- **Promotions UX**
  - Improved item selection UX with searchable dropdowns
  - Added clear all functionality for promotion items
  - Expanded template items to include variants in eligibility check

- **Code Quality**
  - Improved code quality with shared utilities and consistent patterns
  - Standardized pricing and submission functions across frontend and backend
  - Replaced console.warn with logger utility
  - Replaced silent exception handling with proper error logging

### Fixed
- **InvoiceCart**
  - Prevented event propagation on quantity buttons and input fields

- **Returns**
  - Use DyPOS make_sales_return for proper sales_team handling
  - Set update_outstanding_for_self=0 for proper credit note handling

- **Batch Display**
  - Show actual batch quantities instead of hardcoded 999

- **Offers**
  - Expanded template items to include variants in eligibility check

- **Permissions**
  - Preserve standard DyPOS role permissions in Custom DocPerm fixtures

- **Payment**
  - Added mutex protection to prevent duplicate invoice submissions

- **User Display**
  - Prevent undefined initials when name has trailing spaces

- **Localization**
  - Removed 'id' from default locales in get_allowed_locales_from_settings
  - Fixed RTL toast positioning

- **Info Toast**
  - Added info toast type for informational messages

### DevOps
- Added stale issue/PR automation workflow
- Added comprehensive issue templates
- Added .claude/settings.json to gitignore

## [1.13.0] - 2026-01-07

### Added
- **DyPOS Cashier Role & Permissions**
  - Created dedicated DyPOS Cashier role for POS operations
  - Added custom permissions for Customer, Bin, Item, and Warehouse doctypes
  - Proper role-based access control for POS users

- **Offline Invoice Sync Enhancement**
  - Added deduplication mechanism for offline invoice synchronization
  - Prevents duplicate invoice creation during sync recovery
  - Defensive type checks and mutex for concurrent sync operations

- **Return Invoice Improvements**
  - Added item search functionality in Return Invoice Dialog
  - Improved code quality and user experience for returns

- **Shift Closing Enhancement**
  - Return invoices now included in shift closing calculations
  - More accurate end-of-day reporting

### Changed
- **Offers & Promotions Optimization**
  - Optimized apply_offers with batch queries for better performance
  - Added dynamic debounce for offer application
  - Support for standalone pricing rules in apply_offers
  - Validate min_qty against eligible item quantity instead of total cart
  - Ensures offers fetched before processing in mobile view
  - Added offline support for promotions with mixed conditions

- **Cart & Payment Improvements**
  - Corrected subtotal display for tax-inclusive mode
  - Enhanced mobile responsiveness and dynamic sizing in PaymentDialog
  - Restored Hold Order button functionality

- **Internationalization**
  - Fixed translation API and added missing translations
  - Improved i18n coverage across the application

- **Build & Dependencies**
  - Updated frappe-ui imports to use proper exports
  - Improved build compatibility

### Fixed
- **Offers System**
  - Fixed min_qty validation to check eligible item quantity, not total cart
  - Fixed standalone pricing rules not being applied correctly
  - Fixed offers not being fetched before processing in mobile view

- **Cart Display**
  - Fixed subtotal display in tax-inclusive mode showing incorrect values

- **Offline Sync**
  - Added defensive type checks preventing sync errors
  - Added mutex to prevent concurrent sync race conditions

- **UI/UX**
  - Fixed Hold Order button missing from cart (regression fix)
  - Enhanced mobile responsiveness in PaymentDialog

## [1.12.0] - 2025-12-18

### Added
- **Wallet & Loyalty Program System**
  - Implement wallet functionality with loyalty points conversion
  - Auto-assignment of loyalty programs for new customers
  - Auto-assignment of loyalty program on sales invoice validation
  - Partial payment support for wallet/loyalty points redemption
  - Enable Loyalty Program as master switch in Wallet & Loyalty settings
  - Comprehensive technical documentation for Wallet System

- **Customer Search Enhancements**
  - Enhanced customer search with autocomplete functionality
  - Frequent customers display for quick selection
  - Optimized click handler for instant response on frequent customers

- **Sales Order Support in POS**
  - Sales order settings and store methods exposure
  - Delivery date selection integrated into payment flow
  - Delivery date dialogue for order scheduling
  - Dropdown menu for selecting between sales order and sales invoice

- **POS Profile Management**
  - Create, update, and delete POS profiles via API
  - Whitelist decorators for POS profile functions
  - Enforce user company association on profile creation
  - Enhanced parameter parsing for profile operations

- **Customer Management**
  - Edit customer functionality directly from cart

- **Payment Dialog Improvements**
  - Two-column layout redesign with invoice summary
  - Long-press payment with new composable
  - Dynamic sizing and responsive design adjustments
  - Enhanced credit balance and additional discount display
  - Improved mobile UX

- **Localization**
  - Configurable language settings
  - Brazilian Portuguese (pt-BR) support
  - RTL-friendly SelectInput component

- **Warehouse & Stock**
  - Loading state and improved stock availability logic in WarehouseAvailabilityDialog
  - Optimized bundle availability calculation across warehouses
  - Improved stock visibility and translation in warehouse dialogs

- **Draft Invoice Features**
  - Print button for draft invoices
  - Auto-save active cart when switching drafts

- **Coupon Management**
  - Validate coupon endpoint for gift cards
  - Enhanced customer selection in coupon management

- **Settings Organization**
  - Split POS Settings into organized tabs

### Changed
- **Cart Operations**
  - Refactored updateQuantity function to improve item removal logic
  - Improved UOM selection UI and cart item handling

- **POS Profile Handling**
  - User company check utility moved to DyPOS utilities
  - Refactored payment, user, item group, and customer group handling in profile update
  - Simplified profile creation with enhanced parameter parsing
  - Cleaned up imports in POS profile API

### Fixed
- **Offers & Promotions**
  - Race condition causing offers applied but cart not updating
  - Made offer processing more dynamic and robust
  - Enhanced offer management with automatic application and improved notifications

- **Stock Validation**
  - Fixed stock validation and double-add issue in ItemsSelector
  - Skip stock validation for non-stock items

- **RTL & Translation**
  - RTL alignment and translation in ShiftOpeningDialog
  - RTL overlap in OffersDialog badge positioning

- **Drafts**
  - Prevent draft deletion on load
  - Populate drafts store to show drafts in Invoice Management

- **Sales Order Compatibility**
  - Fixed 'SalesOrder' object attribute errors (outstanding_amount, is_return, payments)
  - Fixed "Value missing for Sales Order: Customer" error
  - Fixed ReferenceError issues (usePOSCartStore, cartStore not defined)
  - Fixed TypeError for NoneType multiplication with float
  - Fixed sales order submission on checkout

- **Payment Dialog RTL**
  - Improved RTL support and mobile responsiveness in PaymentDialog

## [1.11.0] - 2025-12-07

### Added
- **Multi-UOM Cart Support**
  - Support for adding same item with different Units of Measure (UOMs) to cart
  - Each UOM line is tracked independently with its own quantity and rate
  - Quantity input field in UOM selection dialog for faster item entry

- **Enhanced Stock Display**
  - Real-time available stock now subtracts cart quantities from displayed stock
  - Stock display accounts for conversion factors when using different UOMs
  - Defensive checks for stock reservation calculations

- **Stock Lookup Across Warehouses**
  - New stock lookup dialog for checking item availability across all warehouses
  - Variant selection support in warehouse availability dialog

- **Speed Enhancements**
  - Clear customer search input field on click for faster customer selection
  - Clear item search bar on click for faster item search
  - Improved search UX for high-volume POS operations

### Changed
- **Subtotal Calculation**
  - Fixed subtotal recalculation when UOM changes mid-transaction
  - Cache rebuild after UOM change ensures accurate totals

- **RTL/LTR Compatibility**
  - Fixed contradicting RTL patterns in InvoiceDetailDialog
  - Added text-start class for proper RTL text alignment in ReturnInvoiceDialog
  - Removed manual RTL overrides that prevented natural mirroring

- **Invoice Display**
  - Show actual paid amount instead of grand total in invoice confirmation
  - Enhanced InvoiceCart layout for improved alignment of financial summaries

### Fixed
- **Pay on Account & Partial Payment**
  - Improved Pay on Account and Partial Payment handling in returns
  - Fixed payment flow for credit sale returns

- **Cart Operations with UOM**
  - Remove item by UOM works correctly for multi-UOM carts
  - Update quantity targets correct item line with same item_code but different UOM
  - Quantity validation ensures positive integer values

- **Customer Selection**
  - Prevent auto-select when clearing customer search field

- **Arabic Translations**
  - Fixed truncated translation key for cart requirements message
  - Keep DyPOS brand name consistent across translations
  - Fixed "Apply Coupon" and "serials" translations for clarity

## [1.10.0] - 2025-11-28

### Added
- **Comprehensive Localization System**
  - Added locale management with Arabic translations for the entire POS application
  - Implemented LanguageSwitcher component integrated into POSHeader
  - User language change API with locale management in useLocale composable
  - Translation caching with IndexedDB for improved performance
  - Dynamic translation updates ensuring components re-render with selected language
  - Page reload mechanism to apply new translations consistently
  - Translation function calls added throughout the codebase for full i18n support

- **Sales Person Feature**
  - Implemented sales person selection and allocation in payment dialog
  - Sales person tracking in invoice processing for commission management

- **Enhanced Stock Validation**
  - Improved stock validation and item handling in cart and selection dialogs
  - Better error handling for stock-related operations

### Changed
- **RTL/LTR Support Improvements**
  - Enhanced RTL support for TextInput components with better layout alignment
  - Improved InvoiceDetailDialog RTL/mobile support with currency formatting
  - Standardized invoice status colors for both LTR and RTL layouts
  - Fixed RTL support for resizing behavior in POSSale component
  - Adjusted cache tooltip positioning and styling for RTL direction in POSHeader

- **Language Switcher UX**
  - Moved language switcher to user menu on mobile for a more compact header
  - Improved button and dropdown styles for better UI consistency

- **Serial Number Management**
  - Enhanced serial number management in POS for better tracking and selection

- **Layout and Spacing Improvements**
  - Refactored layout and spacing across UserMenu, POSHeader, ItemsSelector, and POSSale components
  - Improved overall UI consistency throughout the application

### Fixed
- **Dependency Updates**
  - Fixed frappe-ui dependency version format in package.json

- **POS Settings Configuration**
  - Removed problematic autoname field from POS settings configuration

- **Arabic Translations**
  - Updated Arabic translations for improved clarity and accuracy
  - Enhanced Arabic translations for invoices and item sorting functionality

## [1.9.0] - 2025-11-23

### Added
- **Country Code Selector for Customer Phone Numbers**
  - Added country code selector with flag icons for customer phone input
  - Visual country flag display for better user experience
  - Support for international phone number formats
- **Invoice Detail View**
  - Implemented comprehensive invoice detail view with proper API endpoints
  - Enhanced invoice information display and navigation
- **User Profile Management**
  - Added user profile image display in POS header
  - Implemented reactive user data management system
  - Real-time user information updates

### Changed
- **Print Functionality**
  - Updated print endpoint to use printview for better browser compatibility
  - Improved cross-browser printing experience
- **Node.js Version Update**
  - Updated Node.js version to 20 in CI workflow for better performance and security

### Fixed
- **Warehouse Availability Check**
  - Added warehouse availability check for out-of-stock items
  - Prevents selection of items not available in selected warehouse
- **Disabled Items Filtering**
  - Filter disabled items from Items Selector and search results
  - Only show active items available for sale
- **Customer API**
  - Fixed indentation in customer API for better code readability
  - Load all customers without hardcoded limit for better scalability
- **Return Invoice Dialog**
  - Enhanced return invoice dialog layout and status display
  - Adjusted dialog sizes for better UX across different screen sizes
  - Improved mobile responsiveness for return invoice dialog
- **Shift Dialog Navigation**
  - Navigate to POSSale when shift dialog is closed via X button
  - Better user flow when dismissing shift dialog
- **User Authentication Race Condition**
  - Resolved race condition where user appears as Guest after login
  - Fixed authentication state synchronization issues
- **Automatic Offer Validation**
  - Added automatic offer validation and removal when cart conditions change
  - Ensures promotional offers remain valid based on current cart state
- **Login Error Messages**
  - Show descriptive error message when inputting wrong credentials
  - Navigate to /pos when clicking cancel button of ShiftDialog

### Improved
- **Return Invoice UI**
  - Extracted payment icon utility for better code reusability
  - Improved return invoice UI consistency and styling
- **Cart UX Improvements**
  - **Customer Section:**
    - Added quick customer creation button next to search input
    - Large touch-friendly button (44px+) with user-plus icon
    - Improved search input with better sizing and rounded corners
    - Professional customer card design with gradient avatar
  - **Empty Cart Quick Actions:**
    - Implemented 2x3 grid with 6 action buttons
    - Quick access to: View Shift, Draft Invoices, Invoice History, Return Invoice, Close Shift, Create Customer
    - Icon backgrounds with subtle hover effects
    - Touch-friendly sizing meeting accessibility standards
  - **Cart Items Section:**
    - Relocated Offers & Coupon buttons to dedicated section below customer bar
    - Larger buttons with improved styling and badge visibility
    - Better spacing and padding throughout
  - **Action Buttons:**
    - Checkout and Hold Order now side-by-side (50/50 width)
    - Saves ~70px vertical space for more cart visibility
    - Consistent sizing and rounded styling
  - **Touch & Mobile Improvements:**
    - All buttons meet 44px+ minimum touch target
    - Increased padding and better text sizes
    - Consistent rounded styling and proper hover/active states

### Removed
- **POS Profile Feature Cleanup**
  - Removed create_pos_invoice_instead_of_sales_invoice feature from POS Profile
  - Simplified POS Profile configuration

## [1.8.0] - 2025-11-17

### Added
- **User-Controlled Sorting UI**
  - Added interactive sort dropdown with adjustments icon next to view controls
  - Toggle-based sorting: click to cycle between ascending/descending/none
  - Sort by name, quantity, item group, price, and item code
  - Visual feedback with active state icons and tooltips
  - Conditional sorting: only sorts when user explicitly triggers
  - Easy to extend with new sort fields
- **First/Last Page Navigation**
  - Added First/Last page navigation buttons to both grid and list views
  - First button (« on mobile) jumps to page 1
  - Last button (» on mobile) jumps to last page
  - Buttons disabled when already on first/last page

### Changed
- **Payment Methods Preloading**
  - Payment methods now always load at application startup
  - Ensures payment modes are available for offline mode
  - Removed conditional cache check that could skip loading
  - Added comprehensive logging for payment methods caching
  - Better offline reliability for payment processing

### Fixed
- **Payment Dialog UX Improvements**
  - Fixed payment amount increment step from 0.01 to 5 for better user experience
  - Changed increment applies to both payment entry inputs and custom amount fields
  - More logical increments for typical payment amounts
- **Payment Dialog Layout**
  - Fixed button alignment in payment dialog footer
  - All action buttons now appear on the same row
  - "Clear All" button positioned on left, action buttons on right
  - Improved visual consistency and professional appearance
- **Print Format Discount Display**
  - Fixed print format condition to handle negative discount_amount values
  - Changed condition from `> 0` to checking if discount exists
  - Added absolute value filter for correct display regardless of sign
  - Fixed issue where Frappe's print pipeline negates discount_amount causing display failure
- **Pagination Display Logic**
  - Fixed "All items loaded" message to only show on last page or when all items fit in one page
  - Previously showed incorrectly on first page
- **Browser Compatibility**
  - Fixed "crypto.randomUUID is not a function" error in POS Events Store
  - Implemented multi-tier UUID generation strategy for older browsers
  - RFC4122 v4 compliant fallback using Crypto API and Math.random()
  - Support for globalThis, window.crypto, and legacy environments

### Improved
- **Shift Closing Dialog Performance & Accessibility**
  - Fixed hideExpectedAmount reactivity bug using storeToRefs
  - Added comprehensive prop validation with type checking
  - Converted template function calls to computed properties for better performance
  - Extracted complex nested conditions to readable computed properties
  - Added ARIA labels for screen readers and keyboard navigation
  - Improved error handling with user-friendly messages and dismiss action
  - Added loading states and input validation
- **Item Sorting Implementation**
  - Refactored from 265 lines of repetitive code to 78 lines using v-for loop
  - 70% code reduction in dropdown implementation
  - Extracted sort configuration into SORT_OPTIONS and SORT_ICONS constants
  - O(n log n) sorting only on user action, not every render
  - Improved maintainability: new sort options require single array entry
- **Quantity-Based Sorting**
  - Items sorted by stock quantity in descending order (highest first)
  - Out-of-stock items automatically move to the bottom
  - Uses JavaScript's native Timsort algorithm for optimal performance
  - O(n log n) worst case, O(n) best case for nearly-sorted data
  - Performance: 100 items ~1ms, 500 items ~3ms, 1000 items ~5ms
  - Works for regular stock items and Product Bundles
- **Bundle Stock Display**
  - Show stock badge only for stock items and bundles
  - Display "N/A" for non-stock items in list view
  - Add bundle-specific UOM label in tooltips
  - Skip validation for batch/serial items (handled in dialog)
  - Differentiate error messages between bundles and regular items

## [1.7.1] - 2025-11-13

### Added
- **Workspace Reinstallation Migration**
  - Added migration hook to automatically reinstall workspace with latest configuration
  - Dynamic auto-discovery of all workspace JSON files in the workspace directory
  - Ensures workspace updates are applied during app upgrades
  - Comprehensive error handling and logging for workspace operations
- **Community Support Enhancement**
  - Added Telegram community link for real-time user communication and support
  - Reorganized Support & Community section in README for better visibility

### Fixed
- **Workspace Configuration**
  - Resolved workspace URL link validation error
  - Removed problematic Start POS URL link from workspace links section
  - URL links now properly supported only in shortcuts section

## [1.7.0] - 2025-11-11

### Added
- **Proactive Filter-Aware Caching with Real-time Sync**
  - Filter-aware caching strategy that checks POS Profile item group filters before loading
  - Fetches and caches ONLY items from filtered groups (90% reduction in data transfer)
  - Real-time cache synchronization via Socket.IO when POS Profile changes
  - Smart delta calculation for surgical cache updates (added/removed groups)
  - No manual cache clearing or page reload required
  - Transaction batching in offline worker (10x performance boost)
  - Query result caching with LRU eviction (5x faster repeated queries)
  - Index-optimized IndexedDB operations
  - Circuit breaker pattern for fault tolerance with exponential backoff retry
- **Free Items Support for Promotional Offers**
  - Added processFreeItems() to handle free item quantities from backend
  - Display free item badge (+X FREE) in cart UI
  - Include free items in total quantity count
  - Minimum quantity validation for offer eligibility
  - Reactive offer eligibility based on cart changes
- **Professional Documentation Enhancement**
  - Added 5 high-quality screenshots showcasing POS features
  - Created animated sales cycle GIF demonstrating complete workflow
  - Enhanced README with visual elements and comprehensive documentation

### Fixed
- **Item Group Filter and Toast Notifications**
  - Fixed empty items display when updating item group filters
  - Added forceServerFetch parameter to bypass cache and fetch fresh data
  - Migrated from frappe-ui toast to custom useToast composable
  - Reduced notification noise by removing low-value success notifications
  - Kept critical error and warning notifications only
- **IndexedDB and Caching Issues**
  - Fixed item_prices IndexedDB constraint violations
  - Added default "Standard" price_list for items missing one
  - Graceful error handling with individual record recovery
  - Fixed Dexie transaction API syntax

### Changed
- **Offers Module Refactoring**
  - Refactored offers.py with type hints and data classes
  - Removed unused coupon functions and pos_offer references
  - Fixed database column checks in promotions.py

## [1.6.1] - 2025-11-08

### Fixed
- **Tax-Inclusive Calculation**
  - Fixed issue where tax amounts were incorrectly shown as discounts in tax-inclusive mode
  - Frontend now sends correct gross amount (after discount, before tax extraction) to DyPOS
  - Proper tax calculation based on included_in_print_rate flag
  - Fixed both scenarios: items without discounts and items with discounts

## [1.6.0] - 2025-11-07

### Added
- **Overdue Invoice Status Support**
  - Added Overdue status filter with warning icon in Invoice Management
  - Overdue invoices now clearly identified with red styling
  - Separate filter button for quick access to overdue invoices
  - Added Overdue status to invoice filters component
- **Payment Source Audit Trail**
  - Payment history now shows source (POS vs Back Office) for better tracking
  - Differentiate between POS-created payments and back-office Payment Entries
  - Enhanced payment cards with color-coded source labels (blue for Back Office)
  - Added posting date to payment history for complete audit trail

### Changed
- **Time and Date Formatting**
  - Improved time formatting to handle both Date objects and time strings (HH:MM:SS format)
  - Standardized date format to DD/MM/YY across all invoice displays
  - Enhanced `formatTime()` composable with better string parsing
  - Added comprehensive JSDoc documentation for formatter functions
- **Status Display Refactoring**
  - Consolidated status display with reusable helper functions (`getStatusLabel`, `getStatusClass`)
  - Consistent status styling across all invoice components
  - Status labels now use proper terminology ("Partially Paid" instead of "Partly Paid")

### Improved
- **Backend Performance & Architecture (partial_payments.py)**
  - **Critical N+1 Query Fix**: Reduced payment history queries from O(n) to O(1) using batch fetching
  - **48x Performance Improvement**: Optimized invoice list loading with batch queries
  - Added company filter to Payment Ledger queries for multi-company performance (10-100x faster)
  - Implemented optional metadata fetching for 2x faster dashboard views
  - SQL queries now use COALESCE for NULL safety and proper aggregation
- **Security & Validation**
  - Comprehensive input validation on all API endpoints
  - POS Profile and Mode of Payment existence validation
  - String length limits to prevent DoS attacks
  - Query limit caps to prevent resource exhaustion (max 500 invoices)
  - Payment account validation before Payment Entry creation
- **Business Logic Validations**
  - Payment date cannot be before invoice date
  - Invoice state validation (submitted, not cancelled)
  - Total payment amount validation across multiple payments
  - Currency consistency checks
  - Amount tolerance for floating-point comparisons (0.01)
- **Error Handling & Reliability**
  - Transactional rollback for atomic payment operations
  - Automatic cancellation of partially-created payments on failure
  - Structured error logging with full context for debugging
  - Graceful degradation when payment metadata unavailable
  - Missing Payment Entry detection and logging
- **Code Quality & Maintainability**
  - Added constants and Enum for configuration (PaymentSource, AMOUNT_TOLERANCE, limits)
  - Comprehensive documentation with docstrings for all functions
  - Full type hints throughout Python API (typing.Dict, List, Optional)
  - Inline comments explaining business logic and DyPOS concepts
  - Performance notes for critical operations
  - Usage examples in docstrings

### Technical Details
- Payment Ledger now used as single source of truth for all payment tracking
- Batch fetching eliminates N+1 query problem in `get_payment_history()`
- Added `include_metadata` parameter for performance optimization
- Error recovery with automatic rollback on Payment Entry creation failure
- Module docstring with architecture explanation and best practices

### Performance Metrics
- Payment history for invoice with 10 payments: 21 queries → 3 queries (7x faster)
- Load 50 partial invoices: 2,550+ queries → 53 queries (48x faster)
- Summary statistics: O(n) → O(1) (constant time)
- Multi-company Payment Ledger query: 100x+ faster with proper indexing

## [1.5.0] - 2025-11-06

### Added
- **Default Customer Auto-Loading**
  - New `get_default_customer` API endpoint in POS Profile
  - Automatically loads default customer when POS opens if configured in POS Profile
  - Customer appears in cart immediately without manual selection
  - Maintains proper customer object structure matching manual selection

### Fixed
- **Original Price Display in Receipts and UI**
  - Fixed discount handling to preserve original `price_list_rate` in both UI and created invoices
  - Receipts now clearly show: quantity × original price = subtotal, then discount line, then final total
  - Backend receives correct net rate for accurate invoice totals
  - Print format updated to 80mm thermal receipt size instead of A4
  - Discount percentages now display with 2 decimal precision (was showing many decimal places)
  - Added comprehensive JSDoc documentation for pricing and discount calculation logic

### Changed
- **Dependency Version Pinning**
  - Pinned Vue version to exact 3.5.13 (removed caret) for better stability and reproducible builds

### Improved
- **Edit Item Dialog Decimal Quantity Support**
  - Quantity field now accepts decimal values (e.g., 0.5, 1.25, 2.75) matching cart behavior
  - Added smart step increment/decrement based on current quantity value
  - Improved input handling allowing free editing with validation only on blur
  - Supports very small quantities down to 0.0001
  - Added mobile-friendly decimal keyboard input mode
- **Currency Formatting in Edit Item Dialog**
  - Replaced raw currency codes (SAR, EGP, etc.) with proper currency symbols
  - All amounts now use consistent formatCurrency utility across the dialog
  - Rate field prefix displays currency symbol instead of code
  - Subtotal, discount, and total now properly formatted with locale support

## [1.4.0] - 2025-11-06

### Fixed
- **Item Query Function Whitelisting**
  - Fixed "Function not whitelisted" error when adding Tax Rules
  - Added `@frappe.whitelist()` decorator to `item_query` function
  - Parse JSON filters parameter when called from frontend
  - Remove mandatory company validation to allow global items
  - Set `custom_company` to empty string for new items without company
  - Fix demo data setup which creates items without company
  - Enabled global item selection across POS profiles
- **Mobile UI Layout**
  - Make footer fixed at bottom to prevent scrolling issues on mobile
  - Add responsive column widths to list view for better mobile experience
  - Fix vertical scrolling in ItemsSelector with proper min-height constraints
  - Move status messages inside table rows to span full width
  - Adjust floating cart button position to sit above fixed footer
  - Optimize column sizing: mobile (120px name, 70px rate/qty), tablet (180px), desktop (200px)

## [1.3.0] - 2025-11-05

### Added
- **BrainWise Branding API**
  - Implemented secure branding configuration API with validation
  - Centralized branding management system
- **POS Profile Custom Fields**
  - Added "Cash Mode of Payment" field to specify default cash payment method
  - Added "Block Sale Beyond Available Qty" field for stock control
  - Added "Allow Delete Draft Invoices" field for draft management permissions
- **Saudi Riyal Font Support**
  - Updated CSS to properly render Saudi Riyal currency symbol (ر.س)
  - Improved font rendering for Arabic text

## [1.2.0] - 2025-11-04

### Added
- **CSRF Token Synchronization**
  - Implemented CSRF token sync with offline worker for enhanced security
  - Ensures secure API calls from background workers
- **DyPOS Workspace Configuration**
  - Added workspace links for enhanced navigation
  - Improved accessibility to POS features

### Changed
- **Project Documentation**
  - Updated project references for clarity and consistency
  - Improved inline documentation across codebase

### Fixed
- **Cart Data Processing**
  - Use `toRaw()` to prevent stale cached quantities in invoice data
  - Ensures fresh data is always used in calculations
- **Header Layout**
  - Removed `overflow-x-hidden` class from POSHeader for improved responsiveness

## [1.1.1] - 2025-10-29

### Added
- **Payment Dialog: Customer Credit/Outstanding Balance Display**
  - Real-time customer balance display with color-coded indicators
  - Green indicator for available credit
  - Red indicator for outstanding balance (amount owed)
  - Gray indicator for zero balance
  - Comprehensive balance information showing total outstanding, total credit, and net position
- **New API Endpoint: `get_customer_balance`**
  - Returns detailed customer balance including total outstanding, total credit, and net balance
  - Calculates from Sales Invoices and Payment Entries
  - Supports company-specific filtering
- **Payment Dialog: Dynamic Button States**
  - "Pay on Account" button automatically disables when payment entries are added
  - Button re-enables when all payments are removed
  - Prevents mixing regular payments with credit sales

### Changed
- **Payment Dialog Layout Reorganization**
  - Information section moved to top (payment summary, customer credit, discount, payment breakdown)
  - All payment action buttons consolidated at bottom
  - Clear visual separation between information and actions
  - "Pay on Account" button matches "Complete Payment" button styling
  - Button color scheme changed to warm orange tones (orange-600 enabled, orange-400 disabled)
- **Customer Credit Display**
  - Now fetches both available credit sources and overall balance
  - Shows comprehensive credit position instead of just available credit
  - Displays appropriate message based on balance status
- Payment action buttons positioned in dialog footer for better UX

### Fixed
- **Critical: Double discount bug** - Discounts were being applied twice (once in item rate, once in total calculation)
  - Frontend now correctly uses `price_list_rate` for subtotal calculations
  - Backend reverse-calculates `price_list_rate` from discounted rate to prevent double application
  - Example: Item with 10% discount now correctly shows 90.00 instead of 81.00
- **Customer credit not displaying correctly** - Credit was only showing available credit, not outstanding balance
- **"Disable Rounded Total" setting not working** - Backend was checking POS Profile instead of POS Settings
- **ReferenceError: couponCode is not defined** - Fixed undefined couponCode error in posCart.js when re-applying offers
  - Changed reference from non-existent `couponCode.value` to `appliedCoupon.value?.name`
- Subtotal calculation now uses original price before discount (fixes display inconsistency)
- "Pay on Account" button styling now matches other action buttons

### Improved
- Improved discount calculation logic with comprehensive documentation
- Added validation to prevent invalid discount percentages (now clamped to 0-100%)
- Enhanced error handling for rounding setting retrieval
- Added data integrity checks (price_list_rate must be >= rate)
- Added detailed inline documentation for discount calculation flow
- Code cleanup with better comments explaining critical logic
- Separated discount calculation into clearly documented sections
- Payment dialog now provides clearer visual feedback for button states

## [1.1.0] - 2025-10-28

### Added
- Real-time settings updates without page reload using Pinia event system
- Event-driven architecture for settings changes (pricing, sales operations, display)
- Missing fields to POS Settings DocType: `allow_user_to_edit_item_discount` and `disable_rounded_total`
- Settings event listeners in POSSale component for immediate UI updates
- Display settings change detection and event emission
- Toast notifications for settings changes to provide user feedback
- Comprehensive CHANGELOG.md following Keep a Changelog format

### Changed
- Settings now update immediately in all components without requiring page refresh
- POS Settings store now includes `reloadSettings()` method for forced refresh
- Event detection system now includes all pricing and display fields

### Fixed
- "Allow Item Discount" setting not persisting to database
- "Disable Rounded Total" setting not persisting to database
- Settings reverting to defaults after page refresh

## [1.0.2] - 2025-10-28

### Added
- App version display in POS header with enhanced styling
- UOM pricing logic with conversion factor support

### Changed
- Enhanced POS header to display current application version
- Updated UOM pricing calculations to account for conversion factors

## [1.0.1] - 2025-10-27

### Added
- Invoice filtering logic and store management
- Partial Payments feature in POS
- Stock validation and event-driven settings management
- Word-order independent search for cached items
- Referral code management with validation and coupon generation
- Fuzzy word-order independent item search
- Periodic stock sync functionality
- Performance optimizations for low-end devices
- Developer tooling for debugging

### Changed
- Improved search functionality with fuzzy matching and relevance scoring
- Enhanced offline mode and UI responsiveness
- Optimized ItemsSelector component for better performance
- Improved list view functionality

### Fixed
- Stock badge synchronization issue
- Stock reservations preservation during refresh
- Warehouse change detection
- Logger.success error in Web Worker context
- High-priority performance and memory issues

## [1.0.0] - Initial Release

### Added
- Core POS functionality
- Offline mode support
- Invoice management
- Customer management
- Item search and selection
- Payment processing
- Shift management
- Stock tracking

[Unreleased]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.15.0...HEAD
[1.15.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/BrainWise-DEV/DyPOS/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/BrainWise-DEV/DyPOS/releases/tag/v1.0.0
