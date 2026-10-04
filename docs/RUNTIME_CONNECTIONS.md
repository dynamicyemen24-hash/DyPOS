# Runtime Service Connections

DyPOS keeps local operation independent from configured remote services. Connection settings are device-local configuration, not a server-backed POS preference.

## Service endpoints

`POS/src/services/runtime-endpoints.js` owns the versioned local record `DyPOS_runtime_endpoints_v1` and currently resolves these services:

- `api`: first-party REST and method-router API. Default: `VITE_DYPOS_API`, then same-origin `/api`.
- `platform`: platform authentication and sync service. Default: `VITE_PLATFORM_URL`, then same-origin.
- `socket`: Socket.IO realtime service. Resolution order: device override, host boot configuration, then `VITE_SOCKETIO_URL` and the runtime-derived same-origin URL.

An empty override restores the build/host default. URLs are validated as HTTP(S), reject embedded credentials, and may not contain a query or fragment. Plain HTTP is allowed for explicitly configured store LAN services; the operator must secure that network.

The Sync Center also supports multiple branch/cloud sync destinations. Scale WebSocket bridge URLs are separately configurable with the scale settings because their protocol and data model are hardware-specific.

## Consent and network behavior

- Opening the Sync Center, loading connection settings, and saving a URL perform no network requests.
- `Test API now`, destination connection testing, server login, and `Sync Now` are explicit one-shot user actions.
- Granting link consent only enables future user-demanded operations. It does not itself probe, authenticate, or connect.
- Automatic triggers remain `off` by default and require both explicit link consent and explicit per-trigger `auto` configuration.
- Changing a service trust target revokes link consent, disables every automatic trigger, and clears credentials associated with that service. A new target requires fresh consent and authentication.
- Revoking consent disconnects active socket/stream activity. The sales ledger, catalog cache, and queued work remain local.

## Adding an integration

A URL is not an integration contract. New services must be implemented as a named adapter with an explicit payload/schema mapping, authentication policy, timeout/retry behavior, idempotency rules where writes are involved, and focused contract tests. Register its endpoint key and validation in the runtime endpoint service, expose the setting in the connection screen, and route automatic activity through link-consent gates. Never send customer or financial data to a generic endpoint merely because it responds to a health check.

Credentials are never entered into endpoint URLs. Provider secrets belong in the provider's secure credential flow; endpoint values alone are not authorization. Back up and review device data before enabling a new sync target.
