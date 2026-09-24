# Security Policy

> ملخص عربي: نرحب بالتبليغ الخاص عن الثغرات عبر GitHub Security Advisories. لا تختبروا أنظمة الإنتاج بعدوانية، وسنرد خلال 72 ساعة. التفاصيل والقواعد أدناه بالإنجليزية (لغة مجتمع الأمن العالمي).

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.36.x  | :white_check_mark: |
| < 1.36  | :x:                |

Only the latest release line (currently `1.36.x`, single-sourced in root
`package.json` + `POS/package.json` + `server/package.json` +
`server/lib/version.js`) receives security fixes. The live production build
is https://dypos.smartportssoft.com/.

## Reporting a Vulnerability

**Use GitHub → Security → "Report a vulnerability" (private).** Do not open
public issues for suspected vulnerabilities.

- Response SLA: initial triage within **72 hours**.
- Please include: affected version/commit, reproduction steps, impact, and
  (optionally) a suggested fix or PoC.
- We follow **coordinated disclosure**: fixes ship first (usually within 14
  days for High/Critical), public details after the live site is patched.

### Rules of engagement

- :white_check_mark: Testing against **your own local/dev** deployment.
- :x: No aggressive testing against production
  (`dypos.smartportssoft.com`): no brute-force beyond a handful of attempts,
  no DoS/load testing (there is a dedicated k6 nightly pipeline), no data
  exfiltration beyond proving access (stop at the first record).
- :x: No social engineering, phishing, or physical attacks.

### Safe harbor

Good-faith research that follows the rules above will not result in legal
action. If you are unsure whether an action is in scope, ask first via a
private advisory draft.

## Security Controls (what we already enforce)

- **Auth**: async bcrypt, per-username lockout (5 fails/15 min → 429 +
  `Retry-After`), per-IP spray limiter shared by `/api/auth/login` and the
  Frappe-compat `/api/method` login paths, JWT rotation, `must_change_password`.
- **Tenant isolation**: fail-closed row-level scoping on every list and
  by-id read/write (`X-Tenant-Id` spoofing → 403, foreign rows → 404).
- **Secrets**: `password_hash` is never selectable via `frappe.client.*`
  (safe-column allowlists + response redaction, covered by regression tests);
  QZ private keys live under gitignored `server/uploads/qz/` (0600).
- **Money safety**: halala-integer ledger math, idempotent invoice/return/
  wallet operations, fiscal-year immutability, tamper-evident audit ledger.
- **Headers**: Helmet + strict CSP, `trust proxy` default-off (no
  `X-Forwarded-For` spoofing of rate limiters), `/api/metrics` default-deny
  in production.
- **Supply chain**: `npm audit --audit-level=high` gates in CI, Dependabot
  active, reproducible installs (`npm ci` / lockfiles).

## Accepted Risks (reviewed, time-boxed)

| Risk | Why accepted | Revisit |
| ---- | ------------ | ------- |
| `echarts` moderate XSS nested in `frappe-ui` | **Not shipped**: absent from the production bundle (tree-shaken — verified by grepping built assets, 2026-09-24). Fix requires a breaking `frappe-ui` downgrade. | Each `frappe-ui` bump |
| CSP `style-src 'unsafe-inline'` | Vue build constraint (see `server.js` TODO); compensated by strict rest of policy + no user HTML sinks (escaped highlights). | Hash/nonce migration |
| Live-verify step is `continue-on-error` | Avoids blocking good deploys on edge-propagation delay; failures still alert as warnings. | If flakiness budget exceeded |

## Out of Scope

- Third-party hosted dependencies' own infrastructure (Cloudflare, GitHub).
- `legacy/` code (not shipped), dev-only tooling, social engineering.
- Reports already covered by the accepted-risks table above without new
  exploitability evidence.
