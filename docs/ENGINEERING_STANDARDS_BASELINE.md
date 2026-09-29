# DyPOS — Engineering Standards Baseline

## Release gates

### Correctness
- Unit, integration and API tests green.
- POS contract coverage green.
- SQLite/Postgres parity green.
- Money/tax invariants green.
- Financial operations idempotent.
- Issued financial documents immutable; corrections use proper documents.

### Security
- OWASP ASVS 5.0.0 controls mapped.
- Authentication and authorization fail closed.
- Tenant isolation tested.
- Credential endpoints rate-limited.
- Secrets externalized.
- Sensitive fields excluded from generic serialization.
- Internal errors not exposed.
- High/critical dependency findings resolved or explicitly risk-accepted.
- Payment-card data kept out of application scope where possible.

### Privacy
- Personal-data inventory and classification.
- Purpose and retention defined.
- Least-privilege access.
- Sensitive access audited.
- Export/deletion/anonymization procedures.
- Saudi cross-border transfer explicitly assessed.

### Reliability
- Health and readiness have distinct semantics.
- Production verification failure fails deployment.
- Frontend/API/version parity verified.
- Backup created and verified.
- Restore drill automated.
- Migration recovery documented.
- Offline queue survives restart.
- Sync is idempotent and replay-safe.

### Performance targets
| Surface | Target |
|---|---:|
| Local catalog search p95 | <= 100 ms |
| Local cart mutation p95 | <= 50 ms |
| Checkout calculation p95 | <= 100 ms |
| Warm POS first interaction | <= 1.5 s |
| API reads p95 under defined load | <= 300 ms |
| API writes p95 under defined load | <= 500 ms |

Benchmarks must state device, dataset, concurrency, network profile and method.

### UX
- Arabic/RTL first-class.
- Keyboard and touch workflows.
- Barcode-first flow.
- Loading/success/failure/retry states for async actions.
- Destructive actions appropriately confirmed.
- Payment failure never loses cart.
- Network failure never creates false completion.
- Crash recovery restores pending transactions safely.
- Errors are actionable Arabic messages.

### Accessibility
Target WCAG 2.2 AA:
- keyboard-only checkout;
- visible focus and logical focus order;
- semantic labels;
- screen-reader names;
- contrast;
- touch target sizing;
- reduced motion;
- zoom/reflow;
- RTL bidirectional text.

### Observability
Production requests should correlate:
request_id -> actor/tenant -> operation -> outcome -> latency -> audit event

Never log passwords, tokens, CVV, or full payment credentials.

### Change management
Changes affecting money, tax, invoice numbering, inventory, permissions, authentication, sync, schema or deployment require regression tests and an explicit rollback/recovery story.

## Non-negotiable financial invariants

1. Issued invoice is immutable.
2. Refund references original transaction.
3. Duplicate request cannot create duplicate sale.
4. Sync retry cannot duplicate sale.
5. Client cannot choose authoritative server total.
6. Tenant boundaries cannot be bypassed through client IDs.
7. Offline mode cannot fabricate server acknowledgement.
8. Tax calculation is deterministic for the same jurisdiction/configuration/version.
9. Currency precision is explicit.
10. Normal users cannot rewrite audit history.
