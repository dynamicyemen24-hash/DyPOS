/**
 * usePaginatedQuery — keyset/offset pagination الموحدة للواجهة (world-class lists).
 *
 * المشكلة القديمة: كل قائمة (عملاء/فواتير/أصناف) تعيد اختراع العجلة:
 * offset فقط، بلا hasMore موحد، بلا cursor، بلا dedupe، بلا إلغاء طلبات قديمة.
 *
 * هذا الـ composable يوحد الخوارزمية:
 * - offset + limit مقيد + hasMore + nextCursor
 * - dedupe عبر id، إلغاء stale responses عبر requestSeq
 * - append (infinite scroll) أو replace (filter change)
 * - virtualization-ready: يعرض فقط النافذة عبر useWindowedList/useVirtualGrid
 */

import { computed, ref } from "vue"

export function usePaginatedQuery(fetcher, opts = {}) {
	const { limit = 50, maxLimit = 200 } = opts
	const items = ref([])
	const total = ref(null)
	const offset = ref(0)
	const hasMore = ref(false)
	const nextCursor = ref(null)
	const isLoading = ref(false)
	const isLoadingMore = ref(false)
	const error = ref(null)
	let requestSeq = 0

	const safeLimit = computed(() =>
		Math.min(Math.max(Number(limit) || 50, 1), maxLimit),
	)

	async function load(params = {}, mode = "replace") {
		const seq = ++requestSeq
		if (mode === "replace") isLoading.value = true
		else isLoadingMore.value = true
		error.value = null
		try {
			const res = await fetcher({
				...params,
				limit: safeLimit.value,
				offset: mode === "append" ? offset.value : 0,
			})
			if (seq !== requestSeq) return null // stale — تجاهل
			const rows =
				res?.rows ??
				res?.items ??
				res?.customers ??
				res?.invoices ??
				res?.data ??
				[]
			const ids = new Set(
				mode === "append" ? items.value.map((r) => r.id ?? r.name) : [],
			)
			const fresh = []
			for (const r of rows) {
				const k = r.id ?? r.name ?? JSON.stringify(r)
				if (!ids.has(k)) {
					ids.add(k)
					fresh.push(r)
				}
			}
			items.value = mode === "append" ? [...items.value, ...fresh] : fresh
			total.value = res?.total ?? null
			offset.value = (mode === "append" ? offset.value : 0) + rows.length
			hasMore.value = res?.hasMore ?? rows.length === safeLimit.value
			nextCursor.value =
				res?.nextCursor ??
				(rows.length ? (rows[rows.length - 1]?.id ?? null) : null)
			return res
		} catch (e) {
			if (seq !== requestSeq) return null
			error.value = e
			throw e
		} finally {
			if (seq === requestSeq) {
				isLoading.value = false
				isLoadingMore.value = false
			}
		}
	}

	const loadMore = (params = {}) =>
		hasMore.value && !isLoadingMore.value
			? load(params, "append")
			: Promise.resolve(null)
	const refresh = (params = {}) => load(params, "replace")
	const reset = () => {
		requestSeq++
		items.value = []
		total.value = null
		offset.value = 0
		hasMore.value = false
		nextCursor.value = null
		error.value = null
	}

	return {
		items,
		total,
		offset,
		hasMore,
		nextCursor,
		isLoading,
		isLoadingMore,
		error,
		load,
		loadMore,
		refresh,
		reset,
		limit: safeLimit,
	}
}

export default usePaginatedQuery
