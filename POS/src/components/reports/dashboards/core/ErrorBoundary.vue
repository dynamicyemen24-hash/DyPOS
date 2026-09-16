<template>
	<div v-if="hasError" class="error-boundary bg-red-50 border border-red-200 rounded-lg p-6 text-center m-4">
		<FeatherIcon name="alert-triangle" class="w-10 h-10 text-red-400 mx-auto mb-3" />
		<h3 class="text-red-700 font-semibold text-lg">{{ __("Something went wrong") }}</h3>
		<p class="text-red-500 text-sm mt-2 max-w-md mx-auto">{{ errorMessage }}</p>
		<div class="flex justify-center gap-3 mt-4">
			<Button variant="solid" @click="retry">
				<FeatherIcon name="refresh-cw" class="w-4 h-4 mr-1" />
				{{ __("Retry") }}
			</Button>
			<Button variant="subtle" @click="goHome">
				{{ __("Go Home") }}
			</Button>
		</div>
		<details v-if="showDetails" class="mt-4 text-left">
			<summary class="text-xs text-red-400 cursor-pointer hover:text-red-600">
				{{ __("Technical Details") }}
			</summary>
			<pre class="mt-2 p-3 bg-red-100 rounded text-xs text-red-700 overflow-auto max-h-40">{{ errorStack }}</pre>
		</details>
	</div>
	<slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from "vue"
import { Button, FeatherIcon } from "frappe-ui"
import { goToPOS } from "@/router"

const hasError = ref(false)
const errorMessage = ref("")
const errorStack = ref("")
const showDetails = ref(import.meta.env.DEV)

onErrorCaptured((err, instance, info) => {
	hasError.value = true
	errorMessage.value = err?.message || "An unexpected error occurred"
	errorStack.value = `${err?.stack || ""}\n\nComponent: ${info}`
	return false // Stop propagation
})

function retry() {
	hasError.value = false
	errorMessage.value = ""
	errorStack.value = ""
}

function goHome() {
	goToPOS()
}
</script>
