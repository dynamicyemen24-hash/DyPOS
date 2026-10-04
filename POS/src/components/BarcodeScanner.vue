<template>
  <div class="bs-root" v-if="mounted" aria-live="polite">
    <!-- Preview di camera -->
    <div class="bs-preview">
      <video ref="video" autoplay muted playsinline></video>
    </div>

    <!-- Risultati della scansione -->
    <div class="bs-results" v-if="result">
      <p>{{ __('تم المسح') }}: <strong>{{ result.code }}</strong></p>
      <p>{{ __('الصيغة') }}: {{ result.format }}</p>

      <!-- Bottone “Seleziona questo prodotto” -->
      <ActionButton
        variant="subtle"
        size="md"
        @click="selectProduct"
        :aria-label="__('اختر هذا المنتج')"
      >{{ __('اختيار') }}</ActionButton>
    </div>

    <!-- Messaggio se non disponibile la fotocamera -->
    <div v-else class="bs-no-camera">
      {{ __('لا توجد كاميرا') }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue"
import { ActionButton } from "dypos-ui"
import { __ } from "@/utils/translation"
// `uuid` was imported here and is NOT in `package.json` — a dependency used by
// shipped code but absent from the manifest, which breaks both the build and
// any `npm ci`. Nothing referenced `uuidv4`, so the import went rather than a
// new dependency. `tests/buildConfig.test.js` is the gate for the second case.

// Opzioni Instascan
const SCANAR_OPTIONS = {
	scanPeriod: 5,
	videoMode: window.Instascan
		? window.Instascan.Environment.VideoMode.LIBRARY_AND_CAMERA
		: undefined,
	mirror: window.Instascan
		? window.Instascan.Environment.Mirror.BOTH
		: undefined,
}

// Stato reattivo
const mounted = ref(false)
const videoRef = ref(null)
let scanner = null
const result = ref(null) // { code, format }

// Dopo il mount, inizializza Instascan e avvia la scansione immediatamente
onMounted(() => {
	mounted.value = true
	if (window.Instascan) {
		scanner = new window.Instascan.Instascan({
			video: videoRef.value,
			mirror: false,
		})

		scanner.addListener("scan", (content) => {
			// content è la stringa del codice, content.format il tipo
			result.value = {
				code: content.text,
				format: content.format,
			}
			stopScan()
		})

		// Avvia la scansione non appena il video è pronto
		scanner.start()
	}
})

onBeforeUnmount(() => {
	stopScan()
})

function stopScan() {
	scanner?.stop()
	videoRef.value?.pause()
}

async function selectProduct() {
	if (!result.value) return
	// Emetti l'evento al componente padre con il codice letto
	emit("scan-result", result.value)
}

// Esponiamo metodi
const emit = defineEmits(["scan-result"])
defineExpose({ stopScan, selectProduct })
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