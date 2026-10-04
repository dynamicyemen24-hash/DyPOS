/**
 * The login page's public contract.
 *
 * ## Why this is a module and not inline `defineProps`
 *
 * Two reasons, and the second is the real one.
 *
 * The first is size: `Login.vue` sits at the tightest file-size cap in the
 * tree, and the ratchet's answer to "the page must grow" is "extract the
 * behaviour", not "raise the number".
 *
 * The second is that a prop list is the one part of a page that is read from
 * OUTSIDE — the parent passes these, and tests assert on them — but it was
 * invisible to every existing gate because it lived inside a component that
 * costs 1700 lines to mount. Extracting it makes it assertable, which is how
 * a default that silently flips (`showTenantContext: true` becoming `false`)
 * gets caught without booting the app.
 *
 * ## Defaults are behaviour, not documentation
 *
 * `showTenantContext`, `showOfflineReadiness` and `rememberEmail` all default
 * to `true`. A deployment that wants them off must pass `false` explicitly —
 * the safe direction is "on", so a parent that forgets a prop still shows the
 * full login surface rather than silently dropping the tenant chips.
 */
export const LOGIN_PROPS = Object.freeze({
	tenantName: { type: String, default: "" },
	branchName: { type: String, default: "" },
	posName: { type: String, default: "" },
	showTenantContext: { type: Boolean, default: true },
	showOfflineReadiness: { type: Boolean, default: true },
	rememberEmail: { type: Boolean, default: true },
})

/**
 * Events the page emits: a completed sign-in, a ready runtime, a handled error.
 *
 * `ready` is separate from `authenticated` on purpose — the shell waits for
 * `ready` before probing devices, and probing on `authenticated` would race the
 * session bootstrap.
 */
export const LOGIN_EMITS = Object.freeze(["authenticated", "ready", "error"])

export default LOGIN_PROPS
