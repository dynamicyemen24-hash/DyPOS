import { beforeEach, describe, expect, it, vi } from "vitest"

const clearCookie = (name) => {
	document.cookie = `${name}=; Max-Age=0; path=/`
}

describe("local user data", () => {
	beforeEach(() => {
		vi.resetModules()
		clearCookie("user_id")
		clearCookie("full_name")
		clearCookie("user_image")
	})

	it("refreshes identity explicitly without a perpetual polling timer", async () => {
		const intervalSpy = vi.spyOn(globalThis, "setInterval")
		const { userData } = await import("@/data/user")

		document.cookie = "user_id=cashier-1; path=/"
		document.cookie = "full_name=Cashier%20One; path=/"
		userData.refresh()

		expect(userData.userId).toBe("cashier-1")
		expect(userData.fullName).toBe("Cashier One")
		expect(intervalSpy).not.toHaveBeenCalled()
		intervalSpy.mockRestore()
	})
})
