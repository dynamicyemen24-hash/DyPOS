# DyPOS Deployment Guide — dypos.smartportssoft.com

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
- **Version:** `1.17.0`
- **Build:** `1.17.0`
- **Date:** September 16, 2026
- **Framework:** Vue 3 + Chart.js + frappe-ui
- **PWA:** Yes (Offline support, manifest, service worker)
- **Package:** `dist-deploy/pos-package-1.17.0.zip` (71 files, Jinja 0, ?v=1.17.0 cache-busted)
- **Tests:** 343/343 passed (POS) + 9/9 (server) — build + lint clean
