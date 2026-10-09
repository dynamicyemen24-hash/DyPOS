/**
 * DyPOS UI Kit — public surface.
 *
 * Owned by the product, not by a vendor. Every export here is first-party Vue 3
 * code backed by the DyPOS design tokens, so:
 *
 *  - the offline PWA precaches a few KB instead of a 290 KB vendor bundle that
 *    shipped a WYSIWYG editor, an icon font and 4 chart engines nobody used;
 *  - there is no third-party supply-chain surface in the cashier's browser;
 *  - the API is stable and documented, and every behavioural quirk is a
 *    deliberate decision (see the individual modules).
 */

// ── Components ────────────────────────────────────────────────────────────
export { default as Alert } from "./src/components/Alert.vue"
export { default as Badge } from "./src/components/Badge.vue"
export { default as Button } from "./src/components/Button.vue"
export { default as ActionButton } from "./src/components/ActionButton.vue"
export { default as Card } from "./src/components/Card.vue"
export { default as Checkbox } from "./src/components/Checkbox.vue"
export { default as Combobox } from "./src/components/Combobox.vue"
export { default as Dialog } from "./src/components/Dialog.vue"
export { default as Drawer } from "./src/components/Drawer.vue"
export { default as ErrorMessage } from "./src/components/ErrorMessage.vue"
export { default as FeatherIcon } from "./src/components/FeatherIcon.vue"
export { default as FormControl } from "./src/components/FormControl.vue"
export { default as FormLabel } from "./src/components/FormLabel.vue"
export { default as Input } from "./src/components/Input.vue"
export { default as LoadingIndicator } from "./src/components/LoadingIndicator.vue"
export { default as LoadingText } from "./src/components/LoadingText.vue"
export { default as SelectInput } from "./src/components/SelectInput.vue"
export { default as Textarea } from "./src/components/Textarea.vue"
export { default as TextInput } from "./src/components/TextInput.vue"

// ── Data layer ────────────────────────────────────────────────────────────
export {
	createResource,
	getCachedResource,
	getCacheKey,
} from "./src/resources/resources.js"
export { default as resourcesPlugin } from "./src/resources/plugin.js"
export { deleteLocal, getLocal, saveLocal } from "./src/utils/localCache.js"

// ── Transport ─────────────────────────────────────────────────────────────
export {
	buildHeaders,
	buildServerError,
	buildTransportError,
	call,
	createOfflineError,
	METHOD_PREFIX,
	request,
	resolveUrl,
	setRuntimeApiBaseResolver,
	unwrapEnvelope,
} from "./src/utils/request.js"
export { getConfig, setConfig } from "./src/utils/config.js"

// ── Vue plugins ───────────────────────────────────────────────────────────
export {
	default as pageMetaPlugin,
	usePageMeta,
} from "./src/utils/pageMeta.js"

// ── Utilities ─────────────────────────────────────────────────────────────
export { debounce } from "./src/utils/debounce.js"
export { useId } from "./src/utils/useId.js"
