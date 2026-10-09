# Sync recovery workflow

The sync API must help an operator repair a failed record instead of treating
`FAILED` as a terminal dead end. Every failed item returned by
`POST /api/sync/push` keeps the legacy `error` string and adds a structured
`recovery` object.

## Client behavior

1. Keep the failed record and its original payload in the local outbox.
2. Render `recovery.title` and `recovery.message` next to the affected record.
3. For `REQUIRED_FIELDS`, focus the missing field(s), preserve all supplied
   values, and offer **Save fixes & retry this record**.
4. For `MISSING_REFERENCE`, link to the referenced entity (currently product
   catalog), keep the stock operation pending, and offer retry after the
   reference exists.
5. For `INVOICE_SYNC_UNSUPPORTED`, do not discard or mark the sale synced.
   Preserve the draft and route the operator through the normal online invoice
   creation flow. The sync endpoint deliberately does not fake invoice success.
6. For `TEMPORARY_STORAGE_ERROR`, offer a bounded retry using the same
   idempotency key. For validation or unsupported-operation errors, do not
   auto-loop retries; ask the operator to repair or choose a supported path.
7. After a retry, replace that record's status and recovery details with the
   latest response. Do not block successful sibling records in the batch.

## Safe host orchestration helper

Use `useSyncRecovery` from `@/composables/useSyncRecovery` to connect the
panel to the application's existing outbox and API without embedding storage
assumptions in the shared component. The host supplies these callbacks:

- `pushRecord(item)`: send exactly one record and resolve only with the server's result.
- `persistRecord(record)`: persist the updated record to the real local outbox.
- `openRepair(item, recovery)`: show the host's editor and resolve with corrected
  record fields, or a falsy value if the operator cancels.
- `openResource(item, recovery)` / `openReview(item, recovery)`: navigate to
  the relevant workflow or record details.

Wire the returned `busyIds` and `errors` into `SyncRecoveryPanel` as
`busyIds` and `actionErrors`, and wire its `retry`, `repair`,
`open-resource`, and `review` events to the returned handlers. A retry is
refused unless `recovery.retryable` is true. Transport or persistence failures
leave the queue record unchanged and expose an actionable error. A repaired
record is saved as `PENDING`; the host still controls when to send it again.
The helper preserves the record ID and idempotency key and does not invent a
local database schema.

The recovery panel is now mounted in `POS/src/components/sale/SyncCenterDialog.vue`
and reads failed operations from the canonical `db.syncQueue` outbox. The host
integration intentionally supports **review** and **retry** for this queue; it
does not pretend to provide field-level repair or resource navigation until
those flows are connected to the real record editors.

The integrated path:
- filters canonical queue entries to the currently authenticated tenant before
  displaying them;
- rechecks tenant ownership and the `failed` state inside a read-write
  transaction before reopening a record;
- requires explicit linkage and an effective auth token before sending;
- preserves the queue entry and its idempotency data while reopening it for the
  existing sync manager; and
- reports a retry as successful only after rereading the same queue entry and
  confirming its status is `synced`. If transport or sync processing fails,
  the error remains visible even if the queue status changed.

The shared `useSyncRecovery` helper remains available for hosts with an
appropriate per-record persistence adapter. Before release, exercise the
integrated dialog in an isolated offline/online E2E test, including a tenant
switch, a network failure, and a retry that does not reach `synced`.

## Recovery response contract

- `code`: stable machine-readable classification.
- `title`, `message`: Arabic operator-facing explanation.
- `missingFields`: field key and localized label when required values are
  absent.
- `missingReferences`: entity, field, and reference value for a dependency.
- `nextAction`: stable action identifier for the UI to route or guide the
  operator.
- `retryable`: whether an immediate retry is appropriate without changing
  the payload or resolving a dependency.
- Optional `endpoint`, `resource`, and `preserveDraft`: route/context for
  the relevant recovery workflow.

Each pushed item is wrapped in a database savepoint. A failed item rolls back
its own partial writes while independent valid items in the same batch can
commit. Corrected records can then be re-submitted individually.

## Shared operator UI

The reusable Vue surface is `@/components/work/SyncRecoveryPanel` (also
exported from `@/components/work`). Pass the per-item `results` returned by
the push endpoint as `items`, plus identifiers currently being processed as
`busyIds`.

It emits intent rather than silently mutating local data:

- `repair({ id, item, recovery })`: open an editor for that record, preserve
  the payload, and resubmit only after the operator confirms the corrected
  values.
- `retry({ id, item, recovery })`: retry the selected record only when the
  response marks it retryable; use the same idempotency key for transport retries.
- `review({ id, item, recovery })`: open a review/details path for a non-retryable
  or unsupported operation. This is deliberately distinct from retry so a
  review action cannot accidentally resubmit unchanged invalid data.
- `open-resource({ id, item, recovery })`: route to the required catalog or
  invoice workflow. Preserve the pending operation until the caller confirms
  it has been resolved.
- `dismiss`: reserved for host-level queue dismissal policies; dismissal must
  never delete a pending operation.

The host screen owns persistence, navigation and the actual API request. This
keeps the component safe to reuse and avoids claiming a repair succeeded before
the server confirms it.
