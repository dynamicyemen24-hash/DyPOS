# DyPOS — Functional & Non-Functional Requirements Baseline

> Product/engineering specification. Defines acceptance criteria and evidence gates; it is not a legal certification.

## 1. Requirements engineering method

Each requirement is expressed as:
ID → actor/context → SHALL behavior → business rule → acceptance evidence → operational owner.

Priority:
- P0 — financial, security, tenant, legal-record, data-integrity or release safety; blocks production.
- P1 — core POS/operations; blocks a production capability.
- P2 — optimization, convenience or advanced analytics.

Requirement status is evidence-based:
specified → implemented → tested → verified → accepted.

A requirement is not complete because a UI exists. It needs an observable behavior and evidence appropriate to its risk.

## 2. Functional requirements

### Identity, access and tenancy

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-SEC-001 | P0 | The system SHALL authenticate users and fail closed when credentials/session are invalid or expired. | API auth tests + negative tests |
| FR-SEC-002 | P0 | Authorization SHALL be evaluated server-side for every protected mutation and sensitive read when a backend is in the path; offline mutations SHALL be authorized by the local session and re-validated at sync. | RBAC/integration tests |
| FR-SEC-003 | P0 | A bound tenant user SHALL NOT read/write another tenant's records by ID, query, header, body, cursor, sync payload or bulk endpoint. | Cross-tenant regression suite |
| FR-SEC-004 | P0 | Tenant context SHALL be derived from trusted identity/session and validated against explicit client scope. | Tenant spoof tests |
| FR-SEC-005 | P0 | Administrative/global integration planes SHALL be explicitly classified and role-gated rather than accidentally exposed. | Route inventory + authorization tests |

### Sales and checkout

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-SALE-001 | P0 | Line, discount, tax and total amounts SHALL be computed by the single money rule (`server/lib/money.js#computeLineMinor`, mirrored in `POS/src/utils/money.js`) — locally while offline, and re-validated server-side on sync; client totals SHALL never be trusted by a *server*, but an offline sale SHALL NOT require a server to be valid. | Money invariant tests |
| FR-SALE-002 | P0 | Money calculations SHALL use minor units or exact decimal semantics and explicit currency precision. | Property/unit tests |
| FR-SALE-003 | P0 | A sale mutation SHALL be atomic across invoice, lines, payment, stock, receivable and local audit/outbox state. | Transaction failure tests |
| FR-SALE-004 | P0 | Repeating the same idempotent sale request SHALL return the canonical original result without creating another sale. | Replay/concurrency tests |
| FR-SALE-005 | P0 | Idempotency keys SHALL be scoped to the owning business/tenant boundary. | Cross-tenant idempotency test |
| FR-SALE-006 | P1 | Overpayment SHALL be represented explicitly as change; receivables SHALL never become negative. | Payment tests |
| FR-SALE-007 | P0 | A closed accounting period SHALL reject new postings. | Fiscal-period test |
| FR-SALE-008 | P0 | Fiscal posting SHALL resolve by effective date against configured period start/end, not assume calendar-year boundaries. | Custom-period test |
| FR-SALE-009 | P0 | Issued financial documents SHALL be immutable; corrections SHALL use return/credit/debit/cancellation workflows permitted by the jurisdiction profile. | Mutation denial + correction tests |
| FR-SALE-010 | P1 | Payment failure SHALL preserve the cart and SHALL NOT create a false successful sale. | Failure-path tests |

### Inventory

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-INV-001 | P0 | Stock mutation SHALL be atomic and concurrency-safe. | Concurrent checkout tests |
| FR-INV-002 | P0 | Available stock SHALL respect reserved quantity where reservations are enabled. | Reservation race tests |
| FR-INV-003 | P1 | Stock policies SHALL distinguish tracked, untracked, strict, warning and disabled modes explicitly. | Policy matrix tests |
| FR-INV-004 | P1 | Transfers, adjustments, receiving and returns SHALL produce traceable inventory movements. | Ledger reconciliation |
| FR-INV-005 | P1 | Negative stock SHALL be an explicit configured policy, never an accidental side effect. | Boundary tests |

### Payments and receivables

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-PAY-001 | P0 | Each payment SHALL have a stable transaction identity and idempotent retry semantics. | Duplicate/retry tests |
| FR-PAY-002 | P0 | Provider callbacks/webhooks SHALL be authenticated, replay-safe and reconciled against provider references. | Webhook security tests |
| FR-PAY-003 | P0 | Raw PAN/CVV/SAD SHALL not be stored by the POS application. | Schema/log/security review |
| FR-PAY-004 | P0 | Wallet/credit changes SHALL have an auditable ledger and remain transactionally consistent with the sale. | Ledger reconciliation tests |
| FR-PAY-005 | P1 | Refunds SHALL reference the original payment/invoice and SHALL not exceed refundable balance. | Refund tests |

### Offline and synchronization

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-SYNC-001 | P0 | Every offline mutation SHALL have a stable operation identity, tenant, device, actor, entity, version and idempotency context. | Payload contract tests |
| FR-SYNC-002 | P0 | Retrying an offline operation SHALL be replay-safe and return canonical server acknowledgement. | Replay tests |
| FR-SYNC-003 | P0 | Conflict handling SHALL be deterministic and SHALL quarantine invalid/unresolvable operations. | Conflict suite |
| FR-SYNC-004 | P0 | A local pending write SHALL never be presented as an authoritative server success. | UX/API integration test |
| FR-SYNC-005 | P1 | Sync SHALL survive application restart, network loss and transient server failure with bounded retry/backoff. | Fault-injection tests |
| FR-SYNC-006 | P1 | Sync cursors SHALL be tenant/device/entity scoped and monotonic. | Cursor invariants |
| FR-SYNC-007 | P0 | Every terminal SHALL mint its own invoice numbers **independently and offline** in the form `POS-{branch}-{terminal}-{date}-{seq}`; two terminals SHALL never collide and no terminal SHALL ever wait on another (or on a server) to issue a number. | Multi-terminal offline concurrency test |
| FR-SYNC-008 | P0 | Where a jurisdiction demands gapless numbering, the server SHALL allocate from `invoice_sequences` scoped by `(branch, fiscal year)` inside the insert transaction; the offline pre-allocated block SHALL reconcile to that scope on sync without gaps or duplicates. | Gapless sequence + reconciliation test |
| FR-SYNC-009 | P1 | Sync SHALL scale across branches: per `(tenant, branch, terminal, entity)` cursors, batched pages and bounded queue depth, so N terminals on one branch do not contend for a single counter or cursor. | Multi-terminal load test |

### Traceability and audit trail

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-TRACE-001 | P0 | Every document SHALL be traceable end-to-end: terminal → branch → shift → invoice → lines → payments → stock movements → returns, by identifiers that survive sync. | Trace query test |
| FR-TRACE-002 | P0 | The audit ledger SHALL be hash-chained (`audit_ledger`) and the invoice chain (`chain_hash`/`chain_prev`) SHALL verify end-to-end; tampering SHALL be detectable with the broken sequence number. | `GET /api/audit/verify`, `chain/verify` |
| FR-TRACE-003 | P0 | Each print SHALL be attributable: print history records document, device, operator, time and outcome, and a reprint SHALL be distinguishable from a first print. | Print history test |
| FR-TRACE-004 | P0 | Each sync operation SHALL be traceable from origin (device/terminal) to acknowledgement, including quarantined and failed operations. | Sync envelope tests |
| FR-TRACE-005 | P1 | Actor, device, branch and correlation IDs SHALL be carried on reads and writes alike, so any figure in a report can be drilled back to its source document. | Report drill-down test |

### Multi-branch and multi-terminal

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-MULTI-001 | P0 | The tenant hierarchy `tenants → organizations → branches → terminals` SHALL scope every read and write; a terminal of branch A SHALL NOT see or mutate branch B's rows (404 on foreign rows, 403 on spoofed scope). | Tenant isolation suite |
| FR-MULTI-002 | P0 | Stock SHALL be correct per branch and aggregated per tenant, with reservations held per terminal so offline terminals cannot oversell a shared branch stock beyond the configured policy. | Reservation race tests |
| FR-MULTI-003 | P1 | Adding a terminal or a branch SHALL require configuration only — no schema change, no code change, and no renumbering of existing documents. | Provisioning test |
| FR-MULTI-004 | P1 | Per-branch settings (currency, tax profile, invoice prefix, receipt header/footer, sequence scope) SHALL override tenant defaults without cross-branch leakage. | Branch settings test |
| FR-MULTI-005 | P1 | Reports SHALL be viewable at terminal, branch, organization and tenant scope with explicit scope labels and consistent roll-ups. | Roll-up reconciliation test |

### Tax, fiscal and jurisdiction

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-TAX-001 | P0 | Tax behavior SHALL be supplied by a versioned jurisdiction profile, not scattered country-name branches. | Profile contract tests |
| FR-TAX-002 | P0 | The system SHALL retain the tax/profile version used to calculate an issued document. | Persistence test |
| FR-TAX-003 | P0 | Saudi deployments SHALL isolate ZATCA-specific submission, QR, UUID/hash, clearance/reporting and correction behavior behind an adapter. | Adapter contract/evidence |
| FR-TAX-004 | P0 | Yemen deployments SHALL use a separately approved tax/accounting profile and SHALL not inherit Saudi VAT assumptions. | Profile tests + review evidence |
| FR-TAX-005 | P0 | Legal numbering/period rules SHALL be configurable and testable per jurisdiction. | Profile acceptance suite |

### Audit, reporting and reconciliation

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-AUD-001 | P0 | Sensitive financial mutations SHALL create tamper-evident audit evidence with actor, tenant, time, operation and correlation context. | Audit tests |
| FR-AUD-002 | P0 | Audit failures SHALL be observable and alertable; critical evidence loss SHALL not be silently swallowed. | Fault-injection + alert test |
| FR-AUD-003 | P0 | Daily totals, payments, receivables, inventory and refunds SHALL reconcile to authoritative transaction records. | Reconciliation job |
| FR-AUD-004 | P1 | Reports SHALL expose their data cutoff, timezone/business date and scope. | Report contract tests |
| FR-AUD-005 | P1 | Exports SHALL preserve currency, precision, document identity and jurisdiction/profile metadata. | Export fixtures |

### UX, Arabic and accessibility

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FR-UX-001 | P1 | Arabic/RTL SHALL be a first-class supported workflow, including numbers, dates, forms, validation and bidirectional identifiers. | RTL regression suite |
| FR-UX-002 | P1 | Barcode-first cashier workflows SHALL support keyboard and scanner input without pointer dependence. | E2E/manual test |
| FR-UX-003 | P0 | Destructive/financial actions SHALL provide appropriate confirmation and clear outcome states. | UX acceptance |
| FR-UX-004 | P1 | Checkout SHALL expose loading, success, failure, retry and recovery states. | State-machine test |
| FR-A11Y-001 | P1 | Core POS workflows SHALL target WCAG 2.2 AA, including keyboard, focus, semantics, contrast, reflow and touch targets. | Automated + manual audit |

## 3. Non-functional requirements

### Offline availability (absolute)
- NFR-OFF-001 P0: Startup SHALL perform **zero** network requests. Boot, first
  paint and session resolution are served entirely from local storage —
  evidence: `POS/tests/standaloneBoot.test.js`.
- NFR-OFF-002 P0: Every core flow — sale, return, shift open/close, search,
  customer lookup, receipt print, stock movement, report — SHALL complete
  with the backend absent. The Express server is optional and sync-only; no
  screen, feature or flag may be gated on its availability.
- NFR-OFF-003 P0: No license, entitlement, telemetry, feature-flag or
  version probe may run without the user's demand or a granted `auto`
  linkage consent (`POS/src/services/link-consent.js`, default `off`).
- NFR-OFF-004 P0: Any unavoidable offline limitation (e.g. an uncached
  catalog page, a cross-branch figure) SHALL be surfaced with provenance
  (`server | local | unavailable`) and recorded as a measured debt item in
  `docs/TECH_DEBT_PAYDOWN.md` — never a silent empty state or a fake zero.

### Security
- NFR-SEC-001 P0: Authentication, authorization, tenant isolation and input validation SHALL fail closed.
- NFR-SEC-002 P0: Secrets SHALL remain outside source control and client bundles.
- NFR-SEC-003 P0: Logs SHALL exclude passwords, tokens, session secrets, CVV and raw payment credentials.
- NFR-SEC-004 P0: Production dependencies SHALL be locked and high/critical exploitable findings SHALL be fixed or explicitly risk-accepted with owner/expiry.
- NFR-SEC-005 P0: Security controls SHALL map to OWASP ASVS 5.0.0 controls relevant to the application.

### Reliability and resilience
- NFR-REL-001 P0: Health, readiness and liveness SHALL have distinct semantics.
- NFR-REL-002 P0: Production release verification SHALL fail the deployment when the live version/commit contract is not met.
- NFR-REL-003 P0: Backup/restore SHALL be tested, not merely configured; restore evidence SHALL be retained.
- NFR-REL-004 P0: Schema migrations SHALL be ordered, idempotent, observable and have rollback/recovery procedures.
- NFR-REL-005 P0: Upstream/API outages SHALL produce truthful failures, never fake business success.
- NFR-REL-006 P1: The service SHALL tolerate transient database/network faults with bounded retries and clear recovery behavior.

### Performance and capacity
Initial engineering budgets:
- Local catalog search p95 ≤ 100 ms.
- Cart mutation p95 ≤ 50 ms.
- Checkout calculation p95 ≤ 100 ms.
- Warm POS first interaction ≤ 1.5 s.
- API reads p95 ≤ 300 ms under the declared reference load.
- API writes p95 ≤ 500 ms under the declared reference load.

Every benchmark SHALL record hardware, dataset size, concurrency, network profile, software version, measurement method and percentile.

### Scalability
- NFR-SCL-001 P1: Key list APIs SHALL use bounded page sizes.
- NFR-SCL-002 P1: High-volume feeds SHALL support stable cursors/keyset pagination where appropriate.
- NFR-SCL-003 P1: Indexes SHALL follow measured access patterns and query plans.
- NFR-SCL-004 P1: Capacity tests SHALL cover at least 10× the expected peak transaction rate before a scale tier is declared production-ready.

### Privacy and data governance
- NFR-PRI-001 P0: Personal/financial data SHALL be classified and minimized.
- NFR-PRI-002 P0: Access to sensitive records SHALL be least-privilege and auditable.
- NFR-PRI-003 P0: Retention, export, deletion/anonymization and legal-hold behavior SHALL be documented per deployment jurisdiction.
- NFR-PRI-004 P0: Saudi deployments SHALL explicitly assess PDPL requirements and cross-border transfer/hosting obligations before regulated production use.

### Observability
- NFR-OBS-001 P0: Requests SHALL correlate request_id → tenant/actor → operation → outcome → latency.
- NFR-OBS-002 P0: Financial and sync failures SHALL expose stable machine-readable error codes.
- NFR-OBS-003 P0: Metrics SHALL cover request rate, error rate, latency, DB health, sync backlog, outbox backlog, reconciliation drift and release version.
- NFR-OBS-004 P1: Alerts SHALL have severity, owner, threshold, runbook and escalation path.

### Maintainability and architecture
- NFR-MNT-001 P0: Domain rules SHALL remain separated from HTTP/UI concerns.
- NFR-MNT-002 P0: Jurisdiction/payment providers SHALL use replaceable adapters/contracts.
- NFR-MNT-003 P1: Public APIs SHALL be versioned or backward-compatible with an explicit deprecation policy.
- NFR-MNT-004 P1: Database changes SHALL preserve backward compatibility during rolling deployment unless a controlled cutover is documented.
- NFR-MNT-005 P1: New business rules SHALL include tests at the lowest stable layer plus at least one end-to-end contract test for critical flows.

## 4. Production acceptance gates

A release is production eligible only when all applicable P0 gates pass:

1. Build reproducible from the locked dependency graph.
2. Unit/integration/API/contract tests green.
3. SQLite/Postgres schema and behavioral parity green.
4. Security/tenant-isolation regression green.
5. Financial invariants and idempotency/concurrency tests green.
6. Accessibility gate green for core workflows.
7. Migration verification and rollback/recovery evidence available.
8. Backup and restore evidence current.
9. Artifact checksum and source commit recorded.
10. Tax/jurisdiction profile version recorded.
11. Deployment completes successfully.
12. Live /api/health and release-version verification pass.
13. No unresolved P0 blocker or expired risk acceptance.

## 5. Definition of Done for financial features

A financial feature is complete only when:
- requirements and edge cases are documented;
- state transitions are explicit;
- authorization/tenant scope is tested;
- the single money rule computes the amounts — locally offline and
  server-side on sync — and the two agree;
- idempotency/race behavior is tested;
- audit/reconciliation impact is covered;
- offline behavior is specified (not "if applicable" — offline is the base
  path and the server is the optional one);
- migration/backward compatibility is covered;
- observability/error codes exist;
- Arabic/RTL and accessibility impacts are checked;
- relevant jurisdiction adapter/profile behavior is covered;
- CI and production evidence are attached.

## 6. Traceability

For every P0 requirement, maintain:
Requirement ID → implementation path → automated test → CI gate → operational evidence → risk/exception.

Exceptions SHALL include:
reason → affected scope → compensating control → owner → approval → expiry/review date.

## 7. Explicit out-of-scope claims

The repository SHALL NOT claim:
- legal/tax certification merely from passing tests;
- PCI compliance merely from not storing cards;
- ZATCA compliance merely from generating a QR/hash;
- ISO certification merely from implementing security controls;
- production success when deployment or live verification was skipped.
