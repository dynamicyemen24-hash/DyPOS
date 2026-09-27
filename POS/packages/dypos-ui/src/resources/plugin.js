/**
 * DyPOS UI Kit — resources plugin.
 *
 * Adds the declarative `resources` component option plus the `$resources`
 * helpers. Kept because src/main.js installs it and screens may declare
 * `resources: { … }`; the POS itself mostly uses `createResource()` directly.
 */
import { reactive, watch } from "vue"
import { createResource, getCachedResource } from "./resources.js"

const resourcesMixin = {
	created() {
		const declared = this.$options.resources
		if (!declared) return
		this._resources = reactive({})
		for (const key of Object.keys(declared)) {
			const options = declared[key]
			if (typeof options === "function") {
				watch(
					() => {
						try {
							return options.call(this)
						} catch {
							return null
						}
					},
					(next, previous) => {
						if (!next) return
						const changed =
							!previous || JSON.stringify(next) !== JSON.stringify(previous)
						if (!changed) return
						this._resources[key] = createResource(next, this)
					},
					{ immediate: true, deep: true },
				)
			} else {
				this._resources[key] = createResource(options, this)
			}
		}
	},
	methods: {
		$getResource(cacheKey) {
			return getCachedResource(cacheKey)
		},
		$refetchResource(cacheKey) {
			const resource = this.$getResource(cacheKey)
			resource?.fetch?.()
		},
	},
	computed: {
		$resources() {
			return this._resources
		},
	},
}

export default {
	install(app) {
		app.mixin(resourcesMixin)
	},
}
