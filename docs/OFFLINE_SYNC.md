# Offline Invoice Sync System

This document describes the offline invoice synchronization system in DyPOS, including the deduplication mechanism that prevents duplicate invoices from being created during network failures.

## Overview

DyPOS supports fully offline operation, allowing cashiers to continue creating invoices even when the network connection is unavailable. The device is standalone-first: zero network without the user's demand. Synchronization runs only on explicit user demand (the «مزامنة الآن» Sync Center action, a server login, an explicit pull) or under automation the user enabled in the linkage variables (per-trigger `auto`, default `off`).

### Key Features

- **Offline Invoice Creation**: Create invoices without network connectivity
- **User-Governed Sync**: No automatic sync on reconnect/boot/timers unless the user set that trigger to `auto` in the linkage variables (`POS/src/services/link-consent.js`); `ask` surfaces the pending count for the user to demand it
- **Deduplication**: Unique offline IDs prevent duplicate invoice creation
- **Retry Logic**: Failed syncs are retried with exponential backoff
- **Local Stock Updates**: Stock levels are tracked locally during offline operation

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Browser)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  POS Cart    │───▶│  sync.js     │───▶│  IndexedDB               │  │
│  │  (UI)        │    │  (Sync Logic)│    │  (invoice_queue table)   │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│                             │                                            │
│                             │ generateOfflineId()                        │
│                             ▼                                            │
│                      ┌──────────────┐                                    │
│                      │  uuid.js     │                                    │
│                      │  (Shared)    │                                    │
│                      └──────────────┘                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Web Worker (Background)                        │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │   │
│  │  │ Server Ping  │    │ Stock Sync   │    │ Invoice Save │       │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Backend (Express + SQLite) — optional                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────┐   ┌────────────────────────────────────┐  │
│  │ routes/method.js         │──▶│ idempotency ledger (SQLite)        │  │
│  │  - submit_invoice        │   │  - key = offline_id                │  │
│  │  - check_offline_..._synced│  │  - canonical result replayed       │  │
│  └──────────────────────────┘   └────────────────────────────────────┘  │
│                                                                          │
│  Every write stays tenant-scoped; the sync tier reconciles, never gates. │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Saving an Offline Invoice

```
User clicks "Submit" while offline
        │
        ▼
┌─────────────────────────────┐
│ saveOfflineInvoice()        │
│ 1. Validate invoice items   │
│ 2. Generate unique          │
│    offline_id (UUID)        │
│ 3. Store in IndexedDB       │
│ 4. Update local stock       │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ IndexedDB invoice_queue     │
│ {                           │
│   id: auto-increment,       │
│   offline_id: "pos_offline_ │
│     abc123-...",            │
│   data: {invoice...},       │
│   timestamp: 1703936400000, │
│   synced: false,            │
│   retry_count: 0            │
│ }                           │
└─────────────────────────────┘
```

### 2. Syncing On User Demand (or Consented Automation)

```
User taps «مزامنة الآن» (or a trigger set to `auto` fires with linkage)
        │
        ▼
┌─────────────────────────────┐
│ syncOfflineInvoices()       │
│ 1. Check if online          │
│ 2. Get pending invoices     │
│ 3. For each invoice:        │
│    - Check if already synced│
│    - Submit to server       │
│    - Mark as synced         │
└─────────────────────────────┘
NOTE: mere connectivity restoration is NOT demand — without the user's
`auto` setting the queue waits for the explicit tap.
        │
        ▼
┌─────────────────────────────┐
│ syncSingleInvoice()         │
│ 1. Pre-sync dedup check     │
│ 2. Transform data           │
│ 3. Call submit_invoice API  │
│ 4. Handle response          │
└─────────────────────────────┘
```

### 3. Server-Side Deduplication

```
submit_invoice() receives request with offline_id
        │
        ▼
┌─────────────────────────────┐
│ Check Offline Invoice Sync  │
│ table for existing          │
│ offline_id                  │
└─────────────────────────────┘
        │
        ├─── Found ───▶ Return existing invoice (no duplicate)
        │
        └─── Not Found ───▶ Create new Sales Invoice
                                    │
                                    ▼
                          ┌─────────────────────────────┐
                          │ Create Offline Invoice Sync │
                          │ record to track this        │
                          │ offline_id                  │
                          └─────────────────────────────┘
```

## Deduplication Mechanism

### The Problem

Network failures during invoice sync can cause duplicates:

1. Client sends invoice to server
2. Server creates and submits the invoice
3. Network drops before client receives response
4. Client retries, creating a duplicate

### The Solution: Unique Offline IDs

Every offline invoice receives a unique `offline_id` at creation time:

```javascript
// Format: pos_offline_<uuid-v4>
// Example: pos_offline_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
```

This ID is:
1. Generated client-side using `crypto.randomUUID()`
2. Stored in IndexedDB with the invoice
3. Sent to the server during sync
4. Used as the idempotency key in the server's idempotency ledger

### Three Layers of Protection

#### Layer 1: Pre-Sync Check (Client)

Before attempting to sync, the client asks the server if the `offline_id` was already synced:

```javascript
const syncStatus = await checkOfflineIdSynced(offlineId)
if (syncStatus.synced) {
    // Already synced, skip this invoice
    await markInvoiceSynced(invoice.id, syncStatus.sales_invoice)
    return { status: "skipped" }
}
```

#### Layer 2: Server-Side Idempotency Check

`DyPOS.api.invoices.submit_invoice` (`server/routes/method.js`) maps
`offline_id` onto the idempotency key before creating anything:

```js
// server/routes/method.js — submit_invoice
idempotencyKey: data.idempotencyKey || source.idempotencyKey || params.idempotencyKey
  || data.offline_id || source.offline_id || params.offline_id || '',
```

A retried push with the same key returns the canonical original result
instead of creating a second sale.

#### Layer 3: Idempotency ledger constraint

The server-side idempotency ledger holds one row per key, so the database
itself refuses a second write for the same `offline_id` — no duplicate can
be committed even under concurrent retries.

## File Structure

```
POS/src/utils/offline/
├── uuid.js           # Shared UUID generation
├── sync.js           # Main sync logic
├── db.js             # IndexedDB schema
└── offlineState.js   # Connectivity state management (consent-gated)

POS/src/workers/
└── offline.worker.js # Background processing

server/routes/method.js
└── DyPOS.api.invoices.submit_invoice          # dedupe via offline_id
└── DyPOS.api.invoices.check_offline_invoice_synced

server/routes/invoices.js
└── REST create/return path (same money rule)
```

## API Reference

### Frontend Functions

#### `generateOfflineId()`
Generates a unique offline ID for deduplication.

```javascript
import { generateOfflineId } from '@/utils/offline/uuid'

const offlineId = generateOfflineId()
// Returns: "pos_offline_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
```

#### `saveOfflineInvoice(invoiceData)`
Saves an invoice to the offline queue.

```javascript
import { saveOfflineInvoice } from '@/utils/offline/sync'

const result = await saveOfflineInvoice({
    customer: "John Doe",
    items: [...],
    payments: [...]
})
// Returns: { success: true, id: 1, offline_id: "pos_offline_..." }
```

#### `syncOfflineInvoices()`
Syncs all pending offline invoices to the server.

```javascript
import { syncOfflineInvoices } from '@/utils/offline/sync'

const result = await syncOfflineInvoices()
// Returns: { success: 5, failed: 0, skipped: 2, errors: [] }
```

#### `checkOfflineIdSynced(offlineId)`
Checks if an offline ID was already synced.

```javascript
import { checkOfflineIdSynced } from '@/utils/offline/sync'

const result = await checkOfflineIdSynced("pos_offline_abc123...")
// Returns: { synced: true, sales_invoice: "ACC-SINV-2024-00001" }
```

### Backend API

#### `check_offline_invoice_synced(offline_id)`
Checks if an offline invoice was already synced.

```
Endpoint: /api/method/DyPOS.api.invoices.check_offline_invoice_synced
Method:   POST
Params:   offline_id (string)
Returns:  { synced: bool, sales_invoice: string|null }
```

#### `submit_invoice(invoice, data)`
Submits an invoice with offline deduplication support.

```
Endpoint: /api/method/DyPOS.api.invoices.submit_invoice
Method:   POST
Params:   invoice (json, optional offline_id) · data (json)
Returns:  invoice details — or the canonical existing invoice on replay
```

### Server-side idempotency (no DocType, no Frappe)

The legacy `Offline Invoice Sync` DocType lived in `legacy/pos_next` and is
not part of the running system. Deduplication is enforced by the idempotency
ledger in SQLite: `offline_id` **is** the idempotency key
(`server/routes/method.js` → `createOrFinalizeSale`), so a replay returns
the original document and the ledger's uniqueness makes a second write
impossible.

## IndexedDB Schema

```javascript
const CURRENT_SCHEMA = {
    // Invoice queue for offline submissions
    // offline_id is unique to prevent duplicates
    invoice_queue: "++id, &offline_id, timestamp, synced",

    // Other tables...
    items: "&item_code, item_name, item_group, *barcodes",
    customers: "&name, customer_name, mobile_no, email_id",
    stock: "&[item_code+warehouse], item_code, warehouse",
    // ...
}
```

### Invoice Queue Record Structure

```javascript
{
    id: 1,                                    // Auto-increment primary key
    offline_id: "pos_offline_abc123-...",     // Unique deduplication ID
    data: {
        customer: "John Doe",
        items: [...],
        payments: [...],
        offline_id: "pos_offline_abc123-..."  // Also stored in data
    },
    timestamp: 1703936400000,                 // Creation timestamp
    synced: false,                            // Sync status
    retry_count: 0,                           // Number of sync attempts
    server_invoice: null,                     // Server invoice name (after sync)
    sync_failed: false,                       // True if max retries exceeded
    error: null                               // Error message if failed
}
```

## Configuration

### Sync Configuration

```javascript
const SYNC_CONFIG = {
    MAX_RETRY_COUNT: 3,      // Max sync retry attempts
    CLEANUP_AGE_DAYS: 7,     // Days to keep synced invoices
    PING_TIMEOUT_MS: 3000,   // Server ping timeout
}
```

### Error Patterns for Duplicate Detection

```javascript
const DUPLICATE_ERROR_PATTERNS = [
    "DUPLICATE_OFFLINE_INVOICE",
    "already been synced",
]
```

## Troubleshooting

### Invoice Not Syncing

1. **Check network connectivity**
   ```javascript
   import { isOffline } from '@/utils/offline/sync'
   console.log('Is offline:', isOffline())
   ```

2. **Check pending invoices**
   ```javascript
   import { getOfflineInvoices } from '@/utils/offline/sync'
   const pending = await getOfflineInvoices()
   console.log('Pending:', pending)
   ```

3. **Check retry count**
   - Invoices with `retry_count >= 3` are marked as `sync_failed`
   - Check the `error` field for details

### Duplicate Invoice Created

1. **Check Offline Invoice Sync records**
   ```
   Offline Invoice Sync List > Filter by offline_id
   ```

2. **Verify unique constraint**
   - The `offline_id` field should be unique
   - Check for database constraint violations

### Clearing Stuck Invoices

```javascript
// In browser console
import { db } from '@/utils/offline/db'

// View all queued invoices
const all = await db.invoice_queue.toArray()
console.log(all)

// Delete specific invoice
await db.invoice_queue.delete(invoiceId)

// Clear all (use with caution!)
await db.invoice_queue.clear()
```

## Best Practices

1. **Always validate items** before saving offline invoices
2. **Handle errors gracefully** in the UI when sync fails
3. **Show sync status** to users (pending count, last sync time)
4. **Retry failed syncs** with exponential backoff
5. **Clean up old data** to prevent IndexedDB bloat
6. **Log errors** for debugging sync issues

## Security Considerations

1. **Offline IDs are UUIDs** - cryptographically random, not guessable
2. **Server validates** all invoice data regardless of offline_id
3. **Permissions apply** - only authorized users can create invoices
4. **Audit trail** - Offline Invoice Sync records provide traceability
