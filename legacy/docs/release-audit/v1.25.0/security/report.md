# Security Report (evidence, 2026-09-18)

## Transport — PARTIAL
- Local API: CSP + HSTS-preload + nosniff + SAMEORIGIN + no-referrer (verified headers)
- Live static: CSP/HSTS/frame-ancestors ABSENT (HIGH finding; origin web.config/IIS)
- HTTPS enforced (upgrade-insecure-requests; Always HTTPS per deploy guide)

## Authentication — PASS (local)
- bcrypt-12; JWT + jti revocation checked per request; brute-force 8/15min lockout
- Wrong-user login → 401; no-token → 401; evil Origin blocked; prod Origin allowed with ACAO
- Session revocation paths: logout/logout-all/password-change/admin-disable (tested in scale suites)

## Authorization — PASS (test evidence)
- Cashier push→403, device revoke→403, RBAC on stock adjust/product delete/sync push (tested)

## Tenant isolation — PASS (test evidence)
- assertTenantScope/resolveTenantFilter/assertRecordTenant (404, not 403); v16 sync_log + devices scoped (tested)

## Secrets — PASS
- No .env/.pem/.key tracked; server/.env gitignored (96-char generated secret, undisclosed)
- Test passwords are ephemeral fixtures only; production JWT never logged

## HIGH finding (do not fix from here — needs origin-local action)
- Live DB backup (2026-09-18T18-32-33) counts show **users: 0** → first-come ADMIN bootstrap is OPEN on the live database. Remediation: create the admin account immediately via origin-local access and restrict network access until then. (Startup guard also warns this.)

## Findings NOT fixed (deferred by customer/design)
- IndexedDB/localStorage unencrypted at rest → opt-in AES-GCM plan (docs/ENCRYPTION_ADVANCED.md)
- Dependency majors (express 4→5, zod 3→4…) deferred to dedicated window; audit 0 vulns
