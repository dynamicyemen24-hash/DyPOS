import { ref } from "vue"

export function useBiometric() {
	const processing = ref(false)
	const error = ref<string | null>(null)

	async function verify() {
		processing.value = true
		error.value = null
		try {
			// Placeholder for future WebAuthn implementation.
			// In production, replace with:
			//   const credential = await navigator.credentials.get({ publicKey: ... })
			return { success: true }
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : "biometric failed"
			error.value = message
			return { success: false, error: error.value }
		} finally {
			processing.value = false
		}
	}

	return {
		processing,
		error,
		verify,
	}
}
