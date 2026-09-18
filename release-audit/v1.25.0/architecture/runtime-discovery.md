# Runtime Discovery (proven, not assumed)

## Client: PWA (proven)
- Vue 3.5.13 + Vite 5 + Pinia + frappe-ui + Dexie 4.4.6 + Workbox (POS/package.json, vite.config.js:155-305)
- NOT Electron/Tauri/Capacitor — no native shell code exists in repo
- Install: `beforeinstallprompt` composable (usePWAInstall.js:40-144)

## Local DB: IndexedDB ×2 via Dexie (proven)
- `DyPOS-Offline-v1` (services/db.js): 15 tables, schema v1→v3 (reservations, delivery)
- `DyPOS_offline` (utils/offline/db.js): 16+ tables (invoice_queue, prices, offers, zatca_*)
- Migration: Dexie `.version()` chain; server SQLite v16 via schema.js migrate()
- Encryption at rest: NONE (deferred opt-in — docs/ENCRYPTION_ADVANCED.md)

## Sync engine (proven)
- Client: 7-file engine (sync-manager/core/protocol/auth/error/validator + offline-store)
- Server: `GET /pull` (checkpoint, tenant-scoped v16), `POST /push` (ADMIN/MANAGER, ≤1000, savepoint isolation), `GET /checkpoint`
- Retry: 5 attempts, exp backoff 1s→30s + 30% jitter (sync-error.js:94-99)
- Idempotency: invoice/payment `idempotencyKey` + UNIQUE; sync-push keys + dedupe (tested)
- Conflict: server-wins UPSERT; hub-and-spoke; NO silent merge (documented limitation, Tier-1 accepted)

## Backend runtime (proven)
- Node 24 + Express 4 + node:sqlite (zero native deps), single-writer Tier-1
- Localverified: v1.25.0, env=production, migration v16, health ok
- Cluster refused on SQLite by design (server.js:74-83)

## Artifact classification (§2 rule)
- `web.config` / `ORIGIN-DEPLOY.bat` / `C:\inetpub\wwwroot` scripts: LEGACY-UNVERIFIED as production runtime — no IIS exists on build machine (no W3SVC/appcmd), no origin access. IIS deploy path is DOCUMENTED INTENT, not proven CURRENT PRODUCTION.
- Docker/Dockerfile/compose: UNUSED (no daemon verified here; image tags bumped per release).
- Cloudflare: PROVEN edge (Server: cloudflare, CF-Cache-Status observed).
- Origin host/runtime: UNKNOWN (hidden behind CF; no access) → ORIGIN DEPLOYMENT BLOCKED.
