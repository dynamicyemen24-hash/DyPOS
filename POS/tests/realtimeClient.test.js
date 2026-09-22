import { beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("@/services/sync-manager", () => ({
	syncState: { isOnline: false },
	runSyncCycleSilently: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/services/sync-auth", () => ({
	getEffectiveToken: () => "mock-token",
	authState: { authenticated: true },
}))

import { createPinia, setActivePinia } from "pinia"
import {
	RealtimeClient,
	createRealtimeClient,
	backoffDelay,
} from "@/sync/realtimeClient"
import {
	useRealtimeStore,
	registerRealtimeSync,
	resetRealtimeSync,
	resolveScope,
	EVENT_LOG_LIMIT,
} from "@/stores/realtime"

class FakeEventSource {
	static instances = []

	constructor(url) {
		this.url = url
		this.listeners = { open: [], message: [], error: [] }
		this.readyState = 0
		this.closed = false
		FakeEventSource.instances.push(this)
	}

	addEventListener(type, fn) {
		this.listeners[type].push(fn)
	}

	removeEventListener(type, fn) {
		const list = this.listeners[type]
		const i = list.indexOf(fn)
		if (i >= 0) list.splice(i, 1)
	}

	close() {
		this.closed = true
		this.readyState = 2
	}

	fireOpen() {
		this.readyState = 1
		for (const fn of this.listeners.open) fn({})
	}

	fireMessage(data) {
		for (const fn of this.listeners.message) fn({ data: JSON.stringify(data) })
	}

	fireError() {
		for (const fn of this.listeners.error) fn({})
	}
}

describe("backoffDelay", () => {
	it("grows exponentially from the initial value", () => {
		expect(backoffDelay(1)).toBe(1000)
		expect(backoffDelay(2)).toBe(2000)
		expect(backoffDelay(3)).toBe(4000)
		expect(backoffDelay(4)).toBe(8000)
	})

	it("caps at maxMs and never below initialMs", () => {
		expect(backoffDelay(7, 1000, 60000)).toBe(60000)
		expect(backoffDelay(100, 500, 30000)).toBe(30000)
		expect(backoffDelay(0)).toBe(1000)
		expect(backoffDelay(-3)).toBe(1000)
	})
})

describe("RealtimeClient", () => {
	beforeEach(() => {
		FakeEventSource.instances.length = 0
		vi.useRealTimers()
	})

	it("is disabled when no EventSource is available", () => {
		const client = new RealtimeClient({
			EventSourceCtor: null,
			url: "http://h/api/realtime/events",
		})
		expect(client.status).toBe("disabled")
		client.connect()
		expect(FakeEventSource.instances).toHaveLength(0)
		client.dispose()
	})

	it("stays offline until the browser comes back online", () => {
		const offline = { value: true }
		const client = new RealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			isOffline: () => offline.value,
		})
		client.connect()
		expect(client.status).toBe("offline")
		expect(FakeEventSource.instances).toHaveLength(0)

		offline.value = false
		window.dispatchEvent(new Event("online"))
		expect(FakeEventSource.instances).toHaveLength(1)
		FakeEventSource.instances[0].fireOpen()
		expect(client.status).toBe("connected")
		client.dispose()
	})

	it("dispatches parsed events, tracks lastEventId and supports an unsubscribe", () => {
		const seen = []
		const all = []
		const client = new RealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			isOffline: () => false,
		})
		client.connect()
		const es = FakeEventSource.instances[0]
		es.fireOpen()
		const offTopic = client.onChange("stock.changed", (payload) =>
			seen.push(payload),
		)
		client.onChange("*", (_payload, event) => all.push(event))

		es.fireMessage({
			id: 1,
			topic: "stock.changed",
			tenantId: null,
			at: "t",
			payload: { productId: "P1" },
		})
		es.fireMessage({
			id: 2,
			topic: "invoice.paid",
			tenantId: null,
			at: "t",
			payload: { id: 9 },
		})

		expect(client.lastEventId).toBe(2)
		expect(seen).toEqual([{ productId: "P1" }])
		expect(all).toHaveLength(2)

		offTopic()
		es.fireMessage({
			id: 3,
			topic: "stock.changed",
			tenantId: null,
			at: "t",
			payload: { x: 1 },
		})
		expect(seen).toHaveLength(1)
		client.dispose()
	})

	it("backs off, rebuilds and forwards lastEventId + token in the URL", () => {
		vi.useFakeTimers()
		const token = vi.fn(() => "abc123")
		const client = new RealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			getToken: token,
			isOffline: () => false,
		})
		client.connect()
		const es = FakeEventSource.instances[0]
		es.fireOpen()
		es.fireMessage({
			id: 7,
			topic: "stock.changed",
			tenantId: null,
			at: "t",
			payload: {},
		})

		es.fireError()
		expect(client.status).toBe("error")
		expect(es.closed).toBe(true)
		expect(client.attempts).toBe(1)
		expect(client.lastEventId).toBe(7)

		vi.advanceTimersByTime(999)
		expect(FakeEventSource.instances).toHaveLength(1)
		vi.advanceTimersByTime(1)
		expect(FakeEventSource.instances).toHaveLength(2)

		const rebuilt = FakeEventSource.instances[1]
		const rebuiltUrl = new URL(rebuilt.url)
		expect(rebuiltUrl.searchParams.get("lastEventId")).toBe("7")
		expect(rebuiltUrl.searchParams.get("token")).toBe("abc123")

		rebuilt.fireOpen()
		expect(client.status).toBe("connected")
		expect(client.attempts).toBe(0)
		client.dispose()
	})

	it("dispose() stops retrying and unsubscribes everything", () => {
		vi.useFakeTimers()
		const client = createRealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			isOffline: () => false,
		})
		client.connect()
		client.onChange("stock.changed", () => {})
		FakeEventSource.instances[0].fireError()
		client.dispose()
		vi.advanceTimersByTime(60_000)
		expect(FakeEventSource.instances).toHaveLength(1)
	})
})

describe("realtime store", () => {
	beforeEach(() => {
		FakeEventSource.instances.length = 0
		resetRealtimeSync()
		setActivePinia(createPinia())
	})

	it("logs events, bumps the matching scope and exposes invalidation versions", () => {
		const store = useRealtimeStore()
		const client = new RealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			isOffline: () => false,
		})
		store.attach(client)
		client.connect()
		const es = FakeEventSource.instances[0]
		es.fireOpen()
		expect(store.connectionState).toBe("connected")
		expect(store.connectedAt).toBeTruthy()

		es.fireMessage({
			id: 1,
			topic: "stock.changed",
			tenantId: "T1",
			at: "now",
			payload: { productId: "P1" },
		})
		expect(store.eventLog).toHaveLength(1)
		expect(store.eventLog[0].topic).toBe("stock.changed")
		expect(store.invalidators.stock).toBe(1)
		expect(store.getInvalidation("stock")).toEqual({ stock: 1 })

		es.fireMessage({
			id: 2,
			topic: "invoice.paid",
			tenantId: "T1",
			at: "now",
			payload: { id: 9 },
		})
		expect(store.invalidators.invoices).toBe(1)
		expect(store.getInvalidation("invoices")).toEqual({ invoices: 1 })
		expect(store.lastEventId).toBe(2)

		store.wipe()
		expect(store.eventLog).toHaveLength(0)
		expect(store.invalidators.stock).toBe(0)
		client.dispose()
	})

	it("caps the event log at EVENT_LOG_LIMIT, newest first", () => {
		const store = useRealtimeStore()
		const client = new RealtimeClient({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
			isOffline: () => false,
		})
		store.attach(client)
		client.connect()
		const es = FakeEventSource.instances[0]
		for (let i = 1; i <= EVENT_LOG_LIMIT + 5; i++) {
			es.fireMessage({
				id: i,
				topic: "stock.changed",
				tenantId: "T1",
				at: "t",
				payload: { i },
			})
		}
		expect(store.eventLog).toHaveLength(EVENT_LOG_LIMIT)
		expect(store.eventLog[0].id).toBe(EVENT_LOG_LIMIT + 5)
		expect(store.eventLog[EVENT_LOG_LIMIT - 1].id).toBe(6)
		client.dispose()
	})

	it("maps prefix topics to product/customer scope domains", () => {
		expect(resolveScope("invoice.paid")).toBe("invoices")
		expect(resolveScope("stock.adjusted")).toBe("stock")
		expect(resolveScope("product.updated")).toBe("products")
		expect(resolveScope("customer.created")).toBe("customers")
		expect(resolveScope("unknown.topic")).toBe(null)
	})

	it("registerRealtimeSync wires a client and teardown disposes it", () => {
		const store = useRealtimeStore()
		const teardown = registerRealtimeSync({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
		})
		expect(FakeEventSource.instances).toHaveLength(1)
		expect(store.connectionState).toBe("reconnecting")
		teardown()
		expect(FakeEventSource.instances[0].closed).toBe(true)
	})

	it("allows a fresh registration after teardown", () => {
		registerRealtimeSync({
			EventSourceCtor: FakeEventSource,
			url: "http://h/a",
		})()
		const teardown = registerRealtimeSync({
			EventSourceCtor: FakeEventSource,
			url: "http://h/b",
		})
		// the first stream is closed, a brand-new one is opened
		expect(FakeEventSource.instances).toHaveLength(2)
		expect(FakeEventSource.instances[0].closed).toBe(true)
		expect(FakeEventSource.instances[1].closed).toBe(false)
		teardown()
		expect(FakeEventSource.instances[1].closed).toBe(true)
	})

	it("runs a silent sync cycle when the stream reconnects while online", async () => {
		const { syncState, runSyncCycleSilently } = await import(
			"@/services/sync-manager"
		)
		syncState.isOnline = true
		const store = useRealtimeStore()
		const teardown = registerRealtimeSync({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
		})
		FakeEventSource.instances[0].fireOpen()
		expect(runSyncCycleSilently).toHaveBeenCalled()
		expect(store.connectionState).toBe("connected")
		syncState.isOnline = false
		teardown()
	})

	it("stops the store mirror when the client is disposed", () => {
		const store = useRealtimeStore()
		const teardown = registerRealtimeSync({
			EventSourceCtor: FakeEventSource,
			url: "http://h/api/realtime/events",
		})
		const es = FakeEventSource.instances[0]
		es.fireOpen()
		es.fireMessage({
			id: 3,
			topic: "stock.changed",
			tenantId: "T1",
			at: "t",
			payload: {},
		})
		expect(store.eventLog).toHaveLength(1)
		teardown()
		// the disposed client must not feed the store anymore
		es.fireMessage({
			id: 4,
			topic: "stock.changed",
			tenantId: "T1",
			at: "t",
			payload: {},
		})
		expect(store.eventLog).toHaveLength(1)
		expect(store.lastEventId).toBe(3)
	})
})
