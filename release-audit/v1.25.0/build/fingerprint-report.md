# Build Fingerprint Report — v1.25.0 (evidence, 2026-09-18)

## Git
- HEAD: `aad8241` (tree clean; `dypos.db`/dist artifacts untracked by design)
- Tags: v1.22.0 v1.23.0 v1.24.0 v1.24.1 v1.25.0
- version.js: `1.25.0` (drift-tested against package.json, /health, /ready, /openapi.json)

## Distribution package
- File: `dist-deploy\pos-package-1789755516183.zip`
- Size: 3,198,094 bytes | Entries: 77
- SHA256: `B03AA9BA15E304199402AD2F54E4FDA018CBCDCFD827F9C8D2C5A25DC2021A53`
- pos.html SHA256: `371ED39C971D9CD50194BE28759B0DD32A7D931A67DBFC91F9D408385F7D1757`
- Jinja blocks: 0 | RTL: `dir="rtl" lang="ar"` present

## Fingerprint chain (expected)
- HTML → `assets/index-GX5TJFHV.js` (in pos.html)
- Graph → `index-GX5TJFHV.js` dynamically imports `Login-CxAgIXQQ.js` (verified via string ref)
- SW → precache contains index-GX5TJFHV.js AND Login-CxAgIXQQ.js (verified)
- Manifest → name=DyPOS, display=standalone, scope=/assets/DyPOS/pos/, 3 icons
- version.json → build timestamp 2026-09-18T18:18:49Z

## Live comparison (https://dypos.smartportssoft.com/pos.html)
- Live index: `assets/index-BtwtUPYI.js` ≠ expected → MISMATCH
- Live Login: no Login-*.js reference
- Live Jinja: `{%` present → ancient build
- Verdict: LIVE ≠ PACKAGE → release gate FAIL (fingerprint)
