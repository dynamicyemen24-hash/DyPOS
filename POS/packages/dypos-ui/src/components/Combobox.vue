<template>
	<div ref="rootRef" class="dy-combobox" :class="{ 'dy-combobox--disabled': disabled }">
		<label v-if="label" :for="inputId" class="dy-combobox__label">{{ label }}</label>

		<div class="dy-combobox__control">
			<input
				:id="inputId"
				ref="inputRef"
				type="text"
				role="combobox"
				class="dy-combobox__input"
				:placeholder="placeholder"
				:disabled="disabled"
				:value="query"
				:aria-expanded="open ? 'true' : 'false'"
				:aria-controls="listId"
				:aria-autocomplete="'list'"
				:aria-activedescendant="open && activeId ? activeId : undefined"
				:aria-label="label || ariaLabel || undefined"
				autocomplete="off"
				@input="onInput"
				@focus="onFocus"
				@blur="onBlur"
				@keydown="onKeydown"
			/>

			<button
				v-if="clearable && modelValue != null && modelValue !== '' && !disabled"
				type="button"
				class="dy-combobox__clear"
				:aria-label="clearLabel"
				@click="clear"
			>
				<FeatherIcon name="x" class="h-4 w-4" aria-hidden="true" />
			</button>

			<button
				v-else
				type="button"
				class="dy-combobox__toggle"
				:tabindex="-1"
				:aria-hidden="true"
				@click="toggle"
			>
				<FeatherIcon
					:name="open ? 'chevron-up' : 'chevron-down'"
					class="h-4 w-4"
					aria-hidden="true"
				/>
			</button>
		</div>

		<Transition name="dy-combobox-pop">
			<ul
				v-if="open"
				:id="listId"
				ref="listRef"
				role="listbox"
				:aria-label="label || ariaLabel || placeholder"
				class="dy-combobox__list"
			>
				<li
					v-for="(option, index) in filtered"
					:key="String(option.value)"
					:id="optionId(index)"
					role="option"
					class="dy-combobox__option"
					:class="{ 'dy-combobox__option--active': index === activeIndex }"
					:aria-selected="option.value === modelValue"
					@mousedown.prevent="select(option)"
					@mouseenter="activeIndex = index"
				>
					<span class="dy-combobox__option-label">{{ option.label }}</span>
					<FeatherIcon
						v-if="option.value === modelValue"
						name="check"
						class="h-4 w-4 shrink-0 text-[var(--dy-color-brand-500,#10b981)]"
						aria-hidden="true"
					/>
				</li>
				<li v-if="filtered.length === 0" class="dy-combobox__empty" role="presentation">
					{{ emptyText }}
				</li>
			</ul>
		</Transition>

		<p v-if="error" :id="errorId" class="dy-combobox__error" role="alert">
			{{ error }}
		</p>
	</div>
</template>

<script setup>
/**
 * Combobox — قائمة اختيار قابلة للوصول مع بحث داخلي (WAI-ARIA APG).
 *
 * المتصل (`role="combobox"` + `aria-expanded` + `aria-activedescendant`) على
 * عنصر إدخال حقيقي، فالبحث يبقى إدخالًا لصيانته (الجهاز اللوحي يفتح لوحة
 * المفاتيح بضغطة واحدة). التطابق يتجاهل التشكيل ويراعي RTL لأن المطابقة على
 * النص الخام لا الاتجاه.
 *
 * Slots: none — label/placeholder/clear عبر props؛ options: [{label, value, disabled}].
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import FeatherIcon from "./FeatherIcon.vue"

const props = defineProps({
	/** Selected value (v-model). */
	modelValue: { type: [String, Number, Boolean], default: null },
	/** [{ label, value, disabled? }] */
	options: { type: Array, default: () => [] },
	/** Visible label (also the accessible name of the input). */
	label: { type: String, default: "" },
	/** Accessible name when no visible label is rendered. */
	ariaLabel: { type: String, default: "" },
	placeholder: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
	clearable: { type: Boolean, default: true },
	clearLabel: { type: String, default: "مسح" },
	/** Message rendered under the control (role=alert). */
	error: { type: String, default: "" },
	/** No-results text (Arabic). */
	emptyText: { type: String, default: "لا توجد نتائج" },
	/** Unique id override (defaults to a generated one). */
	id: { type: String, default: "" },
})

const emit = defineEmits([
	"update:modelValue",
	"select",
	"clear",
	"focus",
	"blur",
	"search",
])

const inputRef = ref(/** @type {HTMLInputElement|null} */ (null))
const rootRef = ref(/** @type {HTMLElement|null} */ (null))
const open = ref(false)
const query = ref("")
const activeIndex = ref(-1)

const uid = `dy-combobox-${Math.random().toString(36).slice(2, 10)}`
const inputId = computed(() => props.id || uid)
const listId = `${inputId.value}-list`
const errorId = `${inputId.value}-error`

/** نص الخيار المحدد — يُطبع في الحقل حين لا يُكتب المستخدم بحثًا. */
const selectedLabel = computed(() => {
	const found = props.options.find((o) => o.value === props.modelValue)
	return found ? found.label : ""
})

/** تطبيع للمطابقة: يزيل التشكيل ويمرر بالأحرف اللاتينية/العربية المتشابهة. */
function normalize(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[ً-ْٰـ]/g, "")
}

const filtered = computed(() => {
	const needle = normalize(query.value)
	if (!needle) return props.options.map(toOption)
	return props.options
		.map(toOption)
		.filter((o) => normalize(o.label).includes(needle))
})

function toOption(raw) {
	return raw && typeof raw === "object"
		? {
				label: String(raw.label ?? raw.value ?? ""),
				value: raw.value,
				disabled: Boolean(raw.disabled),
			}
		: { label: String(raw), value: raw, disabled: false }
}

const activeId = computed(() =>
	activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
)

function optionId(index) {
	return `${listId}-option-${index}`
}

function onInput(event) {
	query.value = event.target.value
	activeIndex.value = filtered.value.length > 0 ? 0 : -1
	emit("search", query.value)
	open.value = true
}

function onFocus() {
	emit("focus")
	open.value = true
	if (!query.value && selectedLabel.value) query.value = ""
}

function onBlur() {
	// يُعيد النص المُطبَوع عند فقدان التركيز دون تحديد (القائمة تُغلق قبل
	// فقدان التركيز في سلوك mousedown.prevent، لكن ضغطة Tab تمر هنا).
	if (!open.value) query.value = selectedLabel.value
	emit("blur")
}

function onKeydown(event) {
	if (event.key === "ArrowDown") {
		event.preventDefault()
		if (!open.value) {
			open.value = true
			activeIndex.value = 0
			return
		}
		if (filtered.value.length === 0) return
		activeIndex.value = (activeIndex.value + 1) % filtered.value.length
		scrollActiveIntoView()
	} else if (event.key === "ArrowUp") {
		event.preventDefault()
		if (!open.value) {
			open.value = true
			activeIndex.value = filtered.value.length - 1
			return
		}
		if (filtered.value.length === 0) return
		activeIndex.value =
			(activeIndex.value - 1 + filtered.value.length) % filtered.value.length
		scrollActiveIntoView()
	} else if (event.key === "Home" && open.value) {
		event.preventDefault()
		activeIndex.value = 0
		scrollActiveIntoView()
	} else if (event.key === "End" && open.value) {
		event.preventDefault()
		activeIndex.value = filtered.value.length - 1
		scrollActiveIntoView()
	} else if (event.key === "Enter") {
		if (
			open.value &&
			activeIndex.value >= 0 &&
			filtered.value[activeIndex.value]
		) {
			event.preventDefault()
			select(filtered.value[activeIndex.value])
		}
	} else if (event.key === "Escape") {
		if (open.value) {
			event.preventDefault()
			open.value = false
			activeIndex.value = -1
			query.value = selectedLabel.value
		}
	} else if (event.key === "Tab") {
		open.value = false
		query.value = selectedLabel.value
	}
}

function scrollActiveIntoView() {
	nextTick(() => {
		const el = document.getElementById(optionId(activeIndex.value))
		el?.scrollIntoView({ block: "nearest" })
	})
}

function select(option) {
	if (option.disabled) return
	emit("update:modelValue", option.value)
	emit("select", option)
	query.value = option.label
	open.value = false
	activeIndex.value = -1
	inputRef.value?.focus()
}

function clear() {
	emit("update:modelValue", null)
	emit("clear")
	query.value = ""
	activeIndex.value = -1
	inputRef.value?.focus()
}

function toggle() {
	if (props.disabled) return
	if (open.value) {
		open.value = false
		query.value = selectedLabel.value
	} else {
		open.value = true
		inputRef.value?.focus()
	}
}

/** اغلاق عند الضغط خارج الجذر. */
function handleClickOutside(event) {
	if (open.value && rootRef.value && !rootRef.value.contains(event.target)) {
		open.value = false
		query.value = selectedLabel.value
	}
}

watch(
	() => props.modelValue,
	() => {
		// لا نمسح استعلام المستخدم أثناء الكتابة — فقط حين يكون الحقل غير مُركَّز.
		if (document.activeElement !== inputRef.value)
			query.value = selectedLabel.value
	},
	{ immediate: true },
)

onMounted(() => document.addEventListener("mousedown", handleClickOutside))
onBeforeUnmount(() =>
	document.removeEventListener("mousedown", handleClickOutside),
)
</script>

<style scoped>
.dy-combobox {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: var(--dy-spacing-1, 4px);
}

.dy-combobox__label {
	font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
	font-weight: var(--dy-font-weight-medium, 500);
	color: var(--dy-color-text-secondary, #334155);
}

.dy-combobox__control {
	position: relative;
	display: flex;
	align-items: center;
}

.dy-combobox__input {
	width: 100%;
	height: var(--dy-components-input-height-md, 40px);
	padding: 0 36px;
	border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
	border-radius: var(--dy-radius-lg, 8px);
	background: var(--dy-color-surface-base, #ffffff);
	color: var(--dy-color-text-primary, #0f172a);
	font-family: var(--dy-font-family-sans, inherit);
	font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
	line-height: 1.5;
	transition:
		border-color var(--dy-motion-duration-fast, 100ms),
		box-shadow var(--dy-motion-duration-fast, 100ms);
}

.dy-combobox__input::placeholder {
	color: var(--dy-color-text-disabled, #94a3b8);
}

.dy-combobox__input:focus {
	outline: none;
	border-color: var(--dy-color-brand-500, #10b981);
	box-shadow:
		0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
		0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px))
			var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.dy-combobox__input:disabled {
	background: var(--dy-color-surface-overlay, #f8fafc);
	color: var(--dy-color-text-disabled, #94a3b8);
	cursor: not-allowed;
}

.dy-combobox__clear,
.dy-combobox__toggle {
	position: absolute;
	inset-inline-end: 8px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: var(--dy-radius-md, 6px);
	color: var(--dy-color-text-muted, #64748b);
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0;
}

.dy-combobox__clear:hover,
.dy-combobox__toggle:hover {
	background: var(--dy-color-surface-sunken, #f1f5f9);
	color: var(--dy-color-text-primary, #0f172a);
}

.dy-combobox__clear:focus-visible,
.dy-combobox__toggle:focus-visible {
	outline: none;
	box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.dy-combobox__list {
	position: absolute;
	top: calc(100% + 4px);
	inset-inline: 0;
	z-index: var(--dy-zIndex-dropdown, 100);
	max-height: 260px;
	overflow-y: auto;
	margin: 0;
	padding: var(--dy-spacing-1, 4px);
	list-style: none;
	background: var(--dy-color-surface-base, #ffffff);
	border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
	border-radius: var(--dy-radius-lg, 8px);
	box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
	scrollbar-width: thin;
}

.dy-combobox__option {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--dy-spacing-2, 8px);
	padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
	border-radius: var(--dy-radius-md, 6px);
	cursor: pointer;
	font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
	color: var(--dy-color-text-primary, #0f172a);
}

.dy-combobox__option--active {
	background: var(--dy-color-surface-overlay, #f8fafc);
}

.dy-combobox__option[aria-selected="true"] {
	background: var(--dy-color-brand-50, #ecfdf5);
	color: var(--dy-color-brand-700, #047857);
	font-weight: var(--dy-font-weight-medium, 500);
}

.dy-combobox__empty {
	padding: var(--dy-spacing-3, 12px);
	font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
	color: var(--dy-color-text-muted, #64748b);
	text-align: center;
}

.dy-combobox__error {
	margin: 0;
	font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
	color: var(--dy-color-status-danger-text, #991b1b);
}

.dy-combobox-pop-enter-active,
.dy-combobox-pop-leave-active {
	transition:
		opacity var(--dy-motion-duration-fast, 100ms),
		transform var(--dy-motion-duration-fast, 100ms);
}
.dy-combobox-pop-enter-from,
.dy-combobox-pop-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

@media (forced-colors: active) {
	.dy-combobox__input {
		border-color: CanvasText;
		background: Canvas;
		color: CanvasText;
	}
	.dy-combobox__option--active {
		background: Highlight;
		color: HighlightText;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dy-combobox-pop-enter-active,
	.dy-combobox-pop-leave-active {
		transition: none;
	}
}
</style>
