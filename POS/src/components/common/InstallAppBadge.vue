<template>
	<Teleport to="body">
		<Transition
			enter-active-class="transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
			enter-from-class="opacity-0 -translate-y-full"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition-[transform,opacity] duration-200 ease-in motion-reduce:transition-none"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-full"
		>
			<section
				v-if="showBadge"
				ref="bannerRef"
				class="fixed inset-x-0 top-0 z-[250] lg:hidden"
				:style="{ paddingTop: 'env(safe-area-inset-top)' }"
				role="dialog"
				aria-modal="false"
				aria-labelledby="dypos-install-banner-title"
				aria-describedby="dypos-install-banner-description"
				:aria-busy="isInstalling"
				data-testid="pwa-install-banner"
			>
				<div class="border-b border-gray-200/80 bg-white/95 shadow-lg backdrop-blur-xl">
					<div class="mx-auto max-w-screen-xl px-3 py-2.5">
						<div class="flex min-h-12 items-center gap-2.5">
							<!-- App Icon -->
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-600 shadow-sm ring-1 ring-black/5"
								aria-hidden="true"
							>
								<svg
									class="h-6 w-6 text-white"
									viewBox="0 0 24 24"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path
										d="M7 3.5h10A3.5 3.5 0 0 1 20.5 7v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5Z"
										fill="currentColor"
										opacity=".2"
									/>
									<path
										d="M8 8.5h8M8 12h8M8 15.5h5"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
									/>
								</svg>
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<h2
									id="dypos-install-banner-title"
									class="truncate text-xs font-bold leading-4 text-gray-900"
								>
									{{ __("تثبيت DyPOS") }}
								</h2>

								<p
									id="dypos-install-banner-description"
									class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-gray-500"
								>
									{{ description }}
								</p>

								<button
									v-if="canSnooze"
									type="button"
									class="mt-0.5 min-h-6 text-[10px] font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
									:disabled="isInstalling"
									@click="handleSnooze"
								>
									{{ __("تذكيري لاحقًا") }}
								</button>
							</div>

							<!-- Actions -->
							<div class="flex shrink-0 items-center gap-1.5">
								<button
									type="button"
									class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 touch-manipulation"
									:disabled="isInstalling"
									:aria-busy="isInstalling"
									@click="handleInstall"
								>
									<svg
										v-if="isInstalling"
										class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<circle
											cx="12"
											cy="12"
											r="9"
											class="opacity-25"
											stroke="currentColor"
											stroke-width="3"
										/>
										<path
											d="M21 12a9 9 0 0 0-9-9"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
										/>
									</svg>

									<svg
										v-else
										class="h-3.5 w-3.5"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<path
											d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>

									<span>
										{{ isInstalling ? __("جارٍ التثبيت...") : __("تثبيت") }}
									</span>
								</button>

								<button
									type="button"
									class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 touch-manipulation"
									:disabled="isInstalling"
									:aria-label="__('إغلاق')"
									:title="__('إغلاق')"
									@click="handleDismiss"
								>
									<svg
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<path
											d="M6 6l12 12M18 6 6 18"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</section>
		</Transition>
	</Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { usePWAInstall } from "@/composables/usePWAInstall"

const { showInstallBadge, promptInstall, dismissBadge, snoozeBadge } =
	usePWAInstall()

const bannerRef = ref(null)
const isInstalling = ref(false)
const installAttempted = ref(false)

const showBadge = computed(() => {
	return showInstallBadge.value && !installAttempted.value
})

const canSnooze = computed(() => {
	return !isInstalling.value
})

const description = computed(() => {
	return isInstalling.value
		? __("جاري تجهيز DyPOS للاستخدام كتطبيق مستقل...")
		: __("وصول أسرع وتجربة أفضل ودعم للعمل دون اتصال.")
})

const handleInstall = async () => {
	if (isInstalling.value || installAttempted.value) return

	isInstalling.value = true

	try {
		const result = await promptInstall()

		/*
		 * بعض تطبيقات PWA لا تعيد نتيجة صريحة من promptInstall.
		 * لذلك لا نفترض نجاح التثبيت إلا إذا أعادت الدالة حالة واضحة.
		 */
		if (
			result === true ||
			result?.outcome === "accepted" ||
			result?.installed === true
		) {
			installAttempted.value = true
		}
	} catch (error) {
		// لا نعرض تفاصيل الخطأ للمستخدم؛ يسمح له بإعادة المحاولة.
		console.error("[DyPOS] PWA installation failed:", error)
	} finally {
		isInstalling.value = false
	}
}

const handleDismiss = () => {
	if (isInstalling.value) return

	dismissBadge()
}

const handleSnooze = () => {
	if (isInstalling.value) return

	snoozeBadge()
}

const handleKeydown = (event) => {
	if (!showBadge.value || isInstalling.value) return

	if (event.key === "Escape") {
		event.preventDefault()
		handleDismiss()
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown)
})
</script>

<style scoped>
@media (prefers-reduced-motion: reduce) {
	* {
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}
}
</style>
