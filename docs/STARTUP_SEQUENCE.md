# DyPOS Startup Sequence (offline-first)

This document describes the initialization flow of the DyPOS frontend, from
page load to interactive state. The governing contract is
`docs/OFFLINE_ARCHITECTURE.md` and invariant 8 in `AGENTS.md`: **startup
performs zero network requests**. Every step below runs from local storage;
anything that can touch the network is behind `isLinkEnabled()`
(`POS/src/services/link-consent.js`, default `standalone`).

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Application Startup (all local)                 │
├─────────────────────────────────────────────────────────────────────┤
│  1. Service Worker registration (after window.load, non-blocking)   │
│  2. Vue app configuration (plugins, global components)              │
│  3. Local session resolution — NO network request                   │
│  4. CSRF initialization — SKIPPED unless linked (isLinkEnabled)     │
│  5. Router registration & app mount (Arabic RTL first paint)        │
│  6. Local Dexie DB open + migrations                                │
│  7. Bootstrap preload — background, non-blocking, failure-tolerant  │
│  8. Consent-gated subsystems (platform sync, realtime, SSE)         │
└─────────────────────────────────────────────────────────────────────┘
```

There is no parallel "CSRF + user fetch" phase. A user fetch must never
gate POS startup (`POS/src/main.js`: *"Local session + cookies are
authoritative. No network request is made here"*).

## Detailed sequence

### 1. Service Worker registration

**File:** `POS/src/main.js`

Registration happens after `window.load`, dynamically imported, so it never
blocks first paint. The SW precaches the full asset set, which is what makes
the next boot network-free.

```javascript
window.addEventListener("load", () => {
    import("virtual:pwa-register").then(({ registerSW }) => {
        registerSW({ immediate: true, onNeedRefresh, onOfflineReady })
    })
}, { passive: true })
```

### 2. Vue app configuration

**File:** `POS/src/main.js`

`createApp` + Pinia + resource/pageMeta/translation plugins and the global
`dypos-ui` components are registered before any async work.

### 3. Session resolution — local only

**Files:** `POS/src/main.js`, `POS/src/data/session.js`

The local session (`sessionUser()` / `sessionRole()`) and the auth cookies
are read from local state. Offline, the last session is valid for the device
and the POS renders straight to the register screen. No
`dypos.auth.get_logged_user`, no `userResource.fetch()` on the boot path.

### 4. CSRF — consent-gated, not a boot step

**File:** `POS/src/main.js` (`initializeCSRF`), `POS/src/utils/csrf.js`

```javascript
if (!isLinkEnabled()) {
    log.debug("Standalone - skipping CSRF initialization")
    return
}
```

CSRF only matters for server calls, so it is fetched only when the user has
granted linkage. The 30-minute refresh timer (`bootstrapState.csrfRefreshTimer`)
is registered inside the same guarded path — there is **no unconditional
interval refresh** at startup.

### 5. Router & mount

`app.use(router)` then `app.mount("#app")`; initial navigation uses the
local session (register screen vs. login screen). First paint is Arabic RTL.

### 6. Local DB

Dexie/IndexedDB opens and migrates locally. It is the source of truth for
sales, stock, customers, sync queue and print spool.

### 7. Bootstrap preload (background, optional)

**File:** `POS/src/main.js` (`preloadBootstrapData`), `POS/src/stores/bootstrap.js`

Runs *after* mount, in the background, and every failure path continues
normally: *"Bootstrap preload failed; application continues normally"*.
Local mirrors (`methodGetListWithSource` → `local`) already carry the data
the screens need, so a missing backend changes the provenance badge, not the
screen.

> The legacy `DyPOS/api/bootstrap.py` endpoint referenced by older revisions
> of this document existed only in `legacy/pos_next` and is not part of the
> running system.

### 8. Consent-gated subsystems

Each of these checks `isLinkEnabled()` and stays closed in standalone mode:

| Subsystem | Standalone behavior | File |
| --- | --- | --- |
| Platform sync engine | parked | `POS/src/main.js` `initPlatformSync` |
| Realtime socket (socket.io) | "realtime socket stays closed" | `POS/src/main.js` `initializeRealtime` |
| SSE / realtime sync store | `enabled: isLinkEnabled()` | `POS/src/main.js` |
| Build-version watchdog | polls only when linked | `POS/src/main.js` `startBuildVersionWatchdog` |
| Feature-flag bootstrap | skipped; local defaults remain ON | `POS/src/main.js` |
| Network monitor / server ping | must not start without consent | `POS/src/utils/offline/offlineState.js` |

## What is forbidden at startup

From `docs/OFFLINE_ARCHITECTURE.md`, verbatim:

> Forbidden at startup: `dypos.auth.get_logged_user`, `/api/method/*`
> whitelists, CSRF fetch, remote localization, remote device/features,
> any `/api/ping` or connectivity probe, any auto-sync/auto-connect.

Enforced by `POS/tests/standaloneBoot.test.js`, which scans every module
under `src/**` for un-gated network triggers and fails the build.

## Performance timeline (local boot)

```
0ms    ─┬─ Page load begins
        │
50ms   ─┼─ Service worker registration starts (async)
        │
100ms  ─┼─ Vue app configured, local session resolved
        │
150ms  ─┼─ App mounts — Arabic RTL first paint
        │
200ms  ─┼─ Dexie open + migrations
        │
300ms  ─┴─ Interactive (no request has left the device)
```

## Error handling

| Phase | Failure behavior |
|-------|------------------|
| Service worker | App still runs; SW registration failure is non-fatal |
| Local session | Missing/invalid → login screen (still no network) |
| CSRF | Not attempted unless linked; retried on first linked call |
| Bootstrap preload | Logged at debug; stores fall back to local mirror |
| Backend absent | Provenance shows `local` / `unavailable` — never a fake empty list |

## Related files

- `POS/src/main.js` — entry point and every consent gate above
- `POS/src/services/link-consent.js` — the consent contract
- `POS/src/utils/csrf.js` — CSRF management (linked mode only)
- `POS/src/stores/bootstrap.js` — background bootstrap
- `POS/src/data/session.js` — local session
- `docs/OFFLINE_ARCHITECTURE.md` — the architecture this sequence implements
- `POS/tests/standaloneBoot.test.js` — the gate that keeps it true
