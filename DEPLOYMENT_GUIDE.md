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

> **مسار Pages القديم مهجور:** التوكن الحالي يملك `Workers Scripts` فقط وليس `Pages:Edit`.
> النشر يتم كـ Worker بأصول ثابتة (`wrangler.toml` + `worker.js`).

### مطلوب مرة واحدة (أنت فقط — التوكن لا يُكتب في المستودع أبدًا)
```bash
gh secret set CLOUDFLARE_API_TOKEN     # توكن: Workers Scripts Edit (بدون قيود IP)
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

## النشر اليدوي القديم (IIS + خادم أصل)

## Deployment Directory
- **Source (build output):** `D:\SulationDy\DyPOS\DyPOS\public\pos\`
- **IIS Web Root:** `C:\inetpub\wwwroot\`
- **Entry Point:** `C:\inetpub\wwwroot\pos.html`

## Quick Deploy (Run as Administrator)
```cmd
cd D:\SulationDy\DyPOS\scripts
deploy_dypos.bat
iisreset /restart
```

## Cloudflare DNS Configuration

1. Go to **https://dash.cloudflare.com/ce1007ca229319e79c9305f0b954536a/smartportssoft.com/dns/records**

2. Add/verify the following DNS records:

| Type | Name | Value | TTL | Proxy |
|------|------|-------|-----|-------|
| A | @ | [Server IP] | Auto | Proxied |
| A | www | [Server IP] | Auto | Proxied |
| CNAME | dypos | @ | Auto | Proxied |
| TXT | @ | v=spf1 include:_spf.google.com ~all | Auto | DNS only |

3. **SSL/TLS Setting:** Full (Strict)
4. **Always Use HTTPS:** On
5. **Clear Cache:** Purge Everything

## IIS Configuration

1. Open **IIS Manager**
2. Select the site for `dypos.smartportssoft.com`
3. Set **Physical Path:** `C:\inetpub\wwwroot`
4. Set **Default Document:** `pos.html`
5. Enable **Static Content** feature
6. Set **Application Pool:** .NET CLR v4.0 or No Managed Code
7. Restart: `iisreset /restart`

## Build Commands
```cmd
cd D:\SulationDy\DyPOS\POS
yarn build
# Then run deploy_dypos.bat
```

## Verification
After deployment, verify:
- https://dypos.smartportssoft.com/pos.html loads
- https://dypos.smartportssoft.com/assets/DyPOS/pos/ loads (JS/CSS)
- PWA manifest at https://dypos.smartportssoft.com/manifest.json
- Service Worker at https://dypos.smartportssoft.com/sw.js
- Arabic RTL support works

## Version Info (حالي)
- **Version:** `1.36.0` (single source: root `package.json`)
- **Date:** September 24, 2026
- **Framework:** Vue 3 + Chart.js + frappe-ui
- **PWA:** Yes (SW root scope via Worker assets)
- **Deploy:** push to `main` → GitHub Actions → `wrangler deploy` → live verify
- **Live:** `https://dypos.smartportssoft.com/` serves Worker `dypos-pos`
  (bundle hash changes every build; verified by `?v=1.36.0` + `version.json`)
- **Tests:** server 334/334 · POS quality gate green · biome 0 errors · pg parity OK
