/**
 * Sync destinations regression: runtime-selectable sync targets.
 * Pure localStorage logic — no network, no Dexie.
 */
import { beforeEach, describe, expect, it } from "vitest"

import {
	DEST_KINDS,
	LOCAL_DESTINATION_ID,
	clearDestinationToken,
	deleteDestination,
	getActiveDestinationId,
	getDestination,
	getDestinationState,
	getDestinationToken,
	listDestinations,
	normalizeBaseUrl,
	saveDestination,
	setActiveDestinationId,
	setDestinationToken,
	touchDestination,
	validateDestination,
} from "@/services/sync-destinations"

beforeEach(() => {
	localStorage.clear()
})

describe("normalizeBaseUrl", () => {
	it("local destination has no URL", () => {
		expect(normalizeBaseUrl("anything", DEST_KINDS.LOCAL)).toBe("")
	})

	it("accepts http(s), strips trailing slash", () => {
		expect(normalizeBaseUrl("https://api.example.com/", "branch")).toBe(
			"https://api.example.com",
		)
		expect(normalizeBaseUrl("http://192.168.1.20:3001", "branch")).toBe(
			"http://192.168.1.20:3001",
		)
	})

	it("adds http scheme to bare LAN hosts", () => {
		expect(normalizeBaseUrl("branch-pc:3001", "cloud")).toBe(
			"http://branch-pc:3001",
		)
	})

	it("rejects dangerous schemes, credentials, garbage", () => {
		expect(normalizeBaseUrl("javascript:alert(1)", "branch")).toBe("")
		expect(normalizeBaseUrl("https://u:p@host/", "branch")).toBe("")
		expect(normalizeBaseUrl("ftp://host/x", "branch")).toBe("")
		expect(normalizeBaseUrl("not a url !!!", "branch")).toBe("")
		expect(normalizeBaseUrl("", "branch")).toBe("")
	})
})

describe("validateDestination", () => {
	it("requires name + kind + valid URL for remotes", () => {
		expect(validateDestination({}).ok).toBe(false)
		expect(
			validateDestination({ name: "x", kind: "branch", baseUrl: "" }).ok,
		).toBe(false)
		expect(
			validateDestination({ name: "x", kind: "branch", baseUrl: "http://" }).ok,
		).toBe(false)
		expect(
			validateDestination({
				name: "الفرع",
				kind: "branch",
				baseUrl: "http://10.0.0.5:3001/",
			}).ok,
		).toBe(true)
	})
})

describe("CRUD + active selection", () => {
	it("always lists the immutable local destination first", () => {
		const list = listDestinations()
		expect(list[0]).toMatchObject({
			id: LOCAL_DESTINATION_ID,
			kind: DEST_KINDS.LOCAL,
		})
	})

	it("creates, activates, and deletes a branch", () => {
		const created = saveDestination({
			name: "فرع العليا",
			kind: "branch",
			baseUrl: "http://192.168.1.20:3001/",
			username: "cashier",
		})
		expect(created.ok).toBe(true)
		expect(created.destination.baseUrl).toBe("http://192.168.1.20:3001")

		expect(getActiveDestinationId()).toBe(LOCAL_DESTINATION_ID)
		setActiveDestinationId(created.destination.id)
		expect(getActiveDestinationId()).toBe(created.destination.id)

		expect(deleteDestination(created.destination.id)).toBe(true)
		expect(getDestination(created.destination.id)).toBeNull()
		// Deleting the active destination falls back to local.
		expect(getActiveDestinationId()).toBe(LOCAL_DESTINATION_ID)
	})

	it("refuses to edit or delete the built-in local destination", () => {
		expect(saveDestination({ id: LOCAL_DESTINATION_ID, name: "x" }).ok).toBe(
			false,
		)
		expect(deleteDestination(LOCAL_DESTINATION_ID)).toBe(false)
		expect(deleteDestination("nope")).toBe(true)
	})

	it("unknown active id falls back to local", () => {
		expect(setActiveDestinationId("ghost")).toBe(LOCAL_DESTINATION_ID)
	})
})

describe("tokens + ops state", () => {
	it("stores per-destination tokens and clears them on URL change", () => {
		const created = saveDestination({
			name: "cloud",
			kind: "cloud",
			baseUrl: "https://api.example.com",
		})
		const id = created.destination.id
		expect(getDestinationToken(id)).toBeNull()
		setDestinationToken(id, "tok123")
		expect(getDestinationToken(id)).toBe("tok123")

		// Changing the origin invalidates the token (different trust domain).
		saveDestination({
			id,
			name: "cloud",
			kind: "cloud",
			baseUrl: "https://api2.example.com",
		})
		expect(getDestinationToken(id)).toBeNull()
		clearDestinationToken(id)
	})

	it("touchDestination records last sync outcome", () => {
		const s = touchDestination("x", {
			lastSyncAt: "2026-01-01",
			lastSyncedCount: 3,
		})
		expect(s.lastSyncedCount).toBe(3)
		expect(getDestinationState("x").lastSyncAt).toBe("2026-01-01")
		const s2 = touchDestination("x", { lastError: "boom" })
		expect(s2.lastError).toBe("boom")
		// An explicit touch without error clears the previous error.
		const s3 = touchDestination("x", { lastSyncedCount: 1 })
		expect(s3.lastError).toBeNull()
	})
})
