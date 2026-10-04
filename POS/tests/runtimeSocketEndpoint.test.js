import { afterEach, describe, expect, it } from "vitest"
import { resetSocket, resolveSocketUrl } from "@/socket"
import {
	SERVICE_ENDPOINTS,
	setServiceEndpoint,
} from "@/services/runtime-endpoints"

afterEach(() => {
	resetSocket()
	localStorage.clear()
	window.dypos = undefined
})

describe("runtime Socket.IO endpoint", () => {
	it("uses the device override and appends the active site path", () => {
		window.dypos = { boot: { site_name: "store-a" } }
		setServiceEndpoint(
			SERVICE_ENDPOINTS.SOCKET,
			"https://realtime.example/socket.io",
		)

		expect(resolveSocketUrl()).toBe(
			"https://realtime.example/socket.io/store-a",
		)
	})

	it("keeps same-origin site resolution when no override or boot URL exists", () => {
		expect(resolveSocketUrl("store-b")).toBe("http://localhost:9000/store-b")
	})
})
