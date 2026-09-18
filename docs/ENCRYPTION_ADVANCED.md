# DyPOS — Local Data Encryption (Advanced Feature, Next Release)

> **Status:** Deferred by design — per customer request and need.
> **Rationale:** Encryption-at-rest on low-end POS hardware (old Android
> tablets, single-core Windows terminals) adds measurable cost to every
> IndexedDB read/write on the hot sale path. DyPOS v1.24.0 ships
> **unencrypted + maximum speed**; encryption lands as an **opt-in
> advanced feature** behind a per-tenant flag.

## Scope (when enabled)

- AES-GCM-256 via Web Crypto API for IndexedDB business tables
  (customers, invoices, payments, stock) + token vault in a dedicated
  encrypted store.
- Key derivation: PBKDF2 (device-bound salt, stored outside the DB) —
  never ship the key next to the ciphertext.
- Graceful degradation: if WebCrypto is unavailable, boot continues
  unencrypted and reports `encryption: "unsupported"` in diagnostics.
- Migration path: `Old Local DB → Backup → Encrypt → Validate → New
  Schema`, with automatic rollback to the backup on failure. Unsynced
  transactions are synced first — an update never deletes pending ops.

## Performance budget (acceptance gate)

Encryption must NOT regress the sale path beyond:

| Metric | Budget |
|---|---|
| Invoice submit (p95, offline) | +50ms vs unencrypted |
| Product search keystroke → paint | +16ms (one frame) |
| Cold boot with warm cache | +300ms |

If the budget is exceeded on the reference low-end device, the feature
stays behind the flag and the customer is told exactly why.

## Activation model

- Tenant-level setting, default OFF.
- Requires: device re-enrollment (fresh key) + completed initial sync.
- Server enforces `encryption_required` per tenant on next sync; a
  revoked/lost device is locked out at first contact (existing session
  revocation already covers tokens).

## What v1.24.0 already provides (no encryption needed)

- bcrypt-12 password hashes (server), PBKDF2 offline unlock hashes.
- SHA-256-only storage for API keys and reset tokens.
- CSP + HSTS-preload + nosniff + SAMEORIGIN headers.
- Brute-force lockouts (server 8/15min, login UI, offline unlock).
- Hash-chained invoice audit trail.
