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
- `retry({ id, item, recovery })`: retry the selected record; use the same
  idempotency key for transport retries.
- `open-resource({ id, item, recovery })`: route to the required catalog or
  invoice workflow. Preserve the pending operation until the caller confirms
  it has been resolved.
- `dismiss`: reserved for host-level queue dismissal policies; dismissal must
  never delete a pending operation.

The host screen owns persistence, navigation and the actual API request. This
keeps the component safe to reuse and avoids claiming a repair succeeded before
the server confirms it.
