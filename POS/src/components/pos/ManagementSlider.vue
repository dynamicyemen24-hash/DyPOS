<template>
	<Teleport to="body">
		<!-- الخلفية -->
		<Transition
			enter-active-class="transition-opacity duration-200 ease-out"
			enter-from-class="opacity-0"
			enter-to-class="opacity-100"
			leave-active-class="transition-opacity duration-150 ease-in"
			leave-from-class="opacity-100"
			leave-to-class="opacity-0"
		>
			<div
				v-if="modelValue"
				class="fixed inset-0 z-[100] bg-slate-950/35 backdrop-blur-[2px]"
				aria-hidden="true"
				@click="handleBackdropClick"
			/>
		</Transition>

		<!-- لوحة الإدارة -->
		<Transition
			enter-active-class="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
			enter-from-class="translate-x-full"
			enter-to-class="translate-x-0"
			leave-active-class="transition-transform duration-200 ease-in"
			leave-from-class="translate-x-0"
			leave-to-class="translate-x-full"
		>
			<aside
				v-if="modelValue"
				ref="panelRef"
				class="fixed inset-y-0 end-0 z-[110] flex w-full max-w-[430px] flex-col overflow-hidden border-s border-gray-200/80 bg-white shadow-[-20px_0_60px_rgba(15,23,42,0.12)]"
				dir="rtl"
				role="dialog"
				aria-modal="true"
				:aria-labelledby="titleId"
				@keydown="handleKeydown"
			>
				<!-- ========================= -->
				<!-- رأس اللوحة -->
				<!-- ========================= -->

				<header class="shrink-0 border-b border-gray-200 bg-white">
					<div class="flex min-h-[76px] items-center gap-3 px-5">
						<div
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"
							aria-hidden="true"
						>
							<FeatherIcon name="sliders" class="h-5 w-5" />
						</div>

						<div class="min-w-0 flex-1">
							<h2 :id="titleId" class="truncate text-[15px] font-bold text-gray-950">
								{{ title }}
							</h2>

							<p v-if="description" class="mt-0.5 truncate text-xs text-gray-500">
								{{ description }}
							</p>
						</div>

						<button
							ref="closeButtonRef"
							type="button"
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
							:aria-label="closeLabel"
							:title="closeLabel"
							:disabled="busy"
							@click="close"
						>
							<FeatherIcon name="x" class="h-5 w-5" aria-hidden="true" />
						</button>
					</div>

					<!-- شريط المسار الداخلي -->
					<div
						v-if="breadcrumb"
						class="flex items-center gap-2 border-t border-gray-100 px-5 py-2.5 text-xs"
					>
						<button
							v-if="showBack"
							type="button"
							class="inline-flex items-center gap-1 font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
							:aria-label="backLabel"
							@click="emit('back')"
						>
							<FeatherIcon
								name="arrow-right"
								class="h-3.5 w-3.5"
								aria-hidden="true"
							/>

							{{ backLabel }}
						</button>

						<span v-if="showBack" class="text-gray-300" aria-hidden="true"> / </span>

						<span class="truncate text-gray-600">
							{{ breadcrumb }}
						</span>
					</div>
				</header>

				<!-- ========================= -->
				<!-- المحتوى -->
				<!-- ========================= -->

				<main
					ref="contentRef"
					class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/70"
				>
					<!-- التحميل -->
					<div
						v-if="loading"
						class="flex min-h-[320px] flex-col items-center justify-center px-6"
						aria-live="polite"
						aria-busy="true"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm"
						>
							<div
								class="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-600"
								aria-hidden="true"
							/>
						</div>

						<p class="mt-4 text-sm font-medium text-gray-700">
							{{ loadingText }}
						</p>

						<p class="mt-1 text-xs text-gray-400">يرجى الانتظار…</p>
					</div>

					<!-- الخطأ -->
					<div
						v-else-if="error"
						class="flex min-h-[320px] flex-col items-center justify-center px-8 text-center"
						role="alert"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600"
						>
							<FeatherIcon
								name="alert-triangle"
								class="h-6 w-6"
								aria-hidden="true"
							/>
						</div>

						<h3 class="mt-4 text-sm font-bold text-gray-900">تعذر إكمال العملية</h3>

						<p class="mt-1.5 max-w-sm text-sm leading-6 text-gray-500">
							{{ error }}
						</p>

						<button
							v-if="retryable"
							type="button"
							class="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
							@click="emit('retry')"
						>
							<FeatherIcon name="refresh-cw" class="h-4 w-4" aria-hidden="true" />

							إعادة المحاولة
						</button>
					</div>

					<!-- لا توجد عناصر -->
					<div
						v-else-if="!items.length"
						class="flex min-h-[320px] flex-col items-center justify-center px-8 text-center"
					>
						<div
							class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm"
						>
							<FeatherIcon :name="emptyIcon" class="h-7 w-7" aria-hidden="true" />
						</div>

						<h3 class="mt-4 text-sm font-bold text-gray-900">
							{{ emptyTitle }}
						</h3>

						<p
							v-if="emptyDescription"
							class="mt-1.5 max-w-sm text-sm leading-6 text-gray-500"
						>
							{{ emptyDescription }}
						</p>
					</div>

					<!-- العناصر -->
					<div v-else class="p-4">
						<div
							class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
							role="menu"
							:aria-label="title"
						>
							<template v-for="(item, index) in items" :key="item.id">
								<!-- عنوان قسم -->
								<div
									v-if="item.type === 'section'"
									class="border-t border-gray-100 bg-gray-50 px-4 py-3 first:border-t-0"
									role="presentation"
								>
									<span
										class="text-[11px] font-bold tracking-wide text-gray-400"
									>
										{{ item.label }}
									</span>
								</div>

								<!-- عنصر إداري -->
								<button
									v-else
									type="button"
									role="menuitem"
									class="group flex w-full items-center gap-3 p-3.5 text-start transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
									:class="[
										index !== items.length - 1
											? 'border-b border-gray-100'
											: '',
										getItemClasses(item),
									]"
									:disabled="busy || item.disabled === true"
									:aria-disabled="busy || item.disabled ? 'true' : undefined"
									:aria-current="item.active ? 'page' : undefined"
									@click="handleItemClick(item)"
								>
									<!-- الأيقونة -->
									<span
										class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
										:class="
											item.active
												? 'bg-emerald-100 text-emerald-700'
												: 'bg-gray-100 text-gray-600 group-hover:bg-gray-200 group-hover:text-gray-900'
										"
									>
										<FeatherIcon
											:name="item.icon || 'grid'"
											class="h-5 w-5"
											aria-hidden="true"
										/>
									</span>

									<!-- النص -->
									<span class="min-w-0 flex-1">
										<span
											class="block truncate text-sm font-semibold"
											:class="
												item.active ? 'text-emerald-800' : 'text-gray-900'
											"
										>
											{{ item.label }}
										</span>

										<span
											v-if="item.description"
											class="mt-0.5 block line-clamp-1 text-xs text-gray-500"
										>
											{{ item.description }}
										</span>
									</span>

									<!-- الشارة -->
									<span
										v-if="item.badge !== undefined"
										class="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 text-[11px] font-bold text-gray-600"
									>
										{{ item.badge }}
									</span>

									<!-- الحالة النشطة -->
									<span
										v-if="item.active"
										class="h-2 w-2 shrink-0 rounded-full bg-emerald-600"
										aria-label="نشط"
									/>

									<!-- السهم -->
									<FeatherIcon
										name="chevron-left"
										class="h-4 w-4 shrink-0 text-gray-300 transition-all group-hover:-translate-x-0.5 group-hover:text-gray-500"
										aria-hidden="true"
									/>
								</button>
							</template>
						</div>

						<!-- مساحة المساعدة -->
						<div
							v-if="helperText"
							class="mt-4 flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
						>
							<FeatherIcon
								name="info"
								class="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
								aria-hidden="true"
							/>

							<p class="text-xs leading-5 text-gray-500">
								{{ helperText }}
							</p>
						</div>
					</div>
				</main>

				<!-- ========================= -->
				<!-- التذييل -->
				<!-- ========================= -->

				<footer class="shrink-0 border-t border-gray-200 bg-white">
					<slot name="footer">
						<div class="flex min-h-[52px] items-center justify-between gap-3 px-5">
							<span class="text-[11px] text-gray-400"> نظام نقاط البيع </span>

							<span
								class="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-400"
							>
								<span
									class="h-1.5 w-1.5 rounded-full bg-emerald-500"
									aria-hidden="true"
								/>

								جاهز للعمل
							</span>
						</div>
					</slot>
				</footer>
			</aside>
		</Transition>
	</Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},

	title: {
		type: String,
		default: "إدارة نقطة البيع",
	},

	description: {
		type: String,
		default: "الوصول السريع إلى وظائف التشغيل",
	},

	items: {
		type: Array,
		default: () => [],
	},

	loading: {
		type: Boolean,
		default: false,
	},

	error: {
		type: String,
		default: "",
	},

	retryable: {
		type: Boolean,
		default: false,
	},

	busy: {
		type: Boolean,
		default: false,
	},

	closeOnBackdrop: {
		type: Boolean,
		default: true,
	},

	closeOnEscape: {
		type: Boolean,
		default: true,
	},

	emptyIcon: {
		type: String,
		default: "inbox",
	},

	emptyTitle: {
		type: String,
		default: "لا توجد خيارات متاحة",
	},

	emptyDescription: {
		type: String,
		default: "لا توجد وظائف متاحة حاليًا وفق الصلاحيات والإعدادات الحالية.",
	},

	loadingText: {
		type: String,
		default: "جارٍ تحميل الوظائف",
	},

	breadcrumb: {
		type: String,
		default: "",
	},

	showBack: {
		type: Boolean,
		default: false,
	},

	backLabel: {
		type: String,
		default: "رجوع",
	},

	helperText: {
		type: String,
		default: "",
	},
})

const emit = defineEmits([
	"update:modelValue",
	"open",
	"close",
	"item-clicked",
	"retry",
	"back",
])

const panelRef = ref(null)
const contentRef = ref(null)
const closeButtonRef = ref(null)

const titleId = `management-slider-${Math.random().toString(36).slice(2, 10)}`

const closeLabel = "إغلاق"

const previousActiveElement = ref(null)

const focusableSelector = [
	"button:not([disabled])",
	"a[href]",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",")

const focusableElements = computed(() => {
	if (!panelRef.value) return []

	return Array.from(panelRef.value.querySelectorAll(focusableSelector))
})

function open() {
	if (props.modelValue) return

	emit("update:modelValue", true)
	emit("open")
}

function close() {
	if (!props.modelValue || props.busy) return

	emit("update:modelValue", false)
	emit("close")
}

function handleBackdropClick() {
	if (!props.closeOnBackdrop || props.busy) return

	close()
}

function handleItemClick(item) {
	if (props.busy || item.disabled || item.type === "section") {
		return
	}

	emit("item-clicked", item)
}

function getItemClasses(item) {
	if (props.busy || item.disabled) {
		return "cursor-not-allowed opacity-50"
	}

	if (item.active) {
		return "bg-emerald-50/70 hover:bg-emerald-50"
	}

	return "bg-white hover:bg-gray-50 active:bg-gray-100"
}

function lockPage() {
	document.documentElement.classList.add("dypos-management-slider-open")

	document.body.classList.add("dypos-management-slider-open")
}

function unlockPage() {
	document.documentElement.classList.remove("dypos-management-slider-open")

	document.body.classList.remove("dypos-management-slider-open")
}

async function focusInitialElement() {
	await nextTick()

	const first = closeButtonRef.value || focusableElements.value[0]

	first?.focus()
}

function restoreFocus() {
	const element = previousActiveElement.value

	if (
		element &&
		typeof element.focus === "function" &&
		document.contains(element)
	) {
		element.focus()
	}

	previousActiveElement.value = null
}

function handleKeydown(event) {
	if (event.key === "Escape") {
		if (!props.closeOnEscape) return

		event.preventDefault()
		close()

		return
	}

	if (event.key !== "Tab") return

	const elements = focusableElements.value

	if (!elements.length) {
		event.preventDefault()
		return
	}

	const first = elements[0]
	const last = elements[elements.length - 1]

	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()

		return
	}

	if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

function handleGlobalKeydown(event) {
	if (!props.modelValue) return

	if (event.key === "Escape") {
		handleKeydown(event)
	}
}

watch(
	() => props.modelValue,
	async (visible) => {
		if (visible) {
			previousActiveElement.value = document.activeElement

			lockPage()

			await focusInitialElement()

			return
		}

		unlockPage()

		await nextTick()

		restoreFocus()
	},
	{
		immediate: true,
	},
)

onMounted(() => {
	document.addEventListener("keydown", handleGlobalKeydown)

	if (props.modelValue) {
		lockPage()
	}
})

onBeforeUnmount(() => {
	document.removeEventListener("keydown", handleGlobalKeydown)

	unlockPage()
})
</script>

<style scoped>
/*
 * تحسين تجربة اللمس في شاشات نقاط البيع.
 */
button {
	-webkit-tap-highlight-color: transparent;
}

/*
 * تمرير سلس ومناسب للشاشات اللمسية.
 */
main {
	-webkit-overflow-scrolling: touch;
	scrollbar-width: thin;
}

/*
 * منع تأثير الحركة للمستخدم الذي اختار
 * تقليل الحركة من إعدادات النظام.
 */
@media (prefers-reduced-motion: reduce) {
	aside,
	aside *,
	div {
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}
}

/*
 * الشاشات الصغيرة جدًا.
 */
@media (max-width: 430px) {
	aside {
		max-width: 100vw;
	}
}

/*
 * دعم الشاشات التي يكون ارتفاعها محدودًا.
 */
@media (max-height: 640px) {
	header > div {
		min-height: 64px;
	}

	footer {
		display: none;
	}
}
</style>

<style>
/*
 * قفل تمرير الصفحة خلف لوحة الإدارة.
 *
 * تم وضعه خارج scoped لأن العنصر المستهدف
 * هو html/body.
 */
html.dypos-management-slider-open,
body.dypos-management-slider-open {
	overflow: hidden !important;
}

body.dypos-management-slider-open {
	touch-action: none;
}
</style>
