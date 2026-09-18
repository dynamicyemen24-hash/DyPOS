# Performance Report (measured 2026-09-18, build machine + local backend)

## API (127.0.0.1:3001, warm, 3 samples each)
- GET /api/ready: 96 / 19 / 18 ms (first = cold)
- GET /api/health: 19 / 18 / 18 ms
- GET /api/openapi.json: 37 / 36 / 38 ms
- Note: `localhost` hostname adds seconds on this host (IPv6 fallback); 127.0.0.1 is truth. Production uses relative URLs + domain — unaffected.

## Bundle (package)
- JS: 35 files / 1451 KB | CSS: 9 files / 352 KB | precache: 73 entries (4295.85 KiB)
- Largest chunks route-split: vendor-frappe 281 KB, vendor-charts 191 KB (dashboards only), vendor-print 118 KB (on demand)
- Routes lazy-loaded; lists virtualized (content-visibility); heavy IndexedDB in Web Worker

## Live page
- pos.html TTFB ~4.5s single cold sample (stale 4.3 KB old build; NOT representative of new bundle)
- Cached load / LCP / INP / CLS: NOT VERIFIED (no browser automation; old live bundle anyway)

## Sync throughput (prior campaign evidence, unchanged code path)
- Burst ~463 rps p95 ~122 ms; soak 1849 invoices p95 36 ms, 0 errors (see CHANGELOG v1.5.0 campaign)

## Budgets
- No regression introduced (no frontend change since 2.4.0 build; backend +2 endpoints, indexed)
