<template>
  <div class="bs-root" aria-live="polite">
    <!-- Preview della telecamera: mostrata solo quando il motore e la camera
         sono disponibili. Il vecchio template mostrava sempre il riquadro e
         diceva "no camera" solo quando mancava il risultato, quindi un
         engine senza BarcodeDetector mostrava una scatola nera muta. -->
    <div v-if="camLive" class="bs-preview">
      <video ref="videoRef" autoplay muted playsinline></video>
    </div>

    <!-- Risultato della scansione -->
    <div v-if="result" class="bs-results">
      <p>{{ __('تم المسح') }}: <strong data-testid="scan-code">{{ result.code }}</strong></p>
      <p>{{ __('الصيغة') }}: {{ result.format }}</p>

      <ActionButton
        variant="subtle"
        size="md"
        data-testid="scan-confirm"
        @click="selectProduct"
        :aria-label="__('اختر هذا المنتج')"
      >{{ __('اختيار') }}</ActionButton>
    </div>

    <!-- Stato onesto: ogni caso ha una riga che dice cosa fare, mai una scatola
         nera. Il campo manuale accanto al pulsante resta il modo di lavoro
         garantito (invariant 8: nessuna funzionalità è bloccata da assenza di
         rete o di hardware). -->
    <p v-else class="bs-status" :data-state="state" data-testid="scan-status">
      <template v-if="state === 'starting'">{{ __('جارٍ تشغيل الكاميرا…') }}</template>
      <template v-else-if="state === 'scanning'">{{ __('وجّه الكاميرا نحو الباركود') }}</template>
      <template v-else-if="state === 'unsupported'">
        {{ __('المسح بالكاميرا غير مدعوم في هذا المتصفح — اكتب الباركود في خانة البحث') }}
      </template>
      <template v-else-if="state === 'denied'">
        {{ __('تعذّر فتح الكاميرا — اسمح بالوصول أو اكتب الباركود في خانة البحث') }}
      </template>
      <template v-else>{{ __('المسح متوقف') }}</template>
    </p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { ActionButton } from "dypos-ui"
import { __ } from "@/utils/translation"

/**
 * Barcode scanning — native `BarcodeDetector`, no library, no global.
 *
 * ## What this replaces
 *
 * The component read `window.Instascan` and declared `instascan@3.2.1` in
 * `package.json`. Three separate failures lived in that arrangement:
 *
 *   1. `instascan@3.2.1` DOES NOT EXIST on npm (the published versions stop at
 *      `2.0.0-rc.4`). `npm ci` in CI died with `ETARGET` before a single test
 *      ran, so the release could not ship at all.
 *   2. Nothing ever imported the package. The component read a `window`
 *      global that no bundle defines — the exact dead-desk-global class
 *      AGENTS.md invariant 9 forbids: the scanner silently did nothing on a
 *      standalone install, with a camera preview and no result.
 *   3. `SCANAR_OPTIONS` was built at module scope by reading `window` during
 *      setup — a top-level side effect on a global, evaluated before the
 *      component is even mounted, and its value was never used by anything.
 *
 * `BarcodeDetector` ships in the browser engine itself (Chrome/Edge/Android
 * WebView), needs no dependency and no network, which also keeps invariant 8
 * intact: the scanner is an offline-first local capability, not a third-party
 * runtime.
 *
 * ## Honest degradation
 *
 * When the engine has no `BarcodeDetector` (Firefox desktop, older Safari) the
 * component says so in Arabic and offers the manual field, instead of showing a
 * black video box that never resolves — a broken feature must report itself.
 */

const emit = defineEmits(["scan-result"])

/** Formats the shop actually sells: the retail symbologies plus a code-128 shelf label. */
const SUPPORTED_FORMATS = [
	"ean_13",
	"ean_8",
	"upc_a",
	"upc_e",
	"code_128",
	"code_39",
	"itf",
	"qr_code",
]

const videoRef = ref(null)
const result = ref(null) // { code, format }
const state = ref("idle") // idle | starting | scanning | found | unsupported | denied

let detector = null
let rafId = 0
let disposed = false

/**
 * The camera stream, held in a ref because the preview's visibility DEPENDS on
 * it. A plain `let` would leave the computed permanently cached at its first
 * `false` — the template would never show the video even with the camera live,
 * which is the same "renders, does nothing" class this round is removing.
 */
const stream = ref(null)

/**
 * Render the preview while a start attempt is in flight or a stream is live.
 *
 * Deliberately NOT derived from `videoRef`: the `<video>` element only exists
 * while this flag is true, so a flag computed from the ref is circular — it
 * stays `false` forever, the element never mounts, the ref never binds, and
 * `startScan` bails at its `!videoRef.value` guard. That is the same
 * "renders, does nothing" shape this round is removing, one level deeper.
 */
const camLive = computed(() =>
	["starting", "scanning", "found"].includes(state.value),
)

/**
 * Evaluated per call, not once at setup.
 *
 * A module-level constant froze the answer at component-definition time. The
 * engine API is present or absent before the app runs, but a lazily-loaded
 * polyfill, a browser extension, or a test double installed after mount would
 * all be invisible forever — and the cached `true` would send the scanner down
 * a path that throws on every frame.
 */
const isSupported = () =>
	typeof window !== "undefined" && typeof window.BarcodeDetector === "function"

/**
 * Open the camera stream.
 *
 * Resolves with the resulting state so the caller can tell "scanning" from
 * "this engine cannot scan" without waiting for a code that will never come.
 */
async function startScan() {
	if (!isSupported()) {
		state.value = "unsupported"
		return state.value
	}
	if (state.value === "scanning" || state.value === "starting")
		return state.value

	state.value = "starting"
	disposed = false

	try {
		// Ask only for the formats we can read back, so the engine does not
		// hand us a symbology the lookup has never seen.
		const Ctor = window.BarcodeDetector
		detector = new Ctor({ formats: SUPPORTED_FORMATS })
	} catch {
		// A constructor that rejects the format list is still a supported
		// engine: retry with its own defaults rather than declaring the
		// scanner dead on a format-name mismatch.
		try {
			detector = new window.BarcodeDetector()
		} catch {
			state.value = "unsupported"
			return state.value
		}
	}

	if (!navigator.mediaDevices?.getUserMedia) {
		state.value = "unsupported"
		return state.value
	}

	try {
		stream.value = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: "environment" },
			audio: false,
		})
	} catch {
		// A refused or absent camera is `denied`, not a crash: the cashier
		// still has the manual barcode field beside this control.
		state.value = "denied"
		return state.value
	}

	if (disposed) {
		stopStream()
		return state.value
	}

	// The `<video>` element mounts on the `starting` state, so give Vue one tick
	// to bind the ref before attaching the stream — otherwise `videoRef` is
	// null on the very first call and the camera is opened then immediately
	// closed.
	await nextTick()

	if (disposed || !videoRef.value) {
		stopStream()
		return state.value
	}

	videoRef.value.srcObject = stream.value
	try {
		await videoRef.value.play()
	} catch {
		// Autoplay blocked (muted+playsinline normally exempts us, but a
		// low-power policy can still refuse). The frames still arrive.
	}

	state.value = "scanning"
	pump()
	return state.value
}

/**
 * Poll the video for a readable frame.
 *
 * `requestAnimationFrame` rather than a timer: the loop then stops with the
 * tab, so a backgrounded till is not decoding barcodes nobody is looking at.
 */
function pump() {
	if (disposed || state.value !== "scanning") return
	rafId = requestAnimationFrame(async () => {
		if (disposed || state.value !== "scanning") return
		try {
			const found = await detector.detect(videoRef.value)
			const hit = Array.isArray(found) ? found[0] : null
			if (hit?.rawValue) {
				result.value = { code: hit.rawValue, format: hit.format || "" }
				state.value = "found"
				stopScan()
				return
			}
		} catch {
			// A frame the engine cannot read yet is the normal case, not an
			// error worth surfacing to a cashier mid-sale.
		}
		pump()
	})
}

function stopStream() {
	if (rafId) {
		cancelAnimationFrame(rafId)
		rafId = 0
	}
	stream.value?.getTracks?.().forEach((track) => track.stop())
	stream.value = null
	if (videoRef.value) videoRef.value.srcObject = null
}

function stopScan() {
	state.value = result.value ? "found" : "idle"
	stopStream()
}

function onBarcodeScan(payload) {
	if (result.value) selectProduct()
}

// The parent already clears its `scanning` flag when it receives the code, so
// this reports state only for display. No `scan-state` emit: a component that
// emits an event nobody binds is a dead contract (AGENTS.md), and the page
// drives the scanner through the template ref instead.
onMounted(() => {
	startScan()
})

onBeforeUnmount(() => {
	disposed = true
	stopStream()
})

function selectProduct() {
	if (!result.value) return
	// Emit the CODE, not the result object: `POSSale.onBarcodeScan` feeds this
	// straight into `handleScan(code)`, and a `{code, format}` object stringifies
	// to "[object Object]" — every scan would miss.
	emit("scan-result", result.value.code)
}

defineExpose({ startScan, stopScan, selectProduct, state })
</script>

<style scoped>
.bs-root {
  position: relative;
  width: 100%;
  max-width: 360px;
  margin: auto;
  background: #fff;
}
.bs-preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
}
.bs-preview video {
  width: 100%;
  height: 100%;
}
.bs-results {
  padding: 12px;
  text-align: center;
}
.bs-no-camera {
  padding: 20px;
  text-align: center;
  color: #666;
}
</style>