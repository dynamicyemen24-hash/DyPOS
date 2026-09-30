import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (rel) => readFileSync(join(ROOT, rel), "utf8")

const main = read("src/main.js")
const loginRuntime = read("src/composables/useLoginRuntime.js")
const syncManager = read("src/services/sync-manager.js")
const features = read("src/stores/features.js")
const realtimeClient = read("src/sync/realtimeClient.js")
const realtimeStore = read("src/stores/realtime.js")
const posSync = read("src/stores/posSync.js")

/**
 * الإقلاع المستقل — صفر اتصال دون طلب المستخدم.
 *
 * أغلى عيب في هذا المنتج هو الصامت: طلب شبكة يخرج دون أن يطلبه
 * المستخدم — فحص إقلاع، مزامنة عند `online`، مؤقّت استطلاع، إعادة
 * اتصال تلقائية. لا رسالة خطأ، لا زر ضغطه المستخدم، فقط اعتماد
 * خفي على سيرفر آخر. هذه البوابة تجعل ذلك العيب يفشل بصوت عالٍ.
 */
describe("standalone boot — zero network without user demand", () => {
	it("main.js never probes the backend at boot", () => {
		expect(main).not.toContain('fetch("/api/ping"')
		expect(main).not.toContain('prefetchOnIdle(["/api/ping"])')
	})

	it("the login runtime never probes the backend to decide offline mode", () => {
		expect(loginRuntime).not.toContain("fetch(endpoints.ping")
	})

	it("every automatic network trigger is gated on link consent", () => {
		const gate = /isLinkEnabled|isAutoAllowed|subscribeLinkConsent/
		for (const [name, source] of [
			["services/sync-manager.js", syncManager],
			["stores/features.js", features],
			["sync/realtimeClient.js", realtimeClient],
			["stores/realtime.js", realtimeStore],
		]) {
			expect(
				gate.test(source),
				`${name}: automatic network without link-consent gate`,
			).toBe(true)
		}
	})

	it("the deprecated sync store carries no auto-sync on reconnect", () => {
		expect(posSync).not.toMatch(/auto-syncing pending invoices/i)
		expect(posSync).not.toMatch(/Transition to online detected/i)
	})

	it("the version watchdog never phones home without consent", () => {
		// Same-origin build stamp reads are cache-served; the polling loop
		// that forces network revalidation must still ask for consent first.
		const watchdog = main.slice(main.indexOf("startBuildVersionWatchdog"))
		expect(watchdog).toContain("isLinkEnabled")
	})
})
