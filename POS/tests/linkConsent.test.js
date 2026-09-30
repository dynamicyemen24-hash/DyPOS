import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	AUTO_MODES,
	AUTO_TRIGGERS,
	LINK_MODES,
	LINK_REASONS,
	getAutomation,
	getLinkMode,
	getPollIntervalMs,
	isAutoAllowed,
	isLinkEnabled,
	setAutomationMaster,
	setLinkMode,
	setPollIntervalSec,
	setTriggerMode,
	subscribeLinkConsent,
} from "../src/services/link-consent.js"

/**
 * موافقة الربط — العقد الذي يفصل العمل المستقل عن أي اتصال شبكي.
 * بدونه يعود أي `online` أو مؤقّت أو فحص إقلاع ليتكلم مع سيرفر
 * لم يطلبه المستخدم: عيب صامت بلا رسالة خطأ.
 */
describe("link consent — standalone-first", () => {
	beforeEach(() => {
		localStorage.clear()
		vi.restoreAllMocks()
	})

	it("defaults to standalone with zero stored consent", () => {
		expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
		expect(isLinkEnabled()).toBe(false)
	})

	it("grants linkage only through an explicit set", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		expect(getLinkMode()).toBe(LINK_MODES.LINKED)
		expect(isLinkEnabled()).toBe(true)
		const stored = JSON.parse(localStorage.getItem("DyPOS_link_consent"))
		expect(stored.mode).toBe(LINK_MODES.LINKED)
		expect(stored.reason).toBe(LINK_REASONS.SERVER_LOGIN)
	})

	it("revokes linkage explicitly and forgets the grant", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SYNC_NOW)
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
		expect(isLinkEnabled()).toBe(false)
		expect(localStorage.getItem("DyPOS_link_consent")).toBeNull()
	})

	it("treats garbage as standalone, never as consent", () => {
		for (const bad of ["linked ", "LINKED", "yes", "1", "auto", ""]) {
			expect(setLinkMode(bad)).toBe(LINK_MODES.STANDALONE)
			expect(isLinkEnabled()).toBe(false)
		}
		localStorage.setItem("DyPOS_link_consent", "{broken json")
		expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
		// Case matters: "LINKED" is not consent, only the exact mode is.
		localStorage.setItem(
			"DyPOS_link_consent",
			JSON.stringify({ mode: "LINKED" }),
		)
		expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
		localStorage.setItem(
			"DyPOS_link_consent",
			JSON.stringify({ mode: LINK_MODES.LINKED }),
		)
		expect(getLinkMode()).toBe(LINK_MODES.LINKED)
	})

	it("notifies subscribers only on real change", () => {
		const calls = []
		const off = subscribeLinkConsent((mode, reason) =>
			calls.push([mode, reason]),
		)
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.AUTO_TOGGLE)
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.AUTO_TOGGLE)
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
		off()
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		expect(calls).toEqual([
			[LINK_MODES.LINKED, LINK_REASONS.AUTO_TOGGLE],
			[LINK_MODES.STANDALONE, LINK_REASONS.REVOKED],
		])
	})

	it("a throwing listener never breaks the other engines", () => {
		subscribeLinkConsent(() => {
			throw new Error("broken UI")
		})
		const seen = []
		subscribeLinkConsent((mode) => seen.push(mode))
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SYNC_NOW)
		expect(seen).toEqual([LINK_MODES.LINKED])
	})
})

describe("link automation variables — the user decides every movement", () => {
	beforeEach(() => {
		localStorage.clear()
		setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
	})

	it("defaults every trigger to off", () => {
		const auto = getAutomation()
		expect(auto.mode).toBe(AUTO_MODES.OFF)
		for (const trigger of Object.values(AUTO_TRIGGERS)) {
			expect(auto[trigger]).toBe(AUTO_MODES.OFF)
			expect(isAutoAllowed(trigger)).toBe(false)
		}
	})

	it("nothing automatic without linkage, even when set to auto", () => {
		setTriggerMode(AUTO_TRIGGERS.POLL, "auto")
		setTriggerMode(AUTO_TRIGGERS.ON_RECONNECT, "auto")
		expect(isAutoAllowed(AUTO_TRIGGERS.POLL)).toBe(false)
		expect(isAutoAllowed(AUTO_TRIGGERS.ON_RECONNECT)).toBe(false)
	})

	it("grants per-trigger automation only with linkage + master", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		setTriggerMode(AUTO_TRIGGERS.ON_RECONNECT, "auto")
		expect(isAutoAllowed(AUTO_TRIGGERS.ON_RECONNECT)).toBe(true)
		expect(isAutoAllowed(AUTO_TRIGGERS.POLL)).toBe(false)
	})

	it("ask mode surfaces but never runs (the badge is the question)", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		setTriggerMode(AUTO_TRIGGERS.POLL, "ask")
		expect(getAutomation()[AUTO_TRIGGERS.POLL]).toBe(AUTO_MODES.ASK)
		expect(isAutoAllowed(AUTO_TRIGGERS.POLL)).toBe(false)
	})

	it("killing the master freezes every trigger at once", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		setTriggerMode(AUTO_TRIGGERS.POLL, "auto")
		setTriggerMode(AUTO_TRIGGERS.STREAM, "auto")
		setAutomationMaster(false)
		const auto = getAutomation()
		expect(auto.mode).toBe(AUTO_MODES.OFF)
		for (const trigger of Object.values(AUTO_TRIGGERS)) {
			expect(isAutoAllowed(trigger)).toBe(false)
		}
	})

	it("enabling any trigger raises the master implicitly (no silent automation)", () => {
		setTriggerMode(AUTO_TRIGGERS.PUSH_IMMEDIATE, "auto")
		expect(getAutomation().mode).toBe(AUTO_MODES.AUTO)
	})

	it("rejects unknown triggers and garbage modes", () => {
		const before = getAutomation()
		setTriggerMode("nope", "auto")
		setTriggerMode(AUTO_TRIGGERS.POLL, "sometimes")
		expect(getAutomation()).toEqual({ ...before, [AUTO_TRIGGERS.POLL]: "off" })
	})

	it("clamps the poll interval to a sane range (5s–1h, 0 = engine default)", () => {
		expect(setPollIntervalSec(30).pollIntervalSec).toBe(30)
		expect(getPollIntervalMs(15000)).toBe(30000)
		expect(setPollIntervalSec(1).pollIntervalSec).toBe(0)
		// Huge input clamps to the 1h ceiling instead of breaking the loop.
		expect(setPollIntervalSec(99999).pollIntervalSec).toBe(3600)
		expect(getPollIntervalMs(15000)).toBe(3600000)
		expect(setPollIntervalSec("junk").pollIntervalSec).toBe(0)
		expect(getPollIntervalMs(15000)).toBe(15000)
	})

	it("notifies engines when automation changes", () => {
		setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
		const seen = []
		subscribeLinkConsent((mode, reason) => seen.push(reason))
		setTriggerMode(AUTO_TRIGGERS.POLL, "auto")
		setTriggerMode(AUTO_TRIGGERS.POLL, "auto")
		expect(seen).toEqual(["trigger:poll"])
	})
})
