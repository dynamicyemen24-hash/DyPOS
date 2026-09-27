# Cloud / Edge Report (evidence, 2026-09-18)

## DNS
- dypos.smartportssoft.com → 172.67.192.4, 104.21.20.87 (Cloudflare anycast; origin hidden)

## Live pos.html response
- Status 200, 4302 bytes, TTFB ~4.5s (single sample, cold)
- `CF-Cache-Status: DYNAMIC`, `Age: 416454` (~4.8d), `Cache-Control: public, s-maxage=604800`
- `Server: cloudflare`; ETag/Last-Modified absent
- Interpretation: edge pass-through (DYNAMIC) + stale upstream copy (Age) + 7-day s-maxage policy

## Live security headers (static)
- HSTS: ABSENT | CSP: ABSENT | X-Frame-Options: ABSENT
- X-Content-Type-Options: nosniff | Referrer-Policy: strict-origin-when-cross-origin
- Local node backend HAS full headers — gap is origin static-file serving, not app code

## Purge capability from here
- NONE: no CF_TOKEN, no ZoneId on this machine; cf-purge.ps1 fixed this session but unrunnable without secrets
- Required: dashboard Purge Everything (or file purge pos.html + assets/* + sw.js)

## Public API surface
- https://dypos.smartportssoft.com/api/health → 404 (API is origin-local by design; not a failure per §28)
