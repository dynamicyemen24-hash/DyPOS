import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
	const store = {
		getCheckpoint: vi.fn(async () => 0),
		setCheckpoint: vi.fn(async () => {}),
		markLastSync: vi.fn(async () => {}),
		getLastSync: vi.fn(async () => null),
		pendingOperations: vi.fn(async () => []),
		getQueueCount: vi.fn(async () => 0),
		applyRemoteChanges: vi.fn(async () => ({ applied: [], conflicts: [] })),
		recordConflict: vi.fn(async () => {}),
		markSynced: vi.fn(async () => {}),
		markFailed: vi.fn(async () => {}),
		audit: vi.fn(async () => {}),
		validateForSync: vi.fn(() => {}),
	}

	const SyncProtocolStub = class SyncProtocolStub {
		get = vi.fn()
		post = vi.fn()
	}

	return {
		store,
		SyncProtocolStub,
		getValidToken: vi.fn(),
		authState: { tenantId: "t_1", employeeId: "e_1" },
		validateBeforeSync: vi.fn(() => ({ ok: true })),
	}
})

vi.mock("@/services/sync-auth", () => ({
	getValidToken: mocks.getValidToken,
	authState: mocks.authState,
}))

vi.mock("@/services/sync-protocol", () => ({
	SyncProtocol: mocks.SyncProtocolStub,
}))

vi.mock("@/services/offline-store", () => ({
	default: mocks.store,
}))

vi.mock("@/services/sync-validator", () => ({
	validateBeforeSync: mocks.validateBeforeSync,
}))

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

import { runSyncCycle, getLastSyncCheckpoint } from "@/services/sync-core"
import { SyncError, SyncErrorKind } from "@/services/sync-error"

const { store, getValidToken } = mocks

function makeProtocol() {
	return new mocks.SyncProtocolStub()
}

beforeEach(() => {
	vi.clearAllMocks()
	store.getCheckpoint.mockResolvedValue(0)
	store.applyRemoteChanges.mockResolvedValue({ applied: [], conflicts: [] })
	store.pendingOperations.mockResolvedValue([])
	getValidToken.mockReset()
	mocks.validateBeforeSync.mockReturnValue({ ok: true })
})

describe("runSyncCycle", () => {
	it("rejects with AUTH_REQUIRED when no platform token is available", async () => {
		getValidToken.mockRejectedValue(
			new SyncError(SyncErrorKind.AUTH_REQUIRED, "no token"),
		)

		await expect(
			runSyncCycle({ protocol: makeProtocol(), store }),
		).rejects.toThrowError(SyncError)

		expect(store.setCheckpoint).not.toHaveBeenCalled()
	})

	it("pulls changes and advances the checkpoint", async () => {
		getValidToken.mockResolvedValue("token")
		store.getCheckpoint.mockResolvedValue(1000)
		store.applyRemoteChanges.mockResolvedValue({
			applied: [{ id: "C1" }],
			conflicts: [],
		})

		const protocol = makeProtocol()
		protocol.get.mockResolvedValue({
			changes: [
				{
					entityType: "customer",
					id: "C1",
					data: { id: "C1", code: "C1", name: "Ali" },
					updatedAt: "2026-02-01T00:00:00Z",
				},
			],
			server_time: "2026-02-01T12:00:00Z",
		})

		const result = await runSyncCycle({ protocol, store })

		expect(result.pulled).toBe(1)
		expect(result.conflicts).toBe(0)
		expect(store.setCheckpoint).toHaveBeenCalled()
		expect(store.markLastSync).toHaveBeenCalled()
		expect(protocol.get).toHaveBeenCalledWith(
			"/api/sync/pull",
			expect.objectContaining({ since: 1000 }),
		)
	})

	it("pushes pending operations and auto-resolves remote conflicts", async () => {
		getValidToken.mockResolvedValue("token")
		store.pendingOperations.mockResolvedValue([
			{
				id: 7,
				entityType: "invoice",
				entityId: "INV-1",
				operation: "create",
				payload: { total: 50, _localRev: "r1" },
				createdAt: "2026-02-01T00:00:00Z",
			},
		])

		const protocol = makeProtocol()
		protocol.post.mockRejectedValue(
			new SyncError(SyncErrorKind.REMOTE_CONFLICT, "diverged", {
				remote_rev: "r2",
			}),
		)

		const result = await runSyncCycle({ protocol, store })

		expect(result.conflicts).toBe(1)
		expect(store.recordConflict).toHaveBeenCalled()
		expect(store.markSynced).toHaveBeenCalledWith(7, "INV-1")
		expect(protocol.post).toHaveBeenCalledWith(
			"/api/sync/push",
			expect.objectContaining({ entity_id: "INV-1" }),
		)
	})

	it("survives a failed pull when the push succeeded", async () => {
		getValidToken.mockResolvedValue("token")
		store.getCheckpoint.mockResolvedValue(500)

		const protocol = makeProtocol()
		protocol.get.mockRejectedValue(
			new SyncError(SyncErrorKind.NETWORK_UNAVAILABLE, "offline"),
		)

		const result = await runSyncCycle({ protocol, store })

		expect(result.pulled).toBe(0)
		expect(result.pushed).toBe(0)
		expect(result.checkpoint).toBeGreaterThan(0)
		expect(store.setCheckpoint).toHaveBeenCalled()
	})

	it("permanently fails locally invalid rows instead of aborting the cycle", async () => {
		getValidToken.mockResolvedValue("token")
		store.pendingOperations.mockResolvedValue([
			{
				id: 9,
				entityType: "invoice",
				entityId: "INV-9",
				operation: "create",
				payload: {},
				createdAt: "2026-02-01T00:00:00Z",
			},
		])
		mocks.validateBeforeSync.mockImplementation(() => {
			throw new SyncError(
				SyncErrorKind.LOCAL_VALIDATION_FAILED,
				"missing total",
			)
		})

		const protocol = makeProtocol()

		const result = await runSyncCycle({ protocol, store })

		expect(store.markFailed).toHaveBeenCalledWith(9, "missing total")
		expect(store.audit).toHaveBeenCalled()
		expect(result.pushed).toBe(0)
		expect(protocol.post).not.toHaveBeenCalled()
	})
})

describe("getLastSyncCheckpoint", () => {
	it("delegates to the store", async () => {
		store.getCheckpoint.mockResolvedValue(42)
		await expect(getLastSyncCheckpoint()).resolves.toBe(42)
	})
})
