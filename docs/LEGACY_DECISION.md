# Decision Record: `legacy/pos_next` Is an Asset Mine, Not a Resurrection Target

- **Status:** Accepted
- **Date:** 2026-09-26
- **Scope:** The future of `legacy/pos_next/` (467 tracked files) and the ZATCA implementation strategy
- **Supersedes:** the implicit assumption that `legacy/` is dead code safe to delete

## Context

`legacy/pos_next/` contains a **complete, far richer application** than the active
`POS/`:

| Area | `legacy/pos_next` | Active `POS/` (product) |
|---|---|---|
| Framework | React 18 + TS | **Vue 3 + Pinia** |
| Backend | tRPC + Drizzle (40 KB schema) + full dyposapp (`pos_next/`) | Express + method router, SQLite |
| Domain assets | ~25 doctypes, 5 reports, print formats, wallet, coupons, offers, referrals | not present |
| Translations | `ar.csv` 101 KB, `id.csv`, `pt-br.csv` | partial |
| ZATCA | `ZatcaIntegration.tsx`, `zatca-security.ts` (877 + 404 lines) | none |
| Tests | `test-runner.js`, 3 suites | 52 verify files, 379 backend tests |
| Status | React code + dyposdoctypes; no build in CI | **built, deployed, CI-gated** |

The directory is named `legacy` but is **not gitignored and was last modified by
release commit `455b64b` (v1.33.0)**. So its status is genuinely ambiguous and
had to be decided explicitly rather than by assumption.

## Decision

**The active Vue 3 `POS/` remains the product. `legacy/pos_next` is retained as a
read-only reference and requirements source. No code is ported from its
React/dyposlayers. ZATCA is rebuilt from the official specification in the
active Vue + SQLite stack.**

### Rationale

1. **The repo already decided this.** `POS_MIGRATION_PLAN.md` is titled
   *"POS Awesome to DyPOS Migration Plan"* and defines the legacy app as the
   **source** and Vue 3 as the **target**, with the explicit goal of
   *"feature parity with improved architecture"*. Resurrecting the legacy tree
   would reverse a documented, deliberate migration.
2. **All the safety infrastructure is already on the active tree.** The
   invariants in `AGENTS.md` — tenant fail-closed scoping, `lib/money.js`
   minor units, no credential leaks, single-source invoice math, DDL parity —
   are implemented and tested there. Porting to the legacy tree discards them.
3. **The legacy ZATCA and security code is actively dangerous** (see below).
   Its own headers claim ZATCA Phase 2 compliance; that claim is false.
4. **The legacy half is Frappe-dependent.** `pos_next/` doctypes and the built
   React bundle call `dypos.client.get_list` and `DyPOS.api.*`. The product
   requirement is that dyposmust not be a runtime dependency, so that half is
   not a viable foundation.
5. **Regression risk.** Switching the framework of a deployed, gated POS to an
   unproven build is not an efficient path to a reliable system.

### What *is* worth taking from `legacy/`

Assets are extracted as **documentation/requirements, not code**:

| Asset | How it is used |
|---|---|
| The 9 ZATCA QR tags (`ZatcaIntegration.tsx` + `test-runner.js`) | field checklist when building the real QR |
| `translations/{ar,id,pt-br}.csv` | translation source for the new locale pipeline |
| 5 report definitions in `pos_next/report/` | report requirements/specs |
| ~25 doctype JSONs | domain model reference for local SQLite schema |
| `pos_next/print_format/` | receipt/EOD layout reference |

## The broken primitives that must never be mined

Both files now carry a `⛔ QUARANTINED` header. The specific defects:

**`legacy/pos_next/POS/src/security/zatca-security.ts`** — contains no ZATCA
crypto at all; it is generic web-security boilerplate with broken primitives:

- `hmacSHA256` — not HMAC-SHA256; a 32-bit XOR roll returning 8 hex chars. Every
  JWT it signs is trivially forgeable.
- `verifyJWT` — non-constant-time `!==` compare, and no `alg` check.
- `pbkdf2Hash` — not PBKDF2; same 32-bit roll, then `while (hash.length <
  keyLength*2) hash += hash` pads the digest with **itself**.
- `scryptHash` — named scrypt, is PBKDF2 in browser and the fake roll in Node,
  yet reports `"PBKDF2-HMAC-SHA256 (scrypt-compatible)"`.
- `generateSalt` — uses `Math.random()`, not a CSPRNG.
- `verifyPassword` — non-constant-time `===`.

**`legacy/pos_next/POS/src/pages/ZatcaIntegration.tsx`** — cannot emit a
compliant invoice:

- `computeHashSHA256` — not SHA-256; `absHash + absHash.split("").reverse().join("")`.
- `computeSHA256` — correct in browser, falls back to the fake in Node, so the
  invoice hash **differs between environments**.
- `generateQRCodeSVG` — a decorative `(charCodeAt + y*modules + x) % 2` pattern
  that no verifier can scan.
- `generateXMLInvoice` — emits the **SUNAT/Peru** namespace and
  `CustomizationID 1.0`; omits `cac:Signature` (ECDSA), the QR extension, the
  ICV, and the previous-invoice-hash chain; emits zero `cac:InvoiceLine` while
  declaring `LineCountNumeric 1`; hardcodes 15% VAT; and interpolates
  customer/counter values into XML **with no escaping** (XML injection).

**Blast radius:** none of this reaches production. It lives only in `legacy/`,
nothing imports it, and the active tree is verified clean of every pattern. Any
credential hashed by it would be effectively unprotected — so it must never be
resurrected, and no stored hash may be trusted if it came from this code.

## Consequences

- ZATCA is implemented fresh in `POS/src` (Vue 3) against the official spec:
  real SHA-256 invoice hash chain, TLV QR with a real encoder, minor-unit money
  via `lib/money.js`, UBL 2.1 Saudi (`reporting:1.0`), signed invoices.
- `server/tests/crypto-integrity.test.js` enforces this decision in CI, so the
  quarantine cannot be silently undone and the bad patterns cannot re-enter the
  active tree.
- The `POS_MIGRATION_PLAN.md` line *"Vue 3 + dyposbackend"* is **superseded**
  on the backend point: no framework is to be a runtime dependency. Server-side is
  Express + SQLite (local-first), per `DB_DECISION.md`.
- Claiming ZATCA compliance still requires onboarding, CSID/production
  certificates, and validation with the Fatoora platform. Code alone cannot
  confer it.
