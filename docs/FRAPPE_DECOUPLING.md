# Frappe Decoupling Contract

## Purpose

DyPOS is being migrated to an offline-first architecture.

Frappe is **not** part of the required runtime.

## Allowed

Frappe may exist only behind an explicitly optional integration boundary for:

- cloud synchronization,
- migration/import/export,
- enterprise integrations,
- future server-side administration.

## Forbidden in offline runtime

The following must not be required for normal operation:

- `frappe.auth.get_logged_user`
- `frappe.client.*`
- `frappeRequest`
- `frappeCall`
- Frappe CSRF bootstrap
- Frappe bootstrap endpoints
- Frappe realtime
- remote feature flags
- remote localization
- remote device discovery

## Required dependency direction

```
UI
 ↓
Application Services
 ↓
Repository Contracts
 ↓
Local SQLite Adapter
```

Remote integrations must point inward through adapters:

```
Application Services
       │
       ├── Local SQLite Adapter
       │
       └── Optional Remote Sync Adapter
```

The UI must never import a remote adapter directly.

## Enforcement

Future code review/CI should reject new production-runtime imports of:

```
frappe-ui request APIs
frappe.auth
frappe.client
/api/method/
DyPOS.api.
```

A UI-only component library can be retained temporarily if and only if it is proven not to provide runtime networking or session state. It must be isolated from the backend/integration layer and should be replaced by DyPOS-native UI primitives over time.

## Success criterion

Disconnect the network before starting DyPOS.

If the cashier can still:

- authenticate,
- load the local catalog,
- sell,
- accept cash,
- update stock,
- print/store a receipt,
- manage a shift,

the offline boundary is functioning.

If any of those operations require Frappe, the migration is incomplete.
