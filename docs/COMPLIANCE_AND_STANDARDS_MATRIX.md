# DyPOS — Compliance & Global Standards Matrix

> Engineering baseline, not a legal certification or tax opinion.

## Principle

Compliance is implemented as controls and evidence, not as marketing claims. Every regulated behavior needs a named control, source requirement, jurisdiction/profile, implementation location, automated test where possible, audit evidence, and an explicit exception path.

No jurisdiction-specific tax rate, invoice format, retention period, privacy rule, or payment behavior may be hard-coded into the generic POS domain.

## Global baseline

| Domain | Baseline | Engineering control |
|---|---|---|
| Application security | OWASP ASVS 5.0.0 | Threat model, auth/authz tests, validation, secure errors, dependency gates |
| Security management | ISO/IEC 27001:2022 | Risk register, asset inventory, access review, incident process, backup evidence |
| Accessibility | WCAG 2.2 / ISO/IEC 40500:2025 | Keyboard, focus, semantic controls, contrast, RTL/i18n, automated + manual checks |
| Payment-card security | PCI DSS v4.0.1 when in scope | Tokenized/terminal payments, no CVV/SAD storage, payment isolation |
| Supply chain | Reproducible locked builds | npm ci, audit gate, declared runtime dependencies |
| Reliability | SRE-style release gates | Health/readiness, version parity, rollback, backup/restore, idempotency |
| Data integrity | ACID + immutable financial audit | Unique keys, transactions, append-only corrections |
| Privacy | Data minimization + purpose limitation | Classification, retention, access audit, deletion/anonymization |

OWASP describes ASVS as a basis for testing application security controls and lists 5.0.0 as the current stable version. WCAG 2.2 is a W3C Recommendation and is also ISO/IEC 40500:2025. PCI SSC currently publishes PCI DSS v4.0.1. ISO/IEC 27001:2022 is the international ISMS baseline.

## Saudi Arabia

### ZATCA e-invoicing

The Saudi profile must support:

- structured electronic invoices and credit/debit notes;
- required fields by invoice type;
- QR requirements;
- tamper-evident history;
- controlled invoice sequencing;
- UUID and applicable cryptographic/hash requirements;
- Phase 2 Fatoora integration;
- submission/clearance/reporting state;
- idempotent retries;
- submission evidence;
- correction through compliant credit/debit notes;
- applicable data-access/residency controls.

ZATCA states that Phase 2 is implemented in waves and requires integration with its systems and specified invoice formats. Its technical material also specifies tamper resistance, protection from alteration/deletion, UUIDs and hashes for applicable invoices/notes.

### Saudi personal data

Saudi deployments must support PDPL controls:

- data inventory/classification;
- purpose limitation;
- minimum necessary collection;
- least-privilege access;
- retention/deletion/anonymization;
- data-subject workflows where applicable;
- transfer/hosting assessment;
- processor/subprocessor register;
- privacy notices/legal-basis configuration where applicable.

SDAIA identifies the PDPL, implementing regulations and the regulation for transfers outside the Kingdom as the Saudi personal-data framework.

### Saudi cloud/security

Enterprise Saudi deployments must be mappable to applicable Saudi cloud and cybersecurity controls. Do not claim NCA/ECC/CCC compliance without the applicable assessment.

## Yemen

Yemen behavior must be a separate legal profile rather than a copy of the Saudi model.

The Yemen tax authority publishes the General Sales Tax Law and amendments, including Law No. 7 of 2020, and has published electronic tax services and material concerning electronic accounting systems.

Engineering controls:

- Arabic-first accounting records;
- tax registration identifiers;
- configurable General Sales Tax treatment;
- product/category tax classification;
- exemptions and non-taxable handling where legally applicable;
- sequential invoice/receipt numbering;
- printable and electronic records;
- immutable audit history;
- accounting-period locking;
- exportable tax/accounting records;
- offline operation for unreliable connectivity;
- jurisdiction-specific reports.

The application must not infer a current Yemen rate or legal treatment from a generic VAT constant. Rates, exemptions, fields and retention rules must be supplied by a versioned Yemen jurisdiction configuration approved by the responsible tax/legal owner.

## Payment security

Minimize PCI DSS scope:

- use certified payment terminals/providers;
- never store CVV/SAD;
- avoid persisting PAN;
- use provider/token references;
- idempotent payment retries;
- authenticated/replay-protected webhooks;
- reconcile payment status asynchronously;
- enable offline card acceptance only when the provider explicitly supports it.

## Financial integrity

Every financial transaction needs:

- immutable unique ID;
- sequential document number where required;
- tenant/branch/terminal/user context;
- timestamps;
- currency and minor-unit precision;
- deterministic tax/discount calculation;
- immutable totals after issue;
- correction/refund linkage;
- idempotency key;
- audit event;
- reconciliation status.

Money must use integer minor units or exact decimal arithmetic. Floating-point arithmetic is prohibited for authoritative totals.

## Offline integrity

Offline mode may create a pending operation locally, but synchronization must use stable operation IDs, idempotency, conflict policy, server validation, replay protection, acknowledgement state, retry/backoff and quarantine for invalid operations.

A local write must never become a false server success.

## Release evidence

Retain commit SHA, artifact checksum, dependency lockfile, tests, security scan, migration/schema version, tax-profile version, configuration checksum, backup/restore evidence, live version verification and deployment/approval metadata.

Passing tests does not equal legal certification. Local legal/tax review remains mandatory before regulated production use.
