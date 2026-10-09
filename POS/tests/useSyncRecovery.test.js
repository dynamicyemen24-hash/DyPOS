import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import { useSyncRecovery } from "@/composables/useSyncRecovery"

describe("useSyncRecovery", () => {
  it("refuses to retry non-retryable records without calling transport", async () => {
    const pushRecord = vi.fn()
    const state = useSyncRecovery({
      items: ref([{ id: "p1", status: "FAILED" }]),
      pushRecord,
      persistRecord: vi.fn(),
    })
    const result = await state.retry({
      id: "p1",
      item: { id: "p1", status: "FAILED" },
      recovery: { retryable: false },
    })
    expect(result).toBe(false)
    expect(pushRecord).not.toHaveBeenCalled()
    expect(state.errors.value.p1).toContain("تحتاج إلى تصحيح")
  })

  it("persists server-confirmed retry result and preserves payload and idempotency key", async () => {
    const items = ref([{
      id: "p2",
      status: "FAILED",
      payload: { code: "A-2", name: "صنف" },
      idempotencyKey: "same-key",
      recovery: { retryable: true },
    }])
    const original = items.value[0]
    const persistRecord = vi.fn().mockResolvedValue(undefined)
    const pushRecord = vi.fn().mockResolvedValue({ status: "SYNCED", serverId: 22 })
    const state = useSyncRecovery({ items, pushRecord, persistRecord })

    expect(await state.retry({ id: "p2", item: items.value[0], recovery: { retryable: true } })).toBe(true)
    expect(pushRecord).toHaveBeenCalledWith(original)
    expect(persistRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: "p2",
      status: "SYNCED",
      serverId: 22,
      payload: { code: "A-2", name: "صنف" },
      idempotencyKey: "same-key",
    }))
    expect(items.value[0].status).toBe("SYNCED")
    expect(state.busyIds.value).toEqual([])
  })

  it("keeps the original queue record when transport fails", async () => {
    const original = { id: "p3", status: "FAILED", payload: { code: "" }, idempotencyKey: "k3" }
    const items = ref([original])
    const state = useSyncRecovery({
      items,
      pushRecord: vi.fn().mockRejectedValue(new Error("network down")),
      persistRecord: vi.fn(),
    })

    expect(await state.retry({ id: "p3", item: original, recovery: { retryable: true } })).toBe(false)
    expect(items.value[0]).toEqual(original)
    expect(state.errors.value.p3).toBe("network down")
  })

  it("keeps the original queue record when persistence fails after server response", async () => {
    const original = { id: "p5", status: "FAILED", payload: { code: "A-5" }, idempotencyKey: "k5" }
    const items = ref([original])
    const state = useSyncRecovery({
      items,
      pushRecord: vi.fn().mockResolvedValue({ status: "SYNCED", serverId: 25 }),
      persistRecord: vi.fn().mockRejectedValue(new Error("disk unavailable")),
    })

    expect(await state.retry({ id: "p5", item: original, recovery: { retryable: true } })).toBe(false)
    expect(items.value[0]).toEqual(original)
    expect(state.errors.value.p5).toBe("disk unavailable")
    expect(state.busyIds.value).toEqual([])
  })

  it("saves a repaired payload as pending while retaining the queue id and idempotency key", async () => {
    const original = { id: "p4", status: "FAILED", payload: { code: "" }, idempotencyKey: "k4" }
    const items = ref([original])
    const persistRecord = vi.fn().mockResolvedValue(undefined)
    const state = useSyncRecovery({
      items,
      persistRecord,
      openRepair: vi.fn().mockResolvedValue({ payload: { code: "A-4" } }),
    })

    expect(await state.repair({ id: "p4", item: original, recovery: {} })).toBe(true)
    expect(items.value[0]).toMatchObject({
      id: "p4",
      status: "PENDING",
      payload: { code: "A-4" },
      idempotencyKey: "k4",
      recovery: null,
    })
    expect(persistRecord).toHaveBeenCalledWith(items.value[0])
  })
})
