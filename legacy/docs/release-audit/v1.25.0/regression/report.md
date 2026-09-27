# Regression Report (2026-09-18 ~22:36 local)

## Existing suites
- Server: `npm test` → 170 tests / 77 suites, pass 170, fail 0 (incl. 7 sync-gaps, version drift, stock-guard, scale1-9)
- Frontend: `npx vitest run` → 24 files, 354 tests, pass 354, fail 0 (incl. syncCore, offlineStore, chunkedSync, arabic, errorBoundary)
- `npm run parity` → ok:true (39 sqlite / 34 pg tables, 0 missing)
- `scripts/doctor.mjs` → all checks ok (migrations, integrity, outbox 0, disk 32 GB)
- `npm audit --omit=dev` → 0 vulnerabilities

## Release-specific tests added (v1.25.0)
- tests/sync-gaps.test.js (7): tenant pull isolation, unknown-tenant 404, push replay dedupe, cashier push 403, device self-register + tenant list filter, revoke→423→revive, invalid deviceId 400

## Backup / rollback
- Fresh backup dypos-2026-09-18T18-32-33.db (512 KB, integrity ok) + verify-restore green
- Rollback: tags v1.22.0→v1.25.0; additive-only migrations; staged restore keeps pre-restore copy
- Skipped: 0. Failures: 0.
