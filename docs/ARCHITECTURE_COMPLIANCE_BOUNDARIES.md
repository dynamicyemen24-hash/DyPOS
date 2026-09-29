# DyPOS — Compliance Architecture & Boundaries

## Layer boundaries

### POS client
Responsible for cashier UX, local IndexedDB state, offline pending operations, local search and presentation.

Not authoritative for final invoice issuance, server identity, legal tax configuration, cross-device inventory truth or payment settlement.

### Edge/Cloudflare
Responsible for TLS/routing/static delivery/request correlation and controlled forwarding.

The edge compatibility worker must never impersonate an authenticated user or claim a write succeeded when no authoritative write occurred.

### Authoritative backend
Responsible for authentication/session, authorization/tenant isolation, financial commits, inventory mutation, invoice issuance, tax-profile application, sync acknowledgement, idempotency, audit events and reconciliation.

### Database
Responsible for durable state, constraints, uniqueness, transactions, audit retention and backup/restore.

## Jurisdiction adapter

Introduce a versioned contract concept:

JurisdictionProfile:
- id
- version
- currency
- taxModel
- invoiceModel
- numberingRules
- requiredFields
- qrRules
- submissionMode
- retentionPolicy
- privacyProfile
- paymentProfile

Examples: YE-<version>, SA-ZATCA-<version>.

The POS domain consumes this contract instead of branching on country names throughout components.

## Invoice state machine

The authoritative lifecycle must distinguish:
DRAFT -> ISSUED -> QUEUED_FOR_SUBMISSION -> SUBMITTED -> ACCEPTED or REJECTED -> CORRECTED/CREDITED

Also model partial/full returns and cancellation only where legally permitted.

A UI label such as “Paid” is not equivalent to “Tax invoice accepted”.

## Sync protocol

Every mutation should carry:
- operation_id
- idempotency_key
- tenant_id
- device_id
- actor_id
- entity_type
- entity_id
- operation_type
- client_created_at
- payload_version
- attempt_count
- state

Server flow:
1. authenticate;
2. authorize tenant;
3. validate payload version;
4. check idempotency key;
5. validate business invariants;
6. execute transaction;
7. append audit event;
8. persist acknowledgement;
9. return canonical server state.

Retrying the same operation returns the original acknowledgement instead of executing it again.

## Data classification

Minimum classes:
Public, Internal, Confidential, Personal, Financial, Authentication Secret, Payment-Sensitive.

Classification drives storage, encryption, logs, exports, retention, access and deletion.

## Saudi boundary

ZATCA integration must be a replaceable adapter. Preserve invoice identity, applicable cryptographic/hash evidence, submission response, rejection reason, retry state and original payload/version.

## Yemen boundary

Yemen tax behavior must be a versioned configuration/adapter. The generic POS engine must not assume Saudi VAT semantics are the Yemeni legal model.

## Payment boundary

Represent payments using:
PaymentIntent = provider + provider_reference + method + amount_minor + currency + status + idempotency_key

Do not persist raw card security data.

## Release boundary

Eligible release path:
source -> build -> artifact -> deployment -> live verification

All stages must refer to the same release version and commit. Green CI alone is not evidence that production serves that release.
