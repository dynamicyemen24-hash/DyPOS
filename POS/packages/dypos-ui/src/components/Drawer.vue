<template>
	<Teleport to="body">
		<Transition name="dy-drawer">
			<div
				v-if="modelValue"
				:dir="docDir"
				class="fixed inset-0 z-[9500] overflow-hidden"
				@click="onOverlayClick"
			>
				<div class="dy-drawer-backdrop absolute inset-0" aria-hidden="true" />
				<aside
					ref="panelRef"
					role="dialog"
					aria-modal="true"
					:aria-label="ariaLabel || title || undefined"
					tabindex="-1"
					class="dy-drawer-panel absolute inset-y-0 flex flex-col overflow-hidden border-[var(--dy-border)] bg-[var(--dy-surface)] text-start shadow-2xl outline-none"
					:class="[
						side === 'start' ? 'dy-drawer-panel--start' : 'dy-drawer-panel--end',
						{ 'dy-drawer-panel--sheet': sheet },
					]"
					@keydown.esc.stop="close"
					@keydown.tab="onTab"
				>
					<header
						v-if="title || $slots.header || closable"
						class="dy-drawer-header flex shrink-0 items-center justify-between gap-3 border-b border-[var(--dy-border)] px-4 py-3"
					>
						<slot name="header">
							<h2 class="truncate text-base font-semibold text-[var(--dy-text)]">
								{{ title }}
							</h2>
						</slot>
						<button
							v-if="closable"
							type="button"
							class="dy-drawer-close shrink-0 rounded-lg p-2 text-[var(--dy-text-muted)] transition-colors hover:bg-[var(--dy-bg-sunken)] hover:text-[var(--dy-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]"
							:aria-label="closeLabel"
							@click="close"
						>
							<FeatherIcon name="x" class="h-5 w-5" aria-hidden="true" />
						</button>
					</header>

					<div
						ref="bodyRef"
						class="dy-drawer-body min-h-0 flex-1 overflow-y-auto px-4 py-4"
						style="scrollbar-width: thin"
					>
						<slot />
					</div>

					<footer
						v-if="$slots.footer"
						class="dy-drawer-footer shrink-0 border-t border-[var(--dy-border)] px-4 py-3"
					>
						<slot name="footer" :close="close" />
					</footer>
				</aside>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
/**
 * Drawer — لوحة جانبية/سفلية (BaseDrawer).
 *
 * نفس عقد Dialog المُثبت: التركيز يدخل اللوحة ويعود إلى المُشغّل، Tab محبوس
 * داخلها، Escape يغلق، وقفل تمرير الجسم. الفرق الشكلي: تنزلق من الحافة
 * المنطقية (`inset-inline-end` — ينعكس تلقائيًا مع RTL) وتحت 640px تتحول إلى
 * لوحة سفلية (bottom sheet) لأن الحافة الجانبية على الجوال عرضها نصف الشاشة.
 *
 * Slots: default · header · footer({ close }).
 */
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import FeatherIcon from "./FeatherIcon.vue"

const props = defineProps({
	/** v-model open state. */
	modelValue: { type: Boolean, default: false },
	/** Accessible name for the panel (aria-label). */
	title: { type: String, default: "" },
	/** Explicit aria-label override (wins over title). */
	ariaLabel: { type: String, default: "" },
	/** الحافة المنطقية: end = trailing edge (يمين في LTR، يسار في RTL). */
	side: {
		type: String,
		default: "end",
		validator: (v) => ["start", "end"].includes(v),
	},
	/** إجبار وضع اللوحة السفلية حتى على الشاشات الكبيرة. */
	sheet: { type: Boolean, default: false },
	/** Show the header close button. */
	closable: { type: Boolean, default: true },
	/** Arabic aria-label for the close button. */
	closeLabel: { type: String, default: "إغلاق" },
	/** Blocks closing by clicking the backdrop. */
	disableOutsideClickToClose: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "close", "after-leave"])

const panelRef = ref(/** @type {HTMLElement|null} */ (null))
let previouslyFocused = null
let scrollLocked = false

/**
 * The panel is teleported to <body>, which lives OUTSIDE App.vue's `dir`
 * attribute — so `:dir(rtl)` CSS would never match. Resolve the document
 * direction once per open and stamp it on the overlay instead.
 */
const docDir = ref("ltr")

function resolveDir() {
	if (typeof document === "undefined") return "ltr"
	const appDir = document.getElementById("dypos-app")?.dir
	const htmlDir = document.documentElement.dir
	const value = appDir || htmlDir || "ltr"
	return value === "rtl" ? "rtl" : "ltr"
}

const FOCUSABLE =
	'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function close() {
	emit("update:modelValue", false)
	emit("close")
}

function onOverlayClick(event) {
	if (props.disableOutsideClickToClose) return
	// Only the overlay itself (not the panel) closes.
	if (
		event.target !== event.currentTarget &&
		!event.target.classList.contains("dy-drawer-backdrop")
	)
		return
	close()
}

/** Keep Tab inside the panel while it is open. */
function onTab(event) {
	const panel = panelRef.value
	if (!panel) return
	const focusable = [...panel.querySelectorAll(FOCUSABLE)]
	if (focusable.length === 0) {
		event.preventDefault()
		panel.focus()
		return
	}
	const first = focusable[0]
	const last = focusable[focusable.length - 1]
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

function lockScroll(lock) {
	if (lock === scrollLocked) return
	scrollLocked = lock
	document.body.style.overflow = lock ? "hidden" : ""
}

watch(
	() => props.modelValue,
	async (open) => {
		if (open) {
			docDir.value = resolveDir()
			previouslyFocused = document.activeElement
			lockScroll(true)
			await nextTick()
			const panel = panelRef.value
			const target = panel?.querySelector(FOCUSABLE) || panel
			target?.focus?.()
		} else {
			lockScroll(false)
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
			previouslyFocused = null
			emit("after-leave")
		}
	},
)

onBeforeUnmount(() => lockScroll(false))
</script>

<style>
.dy-drawer-backdrop {
	background: var(--dy-bg-overlay, rgba(15, 23, 42, 0.5));
}
.dy-drawer-panel {
	inset-inline-end: 0;
	width: min(420px, 94vw);
	border-inline-start: 1px solid var(--dy-border, #e2e8f0);
}
.dy-drawer-panel--start {
	inset-inline-end: auto;
	inset-inline-start: 0;
	border-inline-start: none;
	border-inline-end: 1px solid var(--dy-border, #e2e8f0);
}
/* اللوحة السفلية: على الجوال (أو بطلب صريح) تصبح bottom sheet بعرض كامل. */
@media (max-width: 640px) {
	.dy-drawer-panel,
	.dy-drawer-panel--start {
		inset-block: auto 0;
		inset-inline: 0;
		width: 100%;
		max-height: 86vh;
		border: none;
		border-top: 1px solid var(--dy-border, #e2e8f0);
		border-start-start-radius: 1rem;
		border-start-end-radius: 1rem;
	}
}
.dy-drawer-panel--sheet {
	inset-block: auto 0;
	inset-inline: 0;
	width: 100%;
	max-height: 86vh;
	border: none;
	border-top: 1px solid var(--dy-border, #e2e8f0);
	border-start-start-radius: 1rem;
	border-start-end-radius: 1rem;
}

.dy-drawer-enter-active,
.dy-drawer-leave-active {
	transition: opacity 150ms ease;
}
.dy-drawer-enter-active .dy-drawer-panel,
.dy-drawer-leave-active .dy-drawer-panel {
	transition: transform 180ms ease;
}
.dy-drawer-enter-from,
.dy-drawer-leave-to {
	opacity: 0;
}
/* Slide from the trailing edge — flipped for RTL (the panel is stamped with
   the resolved document dir, so this selector always matches its own tree). */
.dy-drawer-enter-from .dy-drawer-panel:not(.dy-drawer-panel--start),
.dy-drawer-leave-to .dy-drawer-panel:not(.dy-drawer-panel--start) {
	transform: translateX(100%);
}
[dir="rtl"] .dy-drawer-enter-from .dy-drawer-panel:not(.dy-drawer-panel--start),
[dir="rtl"] .dy-drawer-leave-to .dy-drawer-panel:not(.dy-drawer-panel--start) {
	transform: translateX(-100%);
}
.dy-drawer-enter-from .dy-drawer-panel--start,
.dy-drawer-leave-to .dy-drawer-panel--start {
	transform: translateX(-100%);
}
[dir="rtl"] .dy-drawer-enter-from .dy-drawer-panel--start,
[dir="rtl"] .dy-drawer-leave-to .dy-drawer-panel--start {
	transform: translateX(100%);
}
/* Bottom sheet slides up regardless of side. */
.dy-drawer-enter-from .dy-drawer-panel.dy-drawer-panel--sheet,
.dy-drawer-leave-to .dy-drawer-panel.dy-drawer-panel--sheet {
	transform: translateY(100%);
}
@media (max-width: 640px) {
	.dy-drawer-enter-from .dy-drawer-panel,
	.dy-drawer-leave-to .dy-drawer-panel {
		transform: translateY(100%);
	}
}
@media (prefers-reduced-motion: reduce) {
	.dy-drawer-enter-active,
	.dy-drawer-leave-active,
	.dy-drawer-enter-active .dy-drawer-panel,
	.dy-drawer-leave-active .dy-drawer-panel {
		transition: none;
	}
}
</style>
