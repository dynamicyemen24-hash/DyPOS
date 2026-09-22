# Crash-Resume Sales + Global Readiness

DyPOS claims a **crash-resistant sale**: a cashier who is mid-checkout
(payment panel open, line items in the cart, maybe a partially entered amount)
and whose tab crashes, reloads, or is closed can RESUME that exact working
state on the next load — instead of silently losing the sale.

This document is the operator + wiring runbook for the crash-resume layer and
the regional display helpers that ship with it.

---

## Principles

- **Financial truth is server-authoritative.** Every price/tax/total rendered
  by the client is DISPLAY-ONLY. The crash draft stores the cashier's WORKING
  state (items, quantities, payment-panel fields) — never an authoritative
  total. On submit, the server recomputes pricing exactly as it would for any
  other sale, so a resumed draft produces an identical, validated invoice.
- **Never block the cashier.** The draft layer is fully offline-safe and never
  throws; a draft that fails validation is quietly discarded.
- **Never double-prompt.** Crash-resume and the existing live-cart autosave
  (IndexedDB `liveCartAutosave`) are complementary layers. Once one is
  restored or discarded, the other's prompt is cleared too, so the UI shows at
  most one recovery banner.

---

## Behavior matrix (crash scenarios)

| Moment of crash             | What survives | What the cashier sees on reload |
|-----------------------------|---------------|----------------------------------|
| Before any item is added    | nothing (no draft is written) | normal empty POS |
| Items in cart, payment panel closed | full cart (items watched & throttled-autosaved) | `[استئناف عملية البيع]` banner: resume or dismiss |
| Payment panel open, cash amount partially typed | items + `paymentAmount`/`paymentMethod` (panel field values) | resumed cart AND payment panel restored to exactly where the cashier left off |
| Between "Confirm payment" press and cart clear | **no draft** — payment confirmation gates the draft: once payment is confirmed the draft is cleared and the normal submit/idempotency path owns the rest | normal flow — no banner; the invoice is either submitted or already queued |
| After successful submit      | nothing (submit + cart clear clears the draft) | normal empty POS |
| More than 24h since last snapshot | draft discarded with reason `too_old` | normal empty POS |
| App upgraded with a newer draft `schema` | draft discarded with reason `schema_invalid` | normal empty POS |

Notes:

- **A resumed cart is NOT auto-submitted.** It lands in the live cart (which is
  empty at that point) and waits for the cashier to review and confirm payment,
  exactly like any other checkout. It never auto-pushes to the server.
- The draft is captured while the cart is non-empty and the cashier is working.
  The final "confirm payment" path clears it (see “Clearing policy”).

---

## Storage

| Property          | Value |
|-------------------|-------|
| Storage           | `localStorage` (NOT `sessionStorage` — must survive reload/tab-close) |
| Key               | `DyPOS_crashDraft` |
| Max lines         | `MAX_ITEMS = 500` (safety cap on captured cart lines) |
| Max payload       | `MAX_DRAFT_BYTES ≈ 256 KiB` (JSON size guard; oversized drafts are trimmed: panel/meta first, then trailing lines) |
| Write throttle    | ≤ 1 physical write/sec (`WRITE_THROTTLE_MS = 1000`); the newest draft is kept pending and flushed synchronously on `pagehide` |
| Draft TTL         | `DRAFT_MAX_AGE_MS = 24h` — older snapshots are discarded with reason `too_old` |
| Quantity clamp    | restored quantities are clamped to `0..1_000_000` |

### Schema (v1)

```jsonc
{
  "schema": 1,                    // SCHEMA_VERSION — bumping discards old drafts
  "kind": "checkout",
  "savedAt": "2026-09-23T12:34:56.000Z",
  "fingerprint": "cafebabe",      // FNV-1a 32-bit over canonical items (drift detection, not crypto)
  "cart": { "items": [ /* sanitized line items */ ] },
  "panel": { "paymentAmount": "120", "paymentMethod": "cash" },  // optional
  "meta": { "customer": "..." }                                  // optional
}
```

Sanitization rules during capture: functions/symbols/undefined stripped, class
instances copied as plain objects, `Date`-likes serialized to ISO strings,
arrays capped, depth-limited recursion.

### Restore validation (`restoreDraft`) reason codes

| Reason              | Meaning |
|---------------------|---------|
| `not_json`          | stored value is not parseable JSON |
| `invalid_draft`     | root is not an object |
| `schema_invalid`    | `schema` ≠ current `SCHEMA_VERSION` |
| `no_items`          | empty / missing `cart.items` |
| `too_many_items`    | more than `MAX_ITEMS` lines |
| `invalid_timestamp` | missing/bad `savedAt` |
| `too_old`           | snapshot older than the age limit |
| `size_exceeded`     | payload exceeds the byte budget |

---

## Clearing policy

The draft is removed (or never written) in exactly these cases:

1. **Empty cart** — `captureDraftState` returns `null` and the composable
   clears any lingering draft when the live cart is emptied.
2. **Payment confirmed / sale submitted** — the composable's callers clear it
   (`clearDraft()`) after successful submit, mirroring `useLiveCartRecovery`,
   so a completed sale never re-prompts.
3. **Cashier dismisses** the resume banner → `dismiss()` → `clearDraft()`.
4. **Cashier accepts** → `accept()` → draft restored, then `clearDraft()`.
   The just-restored cart re-captures normally on subsequent edits (post-1.1s
   cooldown), so a second crash during review still resumes.
5. **Boot-time validation failure** (`schema_invalid`, `too_old`, etc.) → the
   draft is removed and no banner shows.
6. **Live-cart restore/discard** → `useLiveCartRecovery.js` additively calls the
   same `clearDraft()` so the two layers never double-prompt on one basket.

---

## Enable/wiring

### Entry points (export signature)

```
src/utils/useCrashResume.js   — pure & testable, zero deps
  SCHEMA_VERSION                : number        (1)
  STORAGE_KEY                   : string        ("DyPOS_crashDraft")
  captureDraftState(cart, panel, meta, ts?)  → draft | null
  restoreDraft(raw, opts?)      → { ok:true, draft } | { ok:false, reason }
  mergeDraftIntoCart(draft, currentItems) → { ok:true, items } | { ok:false, reason }
  writeDraftThrottled(draft)    → boolean (did a physical write happen)
  flushDraft()                  → boolean   (pagehide-safe flush)
  clearDraft() / hasDraft()     → boolean
  readValidDraft(opts?)         → restoreDraft result over persisted state

src/composables/useCrashResume.js — wiring controller, never throws
  installCrashResume(adapter, options?) → {
    installed, pendingDraft: Ref, messages: Ref,
    accept(), dismiss(), captureNow(), stop()
  }
  useCrashResume(adapter, options?)     → same, auto-stops on scope dispose

src/utils/regional.js — Intl-based, DISPLAY-ONLY formatters
  formatMoney(amount, { locale?, currency?, currencyDisplay?, ... })
  formatDecimal(amount, { locale?, minimumFractionDigits?, ... })
  formatDate(input, { locale?, dateStyle?, fallback? })
  formatDateTime(input, { locale?, dateStyle?, timeStyle?, fallback? })
  normalizeNumeric(input)     // Arabic-Indic ٠-٩ + Persian ۰-۹ → ASCII
  taxLabel(profileOrKey, { translate?, fallback? })
  resolveTaxDisplay(price, rateOrProfile, { mode?, translate? }) → { mode, rate, base, tax, total, label }
  TAX_PROFILES / DEFAULT_LOCALE / DEFAULT_CURRENCY

src/composables/useLocale.js — additive, backward-compatible
  translate(key, fallbackAr?) / t(key, fallbackAr?) / hasTranslation(key)
```

### Adapter contract (for `installCrashResume`)

Accepted shapes, in priority order:

1. **Explicit function shape (canonical)** — enables item AND panel restore:

   ```js
   installCrashResume({
     getItems:  () => cart.value,                    // live cart items (array)
     setItems:  (items) => { cart.value = items },   // restore target
     getPanel:  () => ({ paymentAmount: paymentAmount.value,
                         paymentMethod: paymentMethod.value }),
     setPanel:  (panel) => { if (panel) {
       paymentAmount.value = panel.paymentAmount ?? "";
       paymentMethod.value  = panel.paymentMethod ?? "cash";
     } },
     getMeta:   () => customerMeta(),
     setMeta:   (meta) => applyCustomerMeta(meta),
     isCartEmpty: () => cart.value.length === 0,
   })
   ```

2. **Pinia setup-store instance** — `installCrashResume(usePOSCartStore())`
   works out of the box (refs are unwrapped on the store proxy; restoring
   writes back through the proxy). Panel/meta are only restored if the store
   also exposes `getPanel`/`setPanel`/`getMeta`/`setMeta`.

3. **Raw Vue ref** — `installCrashResume({ invoiceItems: ref([...]), setPanel })`.

### Orchestrator wiring note

Call `installCrashResume(adapter)` **once, after Pinia is installed** (e.g. in
`POS/src/main.tsx`, immediately after `app.use(createPinia())`). `main.js` is
owned by the orchestrator — do not edit it. The adapter's `getItems`/`setItems`
must point at the POSSale cart (`POS/src/pages/POSSale.vue` keeps cart + payment
panel in component-local refs, so prefer the explicit function shape above; a
bare `useSessionStore()` does NOT expose the cart and will disable the feature
with `installed: false` + a logged error).

The controller is fully offline-safe and never throws; it only reads
`localStorage` — it does not touch the IndexedDB sync queue or the live-cart
autosave layer.

### Regional readiness

Wire the Intl formatters wherever raw `.toFixed()` / date strings are shown:

- `formatMoney` for currency totals — locale/currency come from settings
  (`configureCurrency` in `utils/currency.js`); default `ar-SA-u-nu-latn`/`SAR`.
- `formatDecimal` for quantities, `formatDate`/`formatDateTime` for stamps.
- `normalizeNumeric` on the cashier keypad: folds `١٬٢٣٤٬٥٦٧٫٨٩` → `1234567.89`.
- `resolveTaxDisplay` + `TAX_PROFILES` for inclusive/exclusive tax labels.
  **These are presentation previews only — authoritative totals always arrive
  from the server on submit.**

---

## Verification

```bash
cd POS
npx vitest run tests/crashResume.test.js tests/i18nCoverage.test.js tests/regional.test.js
npx biome check src/utils/useCrashResume.js src/composables/useCrashResume.js \
  src/utils/regional.js src/composables/useLocale.js \
  src/composables/useLiveCartRecovery.js \
  tests/crashResume.test.js tests/i18nCoverage.test.js tests/regional.test.js
```

## Owned files (do not extend ownership)

- `POS/src/utils/useCrashResume.js` (new)
- `POS/src/composables/useCrashResume.js` (new)
- `POS/src/utils/regional.js` (new)
- `POS/src/composables/useLocale.js` (modified — additive `translate`/`t`/`hasTranslation`)
- `POS/src/composables/useLiveCartRecovery.js` (modified — additive cross-clear hook)
- `POS/tests/crashResume.test.js`, `POS/tests/i18nCoverage.test.js`, `POS/tests/regional.test.js`
- `docs/CRASH_RESUME.md` (this file)