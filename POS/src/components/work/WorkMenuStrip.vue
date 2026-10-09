/**
 * WorkMenuStrip — شريط قوائم/إجراءات أساسي بأزرار واختصارات لوحة المفاتيح.
 *
 *  - `role="toolbar"` + roving tabindex (زر واحد في ترتيب Tab).
 *  - تنقّل الأسهم مع احترام RTL: في RTL يصبح السهم الأيمن "التالي".
 *  - Home/End لأول/آخر عنصر، والعنصر المعطّل يُتخطّى.
 *  - اختصارات عالمية (`shortcut: "ctrl+s"`) تعمل من أي مكان في الصفحة ما لم
 *    يكن التركيز داخل حقل إدخال — ومعها `preventDefault` فقط حين ينفَّذ
 *    فعليًا (زر معطّل = لا امتصاص للمفتاح).
 *  - `aria-keyshortcuts` بصيغة W3C + عرض بصري داخل عنصر kbd (aria-hidden).
 *
 * Items: [{ id, label, icon?, shortcut?, disabled?, reason?, handler }]
 * Emits: select(item)
 */
<template>
	<div
		class="work-menu-strip"
		role="toolbar"
		:aria-label="ariaLabel"
		@keydown="onItemKeydown"
	>
		<div ref="scrollRef" class="work-menu-strip__scroll">
			<ActionButton
				v-for="(item, index) in items"
				:key="item.id"
				type="button"
				variant="ghost"
				class="work-menu-strip__item"
				:class="{ 'work-menu-strip__item--disabled': item.disabled }"
				:tabindex="index === focusIndex ? 0 : -1"
				:aria-disabled="item.disabled || undefined"
				:title="item.reason || undefined"
				:aria-keyshortcuts="ariaKeyshortcuts(item.shortcut)"
				:aria-label="item.shortcut ? `${t(item.label)} (${shortcutDisplay(item.shortcut)})` : undefined"
				@click="run(item)"
				@focus="focusIndex = index"
			>
				<FeatherIcon
					v-if="item.icon"
					:name="item.icon"
					class="work-menu-strip__icon"
					aria-hidden="true"
				/>
				<span class="work-menu-strip__label">{{ t(item.label) }}</span>
				<kbd v-if="item.shortcut" class="work-menu-strip__shortcut" aria-hidden="true">
					{{ shortcutDisplay(item.shortcut) }}
				</kbd>
			</ActionButton>
		</div>

		<div v-if="$slots.end" class="work-menu-strip__end">
			<slot name="end" />
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { ActionButton, FeatherIcon } from "dypos-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** [{ id, label, icon?, shortcut?, disabled?, reason?, handler }] */
	items: { type: Array, default: () => [] },
	/** aria-label للشريط (عربية). */
	ariaLabel: { type: String, default: "القائمة الأساسية" },
})

const emit = defineEmits(["select", "denied"])

const scrollRef = ref(/** @type {HTMLElement|null} */ (null))
const focusIndex = ref(0)

/**
 * أزرار الشريط بترتيب DOM الفعلي — أبسط من ref لكل صف: العنصر المُشاهَد هو
 * ما يُستقبل التركيز، فلا وسائط (component instances) تدخل حساب focus().
 */
function itemEl(index) {
	const buttons = scrollRef.value?.querySelectorAll("button")
	return buttons?.[index] ?? null
}

function focusItem(index) {
	const el = itemEl(index)
	el?.focus()
	el?.scrollIntoView({ block: "nearest", inline: "nearest" })
}

const enabledIndexes = computed(() =>
	props.items.reduce(
		(acc, item, index) => {
			if (!item.disabled) acc.push(index)
			return acc
		},
		/** @type {number[]} */ ([]),
	),
)

/** اتجاه النص الفعلي (الملف يُستضاف داخل #dypos-app الذي يحمل dir). */
function isRtl() {
	if (typeof document === "undefined") return false
	const dir =
		document.getElementById("dypos-app")?.dir ||
		document.documentElement.dir ||
		"ltr"
	return dir === "rtl"
}

function moveFocus(delta) {
	const enabled = enabledIndexes.value
	if (enabled.length === 0) return
	const currentPos = enabled.indexOf(focusIndex.value)
	const nextPos =
		currentPos === -1
			? 0
			: (currentPos + delta + enabled.length) % enabled.length
	focusIndex.value = enabled[nextPos]
	focusItem(focusIndex.value)
}

function focusEdge(which) {
	const enabled = enabledIndexes.value
	if (enabled.length === 0) return
	focusIndex.value =
		which === "first" ? enabled[0] : enabled[enabled.length - 1]
	focusItem(focusIndex.value)
}

function onItemKeydown(event) {
	const rtl = isRtl()
	switch (event.key) {
		case "ArrowRight":
			event.preventDefault()
			moveFocus(rtl ? -1 : 1)
			break
		case "ArrowLeft":
			event.preventDefault()
			moveFocus(rtl ? 1 : -1)
			break
		case "ArrowDown":
			event.preventDefault()
			moveFocus(1)
			break
		case "ArrowUp":
			event.preventDefault()
			moveFocus(-1)
			break
		case "Home":
			event.preventDefault()
			focusEdge("first")
			break
		case "End":
			event.preventDefault()
			focusEdge("last")
			break
	}
}

function run(item) {
	// No native `disabled`: a disabled button fires nothing, so touch users
	// met silence. `aria-disabled` keeps it perceivable and the denial is
	// announced with its reason instead of swallowed.
	if (item.disabled) {
		emit("denied", item)
		return
	}
	emit("select", item)
	item.handler?.()
}

/* ── الاختصارات العالمية ────────────────────────────────────────────── */

/** "ctrl+s" → { ctrl, alt, shift, meta, key } */
function parseShortcut(shortcut) {
	if (!shortcut) return null
	const parts = String(shortcut).toLowerCase().split("+")
	const out = { ctrl: false, alt: false, shift: false, meta: false, key: "" }
	for (const part of parts) {
		if (part === "ctrl" || part === "control") out.ctrl = true
		else if (part === "alt" || part === "option") out.alt = true
		else if (part === "shift") out.shift = true
		else if (part === "meta" || part === "cmd" || part === "command")
			out.meta = true
		else out.key = part
	}
	return out.key ? out : null
}

/** W3C aria-keyshortcuts value: "Control+S". */
function ariaKeyshortcuts(shortcut) {
	const parsed = parseShortcut(shortcut)
	if (!parsed) return undefined
	const mods = []
	if (parsed.ctrl) mods.push("Control")
	if (parsed.alt) mods.push("Alt")
	if (parsed.shift) mods.push("Shift")
	if (parsed.meta) mods.push("Meta")
	const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key
	return [...mods, key].join("+")
}

/** "ctrl+shift+e" → "Ctrl+Shift+E" (للعرض داخل <kbd>). */
function shortcutDisplay(shortcut) {
	const parsed = parseShortcut(shortcut)
	if (!parsed) return ""
	const mods = []
	if (parsed.ctrl) mods.push("Ctrl")
	if (parsed.alt) mods.push("Alt")
	if (parsed.shift) mods.push("Shift")
	if (parsed.meta) mods.push("⌘")
	const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key
	return [...mods, key].join("+")
}

/**
 * الحرف من `event.code` — لأن تخطيط لوحة المفاتيح العربية يُعيد `event.key`
 * بحرف عربي ولا يطابق أبدًا مفتاح الاختصار اللاتيني.
 */
function eventKeyMatches(event, key) {
	const fromKey = String(event.key || "").toLowerCase()
	if (fromKey === key) return true
	const code = String(event.code || "")
	if (code.startsWith("Key") && code.length === 4) {
		return code.slice(3).toLowerCase() === key
	}
	if (code.startsWith("Digit") && code.length === 6) {
		return code.slice(5) === key
	}
	if (code.startsWith("Numpad") && code.length === 7) {
		return code.slice(6) === key
	}
	return false
}

function isTypingContext(target) {
	if (!(target instanceof Element)) return false
	const tag = target.tagName
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
	return Boolean(target.isContentEditable)
}

function onGlobalKeydown(event) {
	for (const item of props.items) {
		const parsed = parseShortcut(item.shortcut)
		if (!parsed || item.disabled) continue
		// مطابقة تامة للمعدِّلات: "ctrl+s" لا يلتقط "ctrl+shift+s" والعكس.
		if (event.ctrlKey !== parsed.ctrl) continue
		if (event.altKey !== parsed.alt) continue
		if (event.metaKey !== parsed.meta) continue
		if (event.shiftKey !== parsed.shift) continue
		if (!eventKeyMatches(event, parsed.key)) continue
		if (isTypingContext(event.target)) return
		event.preventDefault()
		run(item)
		return
	}
}

onMounted(() => document.addEventListener("keydown", onGlobalKeydown))
onBeforeUnmount(() => document.removeEventListener("keydown", onGlobalKeydown))
</script>

<style scoped>
.work-menu-strip {
	display: flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
	min-width: 0;
	border-bottom: 1px solid var(--dy-border, #e2e8f0);
	background: var(--dy-color-surface-base, #fff);
	padding: 0 var(--dy-spacing-4, 16px);
}

.work-menu-strip__scroll {
	display: flex;
	align-items: center;
	gap: 2px;
	min-width: 0;
	overflow-x: auto;
	scrollbar-width: none;
	scroll-behavior: smooth;
	padding: 6px 0;
}
.work-menu-strip__scroll::-webkit-scrollbar {
	display: none;
}

.work-menu-strip__item {
	display: inline-flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
	flex-shrink: 0;
	min-height: 40px;
	padding: 0 var(--dy-spacing-3, 12px);
	border: 0;
	border-radius: var(--dy-radius-md, 8px);
	background: transparent;
	color: var(--dy-text-muted, #475569);
	font-family: inherit;
	font-size: 0.875rem;
	font-weight: 500;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color var(--dy-motion-duration-fast, 100ms),
		color var(--dy-motion-duration-fast, 100ms);
}

.work-menu-strip__item:hover:not(:disabled) {
	background: var(--dy-bg-hover, #f1f5f9);
	color: var(--dy-text, #0f172a);
}

.work-menu-strip__item:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--dy-a11y-focus-ring-color, #059669);
	color: var(--dy-text, #0f172a);
}

.work-menu-strip__item--disabled,
.work-menu-strip__item:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.work-menu-strip__label {
	line-height: 1;
}

.work-menu-strip__shortcut {
	display: inline-flex;
	align-items: center;
	min-width: 20px;
	height: 20px;
	padding: 0 5px;
	border: 1px solid var(--dy-border, #e2e8f0);
	border-bottom-width: 2px;
	border-radius: 5px;
	background: var(--dy-bg-sunken, #f8fafc);
	color: var(--dy-text-muted, #64748b);
	font-family: var(--dy-font-mono, ui-monospace, monospace);
	font-size: 0.6875rem;
	line-height: 1;
}

.work-menu-strip__end {
	display: flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
	margin-inline-start: auto;
	flex-shrink: 0;
}

/* شاشات اللمس: هدف لمس ≥ 44px (S0 — العتاد الرخيص). */
@media (pointer: coarse) {
	.work-menu-strip__item {
		min-height: 44px;
	}
}

@media (max-width: 640px) {
	.work-menu-strip {
		padding: 0 var(--dy-spacing-3, 12px);
	}
	.work-menu-strip__shortcut {
		display: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.work-menu-strip__scroll {
		scroll-behavior: auto;
	}
	.work-menu-strip__item {
		transition: none;
	}
}

@media (forced-colors: active) {
	.work-menu-strip__item:focus-visible {
		outline: 2px solid Highlight;
	}
	.work-menu-strip__item[aria-disabled="true"],
	.work-menu-strip__item:disabled {
		color: GrayText;
	}
}
</style>
