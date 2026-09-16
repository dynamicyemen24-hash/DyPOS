/**
 * =============================================================================
 * DyPOS — Enterprise Lazy Loading
 * =============================================================================
 *
 * Lazy loading عالي الاعتمادية للصور والعناصر الثقيلة.
 *
 * الاستخدام الأساسي:
 * - صور المنتجات
 * - صور العملاء
 * - صور العروض
 * - صور الفواتير
 * - الوسائط داخل القوائم الطويلة
 *
 * المبادئ:
 * - Performance-first
 * - SSR-safe
 * - POS-safe
 * - Network-aware
 * - Retryable
 * - IntersectionObserver-first
 * - Graceful fallback
 * - قابل لإعادة الاستخدام
 *
 * ملاحظة:
 * هذا composable لا يحمّل الصورة بنفسه.
 * هو يدير حالة visibility / loading / loaded / error.
 * يمكن للمكوّن ربط `isVisible` مع src الفعلي للصورة.
 * =============================================================================
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

/**
 * @typedef {Object} LazyLoadOptions
 * @property {string} [rootMargin="200px 0px"]
 * @property {number|number[]} [threshold=0.01]
 * @property {Element|null|import("vue").Ref<Element|null>} [root=null]
 * @property {boolean} [once=true]
 * @property {boolean} [disabled=false]
 * @property {boolean} [respectReducedMotion=false]
 * @property {boolean} [respectSaveData=true]
 * @property {boolean} [loadOnSlowConnection=true]
 * @property {boolean} [immediate=false]
 * @property {boolean} [autoTrack=true]
 * @property {number} [retryLimit=2]
 * @property {number} [retryDelay=800]
 */

/**
 * @param {LazyLoadOptions} options
 */
export function useLazyLoad(options = {}) {
	const {
		rootMargin = "200px 0px",
		threshold = 0.01,
		root = null,

		once = true,
		disabled = false,

		respectReducedMotion = false,
		respectSaveData = true,
		loadOnSlowConnection = true,

		immediate = false,
		autoTrack = true,

		retryLimit = 2,
		retryDelay = 800,
	} = options

	/**
	 * -------------------------------------------------------------------------
	 * State
	 * -------------------------------------------------------------------------
	 */

	const targetRef = ref(null)

	const isVisible = ref(false)
	const isLoading = ref(false)
	const isLoaded = ref(false)

	const error = ref(null)

	const retryCount = ref(0)

	const hasStarted = ref(false)
	const hasFinished = ref(false)

	let observer = null
	let retryTimer = null

	/**
	 * -------------------------------------------------------------------------
	 * Environment
	 * -------------------------------------------------------------------------
	 */

	const isBrowser = computed(
		() => typeof window !== "undefined" && typeof document !== "undefined",
	)

	const shouldLoadImmediately = computed(() => {
		if (disabled) {
			return false
		}

		if (!isBrowser.value) {
			return false
		}

		if (immediate) {
			return true
		}

		/**
		 * Respect user's reduced-motion preference only when explicitly
		 * requested by the consumer.
		 *
		 * Lazy loading itself is not an animation, so this is opt-in.
		 */
		if (
			respectReducedMotion &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
		) {
			return true
		}

		/**
		 * Save-Data:
		 *
		 * We still load the image because visibility is normally required
		 * for the POS product experience. Consumers can use this state
		 * to select a smaller asset.
		 */
		if (respectSaveData && navigator.connection?.saveData) {
			return false
		}

		return false
	})

	/**
	 * -------------------------------------------------------------------------
	 * Network hints
	 * -------------------------------------------------------------------------
	 */

	const connectionInfo = computed(() => {
		if (!isBrowser.value) {
			return null
		}

		return (
			navigator.connection ||
			navigator.mozConnection ||
			navigator.webkitConnection ||
			null
		)
	})

	const isSlowConnection = computed(() => {
		if (!loadOnSlowConnection) {
			return false
		}

		const connection = connectionInfo.value

		if (!connection) {
			return false
		}

		const effectiveType = connection.effectiveType

		return effectiveType === "slow-2g" || effectiveType === "2g"
	})

	/**
	 * -------------------------------------------------------------------------
	 * Lifecycle helpers
	 * -------------------------------------------------------------------------
	 */

	function clearRetryTimer() {
		if (retryTimer) {
			window.clearTimeout(retryTimer)
			retryTimer = null
		}
	}

	function disconnectObserver() {
		if (!observer) {
			return
		}

		observer.disconnect()
		observer = null
	}

	function cleanup() {
		disconnectObserver()
		clearRetryTimer()
	}

	/**
	 * -------------------------------------------------------------------------
	 * Mark visible
	 * -------------------------------------------------------------------------
	 */

	function markVisible() {
		if (disabled) {
			return
		}

		if (once && hasStarted.value) {
			return
		}

		isVisible.value = true
		hasStarted.value = true

		if (once) {
			disconnectObserver()
		}
	}

	/**
	 * -------------------------------------------------------------------------
	 * Loading lifecycle
	 * -------------------------------------------------------------------------
	 *
	 * The actual image element should call:
	 *
	 *   lazy.startLoading()
	 *   lazy.markLoaded()
	 *   lazy.markError(error)
	 *
	 * This separation prevents the composable from being coupled to HTMLImageElement.
	 */

	function startLoading() {
		if (disabled || isLoaded.value) {
			return false
		}

		isLoading.value = true
		error.value = null

		return true
	}

	function markLoaded() {
		isLoading.value = false
		isLoaded.value = true
		hasFinished.value = true
		error.value = null
		retryCount.value = 0

		clearRetryTimer()

		if (once) {
			disconnectObserver()
		}
	}

	function markError(reason = null) {
		isLoading.value = false
		isLoaded.value = false
		hasFinished.value = true

		error.value =
			reason instanceof Error ? reason : new Error(reason || "فشل تحميل المورد")

		if (retryCount.value < retryLimit && isVisible.value) {
			scheduleRetry()
		}
	}

	/**
	 * -------------------------------------------------------------------------
	 * Retry
	 * -------------------------------------------------------------------------
	 */

	function scheduleRetry() {
		clearRetryTimer()

		const attempt = retryCount.value + 1

		retryCount.value = attempt

		const delay = Math.max(0, retryDelay * 2 ** (attempt - 1))

		retryTimer = window.setTimeout(() => {
			retryTimer = null

			if (disabled || isLoaded.value || !isVisible.value) {
				return
			}

			error.value = null
			hasFinished.value = false

			startLoading()
		}, delay)
	}

	function retry() {
		if (disabled || isLoaded.value) {
			return false
		}

		clearRetryTimer()

		if (retryCount.value >= retryLimit) {
			retryCount.value = 0
		}

		error.value = null
		hasFinished.value = false

		if (!isVisible.value) {
			markVisible()
		}

		return startLoading()
	}

	/**
	 * -------------------------------------------------------------------------
	 * Reset
	 * -------------------------------------------------------------------------
	 */

	function reset() {
		cleanup()

		isVisible.value = false
		isLoading.value = false
		isLoaded.value = false

		error.value = null

		retryCount.value = 0

		hasStarted.value = false
		hasFinished.value = false

		if (isBrowser.value && autoTrack && !disabled) {
			setupObserver()
		}
	}

	/**
	 * -------------------------------------------------------------------------
	 * Resolve root
	 * -------------------------------------------------------------------------
	 */

	function resolveRoot() {
		if (!root) {
			return null
		}

		if (typeof root === "object" && "value" in root) {
			return root.value || null
		}

		return root
	}

	/**
	 * -------------------------------------------------------------------------
	 * IntersectionObserver
	 * -------------------------------------------------------------------------
	 */

	function setupObserver() {
		disconnectObserver()

		if (!isBrowser.value || disabled || immediate || !autoTrack) {
			return
		}

		const target = targetRef.value

		if (!target) {
			return
		}

		/**
		 * Older / embedded POS WebViews may not expose
		 * IntersectionObserver.
		 */
		if (typeof window.IntersectionObserver !== "function") {
			markVisible()
			return
		}

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting || entry.intersectionRatio > 0) {
						markVisible()

						if (once) {
							disconnectObserver()
						}

						break
					}
				}
			},
			{
				root: resolveRoot(),
				rootMargin,
				threshold,
			},
		)

		observer.observe(target)
	}

	/**
	 * -------------------------------------------------------------------------
	 * Target changes
	 * -------------------------------------------------------------------------
	 */

	watch(
		targetRef,
		() => {
			if (!isBrowser.value) {
				return
			}

			if (disabled) {
				cleanup()
				return
			}

			if (shouldLoadImmediately.value) {
				markVisible()
				return
			}

			setupObserver()
		},
		{
			flush: "post",
		},
	)

	/**
	 * -------------------------------------------------------------------------
	 * Immediate mode
	 * -------------------------------------------------------------------------
	 */

	if (immediate) {
		isVisible.value = true
		hasStarted.value = true
	}

	/**
	 * -------------------------------------------------------------------------
	 * Mount
	 * -------------------------------------------------------------------------
	 */

	onMounted(() => {
		if (disabled) {
			return
		}

		if (shouldLoadImmediately.value) {
			markVisible()
			return
		}

		setupObserver()
	})

	/**
	 * -------------------------------------------------------------------------
	 * Unmount
	 * -------------------------------------------------------------------------
	 */

	onBeforeUnmount(() => {
		cleanup()
	})

	/**
	 * -------------------------------------------------------------------------
	 * Derived state
	 * -------------------------------------------------------------------------
	 */

	const hasError = computed(() => Boolean(error.value))

	const canRetry = computed(
		() => hasError.value && retryCount.value < retryLimit,
	)

	const isIdle = computed(
		() =>
			!isVisible.value && !isLoading.value && !isLoaded.value && !error.value,
	)

	const isComplete = computed(
		() =>
			isLoaded.value ||
			(hasFinished.value && Boolean(error.value) && !canRetry.value),
	)

	/**
	 * -------------------------------------------------------------------------
	 * Public API
	 * -------------------------------------------------------------------------
	 */

	return {
		// DOM
		targetRef,

		// State
		isVisible,
		isLoading,
		isLoaded,
		error,

		// Lifecycle state
		hasStarted,
		hasFinished,
		hasError,
		isIdle,
		isComplete,

		// Network
		isSlowConnection,
		connectionInfo,

		// Retry
		retryCount,
		canRetry,

		// Actions
		markVisible,
		startLoading,
		markLoaded,
		markError,
		retry,
		reset,

		// Observer
		setupObserver,
		disconnectObserver,
	}
}
