import { computed, ref, unref } from "vue"

/**
 * Host-side orchestration for SyncRecoveryPanel.
 *
 * The host must provide the real outbox persistence and transport callbacks.
 * No record is removed or marked successful unless both the server response
 * and the persistence callback succeed.
 */
export function useSyncRecovery({
  items,
  pushRecord,
  persistRecord,
  openRepair,
  openResource,
  openReview,
}) {
  const busyIds = ref([])
  const errors = ref({})
  const records = computed(() => unref(items) || [])

  const isBusy = id => busyIds.value.includes(String(id))
  const setBusy = (id, busy) => {
    const key = String(id)
    busyIds.value = busy
      ? [...new Set([...busyIds.value, key])]
      : busyIds.value.filter(value => value !== key)
  }

  const replaceRecord = async (id, nextRecord) => {
    await persistRecord(nextRecord)
    if (Array.isArray(items)) {
      const index = items.findIndex(record => String(record.id) === String(id))
      if (index >= 0) items.splice(index, 1, nextRecord)
    } else if (items && typeof items.value !== "undefined" && Array.isArray(items.value)) {
      const index = items.value.findIndex(record => String(record.id) === String(id))
      if (index >= 0) items.value.splice(index, 1, nextRecord)
    }
    errors.value = { ...errors.value }
    delete errors.value[String(id)]
  }

  const retry = async ({ id, item, recovery = item?.recovery || {} }) => {
    if (!recovery.retryable) {
      errors.value = { ...errors.value, [String(id)]: "هذه العملية تحتاج إلى تصحيح أو مراجعة قبل إعادة المحاولة." }
      return false
    }
    if (isBusy(id)) return false
    setBusy(id, true)
    try {
      const result = await pushRecord(item)
      const updated = {
        ...item,
        ...result,
        id: item.id,
        payload: result?.payload ?? item.payload,
        idempotencyKey: result?.idempotencyKey ?? item.idempotencyKey,
      }
      await replaceRecord(id, updated)
      return true
    } catch (error) {
      errors.value = {
        ...errors.value,
        [String(id)]: error?.message || "تعذّرت إعادة المحاولة. بقي السجل محفوظًا في قائمة الانتظار.",
      }
      return false
    } finally {
      setBusy(id, false)
    }
  }

  const repair = async context => {
    if (isBusy(context.id) || typeof openRepair !== "function") return false
    setBusy(context.id, true)
    try {
      const corrected = await openRepair(context.item, context.recovery || {})
      if (!corrected) return false
      // Keep the original queue identity and idempotency key unless the host
      // explicitly returns a replacement payload; never mutate the old record.
      const next = {
        ...context.item,
        ...corrected,
        id: context.item.id,
        idempotencyKey: context.item.idempotencyKey,
        status: "PENDING",
        error: null,
        recovery: null,
      }
      await persistRecord(next)
      if (Array.isArray(items)) {
        const index = items.findIndex(record => String(record.id) === String(context.id))
        if (index >= 0) items.splice(index, 1, next)
      } else if (items && typeof items.value !== "undefined" && Array.isArray(items.value)) {
        const index = items.value.findIndex(record => String(record.id) === String(context.id))
        if (index >= 0) items.value.splice(index, 1, next)
      }
      return true
    } catch (error) {
      errors.value = {
        ...errors.value,
        [String(context.id)]: error?.message || "تعذّر حفظ التصحيح؛ لم يُحذف السجل الأصلي.",
      }
      return false
    } finally {
      setBusy(context.id, false)
    }
  }

  const routeAction = async (callback, context) => {
    if (typeof callback !== "function") return false
    try {
      await callback(context.item, context.recovery || {})
      return true
    } catch (error) {
      errors.value = {
        ...errors.value,
        [String(context.id)]: error?.message || "تعذّر فتح مسار المعالجة.",
      }
      return false
    }
  }

  const handleRetry = context => retry(context)
  const handleRepair = context => repair(context)
  const handleOpenResource = context => routeAction(openResource, context)
  const handleReview = context => routeAction(openReview, context)

  return {
    records,
    busyIds,
    errors,
    retry,
    repair,
    handleRetry,
    handleRepair,
    handleOpenResource,
    handleReview,
  }
}
