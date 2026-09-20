# DyPOS Deployment Guide — dypos.smartportssoft.com

## 🚀 النشر الآلي (المسار الافتراضي — أي دفع إلى `main` يصل للعملاء)

خط الأنابيب: `.github/workflows/deploy-cloudflare.yml`

```
push إلى main (أو تشغيل يدوي)
   → yarn install (POS)
   → npm run verify            (بوابة الجودة: اختبارات + noConsole)
   → yarn build                (مثبّت على إصدار package.json — لا طوابع زمنية)
   → node scripts/build-pages-site.mjs   (تجميع موقع Pages: إزالة Jinja + ?v= + SW root scope + 404)
   → wrangler pages deploy     (Cloudflare Pages، مشروع CF_PAGES_PROJECT أو dypos-pos)
   → تحقق حي: version.json + pos.html على dypos.smartportssoft.com
```

### مطلوب مرة واحدة (أنت فقط — التوكن لا يُكتب في المستودع أبدًا)
```bash
gh secret set CLOUDFLARE_API_TOKEN     # توكن Cloudflare بصلاحية Cloudflare Pages: Edit
gh secret set CLOUDFLARE_ACCOUNT_ID    # Account ID من لوحة Cloudflare (Overview)
# اختياري:
gh secret set CF_ZONE_ID               # Zone ID لتنقية كاش إجبارية بعد كل نشر
gh variable set CF_PAGES_PROJECT --body dypos-pos   # إن كان اسم المشروع مختلفًا
```

### ملاحظتا تحقق مهمتان
1. **بعد أول نشر آلي**: إذا نجحت خطوة النشر لكن فشل «Live verify»، فالنطاق
   `dypos.smartportssoft.com` مرتبط بمشروع/مصدر آخر. الحل: لوحة Cloudflare →
   Workers & Pages → `dypos-pos` → Custom domains → أضف
   `dypos.smartportssoft.com` (وأزل الربط من المشروع الذي يحمله الآن —
   الجذر الحالي يخدم موقع Dycos التعريفي).
2. نشر Pages يستبدل محتوى المشروع بالكامل: صفحة الجذر على هذا النطاق ستصبح
   تطبيق DyPOS نفسه (`/` و`/pos.html` كلاهما يعمل)، وصفحة Dycos التعريفية
   تبقى على نطاقها `dycos.smartportssoft.com` (route في `wrangler.toml` الخاص بها).

### تشغيل يدوي
```bash
gh workflow run deploy-cloudflare.yml          # من أي مكان
gh run watch                                    # أو: gh run list --workflow=deploy-cloudflare.yml
```

### نشر محلي بديل (Pages بدون CI)
```bash
yarn --cwd POS build && DyPOS_BUILD_VERSION=$(node -p "require('./package.json').version")
node scripts/build-pages-site.mjs
npx wrangler@3 pages deploy .pages-site --project-name dypos-pos --branch main
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

## Version Info
- **Version:** `1.18.0`
- **Build:** `1.18.0`
- **Date:** September 16, 2026
- **Framework:** Vue 3 + Chart.js + frappe-ui
- **PWA:** Yes (Offline support, manifest, service worker)
- **Package:** `dist-deploy/pos-package-1.18.0.zip` (71 files, Jinja 0, ?v=1.18.0 cache-busted)
- **Bundle:** `assets/DyPOS/pos/assets/index-BhIo9O6U.js` (571KB) — replaces stale live `index-BtwtUPYI.js`
- **Fix:** live `pos.html` was serving raw Jinja (`{% for key in boot %}`) with no
  cache-busting — this package strips Jinja and adds `?v=1.18.0`
- **Tests:** 343/343 passed (POS) + 17/17 (server) — build clean, package smoke-tested locally
- **Deploy:** copy package to ORIGIN → run `ORIGIN-DEPLOY.bat` as Admin →
  verify `LOCAL BUILD 1.18.0 OK` + `LIVE VERSION 1.18.0 OK` + bundle `200` + CSP OK →
  purge Cloudflare cache (Everything, or the 3 URLs: `pos.html`, `assets/DyPOS/pos/*`, `sw.js`)
