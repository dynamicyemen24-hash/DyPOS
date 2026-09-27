/**
 * DyPOS UI Kit — declarative page metadata (document title + favicon).
 *
 * Screens declare `pageMeta()`; the plugin watches it and keeps `<title>` and
 * the brand favicon in sync. Everything is best-effort: a throwing `pageMeta()`
 * must never break a screen.
 */
import { getCurrentInstance, onBeforeUnmount, watch } from "vue"

/** @type {HTMLLinkElement|null} */
let faviconRef = null
/** @type {string|null} */
let defaultFavIcon = null

function ensureFavicon() {
	if (typeof document === "undefined" || faviconRef) return
	faviconRef = document.querySelector('link[rel="icon"]')
	defaultFavIcon = faviconRef?.href || null
}

function applyFavicon(meta) {
	ensureFavicon()
	if (!faviconRef) return
	if (meta.emoji) {
		const encoded = encodeURIComponent(meta.emoji)
		faviconRef.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${encoded}</text></svg>`
	} else if (meta.icon) {
		faviconRef.href = meta.icon
	} else if (defaultFavIcon) {
		faviconRef.href = defaultFavIcon
	}
}

/**
 * Watch a page-meta factory and apply it to the document.
 *
 * @param {() => ({ title?: string, emoji?: string, icon?: string }|null|undefined)} fn
 * @returns {() => void} stop handle
 */
export function usePageMeta(fn) {
	if (typeof window !== "undefined") ensureFavicon()

	const stop = watch(
		() => {
			try {
				return fn()
			} catch {
				return null
			}
		},
		(meta) => {
			if (typeof document === "undefined" || !meta) return
			if (meta.title) document.title = meta.title
			applyFavicon(meta)
		},
		{ immediate: true, deep: true },
	)

	if (getCurrentInstance()) onBeforeUnmount(stop)
	return stop
}

export default {
	install(app) {
		app.mixin({
			mounted() {
				if (typeof this.$options.pageMeta === "function") {
					this._pageMetaStop = usePageMeta(this.$options.pageMeta.bind(this))
				}
			},
			beforeUnmount() {
				this._pageMetaStop?.()
				this._pageMetaStop = null
			},
		})
	},
}
