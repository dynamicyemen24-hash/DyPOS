import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	getServiceEndpoint,
	getServiceEndpointOverride,
	RUNTIME_ENDPOINTS_KEY,
	SERVICE_ENDPOINTS,
	setServiceEndpoint,
	subscribeRuntimeEndpoints,
} from "@/services/runtime-endpoints"
import {
	AUTO_TRIGGERS,
	getAutomation,
	getLinkMode,
	LINK_MODES,
	setLinkMode,
	setTriggerMode,
} from "@/services/link-consent"

describe("runtime service endpoints", () => {
	beforeEach(() => {
		localStorage.clear()
		vi.restoreAllMocks()
	})

	it("falls back to the current build configuration until an override exists", () => {
		expect(getServiceEndpointOverride(SERVICE_ENDPOINTS.API)).toBe("")
		expect(getServiceEndpoint(SERVICE_ENDPOINTS.API)).toBe(
			import.meta.env.VITE_DYPOS_API || "/api",
		)
	})

	it("persists valid URLs locally without making a network request", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch")
		const result = setServiceEndpoint(
			SERVICE_ENDPOINTS.API,
			"https://pos.example.com/api/",
		)

		expect(result).toMatchObject({ ok: true, changed: true, persisted: true })
		expect(getServiceEndpoint(SERVICE_ENDPOINTS.API)).toBe(
			"https://pos.example.com/api",
		)
		expect(JSON.parse(localStorage.getItem(RUNTIME_ENDPOINTS_KEY))).toEqual({
			version: 1,
			endpoints: { api: "https://pos.example.com/api" },
		})
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("rejects unsafe schemes, embedded credentials, and protocol-relative URLs", () => {
		for (const value of [
			"javascript:alert(1)",
			"https://user:pass@pos.example.com",
			"//pos.example.com/api",
			"file:///tmp/api",
		]) {
			expect(setServiceEndpoint(SERVICE_ENDPOINTS.API, value).ok).toBe(false)
		}
	})

	it("requires TLS outside a private/local network but allows store LAN endpoints", () => {
		expect(
			setServiceEndpoint(SERVICE_ENDPOINTS.API, "http://api.example.test/api")
				.ok,
		).toBe(false)
		expect(
			setServiceEndpoint(SERVICE_ENDPOINTS.API, "http://192.168.10.20/api").ok,
		).toBe(true)
		expect(
			setServiceEndpoint(
				SERVICE_ENDPOINTS.SOCKET,
				"http://scale-bridge.local/socket.io",
			).ok,
		).toBe(true)
	})

	it("resets linkage, automation, and only the changed service credential", () => {
		setLinkMode(LINK_MODES.LINKED, "explicit-connect")
		setTriggerMode(AUTO_TRIGGERS.POLL, "auto")
		localStorage.setItem("dypos_token", "api-token")
		localStorage.setItem("DyPOS_access_token", "platform-token")

		setServiceEndpoint(SERVICE_ENDPOINTS.API, "https://api.example.com")

		expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
		expect(getAutomation()[AUTO_TRIGGERS.POLL]).toBe("off")
		expect(localStorage.getItem("dypos_token")).toBeNull()
		expect(localStorage.getItem("DyPOS_access_token")).toBe("platform-token")
	})

	it("notifies consumers when a service trust target changes", () => {
		const changes = []
		const unsubscribe = subscribeRuntimeEndpoints((change) =>
			changes.push(change),
		)
		setServiceEndpoint(SERVICE_ENDPOINTS.SOCKET, "https://realtime.example.com")
		unsubscribe()

		expect(changes).toEqual([
			expect.objectContaining({
				service: SERVICE_ENDPOINTS.SOCKET,
				previous: "",
				value: "https://realtime.example.com",
			}),
		])
	})
})
