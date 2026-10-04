import { afterEach, describe, expect, it } from "vitest"
import {
	resolveUrl,
	setRuntimeApiBaseResolver,
} from "../packages/dypos-ui/src/utils/request.js"

afterEach(() => setRuntimeApiBaseResolver(null))

describe("dypos-ui runtime API endpoint resolver", () => {
	it("preserves same-origin method routing without a runtime override", () => {
		setRuntimeApiBaseResolver(() => "/api")
		expect(resolveUrl("dypos.client.get_list")).toBe(
			"/api/method/dypos.client.get_list",
		)
	})

	it("routes REST API paths to the configured API base", () => {
		setRuntimeApiBaseResolver(() => "https://api.example.test/api")
		expect(resolveUrl("/api/auth/login")).toBe(
			"https://api.example.test/api/auth/login",
		)
	})

	it("routes method paths to the configured API base exactly once", () => {
		setRuntimeApiBaseResolver(() => "https://api.example.test/api/")
		expect(resolveUrl("dypos.client.get_list")).toBe(
			"https://api.example.test/api/method/dypos.client.get_list",
		)
	})

	it("does not rewrite unrelated or absolute resource URLs", () => {
		setRuntimeApiBaseResolver(() => "https://api.example.test/api")
		expect(resolveUrl("/assets/logo.svg")).toBe("/assets/logo.svg")
		expect(resolveUrl("https://cdn.example.test/file.json")).toBe(
			"https://cdn.example.test/file.json",
		)
	})
})
