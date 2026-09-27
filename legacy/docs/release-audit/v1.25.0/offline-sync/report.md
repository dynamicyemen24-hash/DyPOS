# Offline / Sync Report (code + test evidence; no browser automation available here)

## Local DB gates — PASS (test evidence)
- Creation/schema/indexes: Dexie v1→v3 definitions (services/db.js:19-76); server v16 migration applied live
- Persistence model: invoice_queue + payment_queue + drafts survive restart (IndexedDB durable)
- Migration: additive columns only (v2–v16); Dexie + SQLite both versioned; staged restore keeps pre-restore copy
- Integrity: PK/FK/UNIQUE constraints + transaction-wrapped writes (invoice create, stock guard, shift handover)

## Offline gates — PASS (test evidence, NOT browser-proven)
- Tests: offlineStore, chunkedSync, offlineNumbering, stockReservations, network (vitest 354/354)
- Offline numbering `POS-{branch}-{terminal}-{date}-{seq}`; 30-min stock reservations prevent oversell
- Queue: syncQueue table (enqueue/pending/markSynced/markFailed) + invoice_queue with offline_id dedup
- Restart recovery: queues are IndexedDB-persistent; worker crash recovery in workerClient.js:260-293
- Browser runtime (login/RTL/offline E2E): NOT VERIFIED — no automation browsers on build machine

## Sync gates — PASS (test evidence)
- Suites: 170/170 incl. sync-gaps (7 new), invoices idempotency, scale1-9, dispatcher-lease
- Retry/backoff: constants verified in code; 5xx/timeout classes retryable; dead-letter via FAILED status
- Idempotency: same key twice → ONE operation (tested: products count==1, deduped:true)
- Conflict: server-wins UPSERT (documented; no silent loss — unknown types fail CLOSED)
- Tenant isolation: scoped pull hides cross-tenant rows incl. sync_log (tested); devices tenant-filtered (tested)
- Upgrade: v15→v16 applied on live DB cleanly (health reports mig=16)
- Rollback path: git tags per release + pre-restore DB copies + additive-only migrations
