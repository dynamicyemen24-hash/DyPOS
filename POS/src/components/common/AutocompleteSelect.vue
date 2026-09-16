<template>
	<div ref="containerRef" class="autocomplete-select" dir="rtl" :data-testid="testId">
		<div
			class="select-input-wrapper"
			:class="{
				'is-focused': isFocused,
				'is-disabled': disabled,
				'is-invalid': invalid,
			}"
		>
			<svg
				v-if="icon"
				class="input-icon"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icon" />
			</svg>

			<input
				ref="inputRef"
				v-model="searchQuery"
				type="text"
				role="combobox"
				:class="[
					'select-input',
					{
						'has-icon': icon,
						'has-value': hasValue,
						'has-error': invalid,
					},
				]"
				:placeholder="placeholder"
				:disabled="disabled"
				:readonly="readonly"
				:required="required"
				:aria-label="ariaLabel"
				:aria-expanded="showDropdown"
				:aria-controls="listboxId"
				:aria-activedescendant="activeDescendant"
				:aria-autocomplete="searchable ? 'list' : 'none'"
				:aria-invalid="invalid || undefined"
				:aria-describedby="describedBy"
				autocomplete="off"
				spellcheck="false"
				@focus="handleFocus"
				@input="handleInput"
				@keydown="handleKeydown"
				@blur="handleBlur"
			/>

			<div class="input-actions">
				<button
					v-if="hasValue && !disabled && !readonly"
					type="button"
					class="clear-btn"
					aria-label="مسح الاختيار"
					title="مسح الاختيار"
					@click.stop="clearSelection"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
						<path
							d="M6 18L18 6M6 6l12 12"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>

				<button
					type="button"
					class="dropdown-toggle"
					:class="{ 'is-open': showDropdown }"
					:disabled="disabled || readonly"
					:aria-label="showDropdown ? 'إغلاق القائمة' : 'فتح القائمة'"
					:aria-expanded="showDropdown"
					tabindex="-1"
					@click.stop="toggleDropdown"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
						<path
							d="M19 9l-7 7-7-7"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</div>
		</div>

		<p v-if="hint && !invalid" :id="hintId" class="field-hint">
			{{ hint }}
		</p>

		<p v-if="invalid && errorMessage" :id="errorId" class="field-error" role="alert">
			{{ errorMessage }}
		</p>

		<Transition name="dropdown">
			<div
				v-if="showDropdown"
				class="dropdown-menu"
				:class="{ 'dropdown-above': placement === 'top' }"
				:aria-busy="loading || undefined"
			>
				<!-- Loading -->
				<div
					v-if="loading && paginatedOptions.length === 0"
					class="dropdown-state"
					role="status"
					aria-live="polite"
				>
					<svg
						class="loading-spinner"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<circle
							cx="12"
							cy="12"
							r="9"
							stroke="currentColor"
							stroke-width="2.5"
							class="spinner-track"
						/>
						<path
							d="M21 12a9 9 0 0 0-9-9"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
						/>
					</svg>

					<span>{{ loadingText }}</span>
				</div>

				<!-- Error -->
				<div v-else-if="error" class="dropdown-state dropdown-error" role="alert">
					<svg
						class="state-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							d="M12 9v4m0 4h.01M10.3 3.8L2.7 17a2 2 0 001.73 3h15.14a2 2 0 001.73-3L13.7 3.8a2 2 0 00-3.4 0z"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>

					<span>{{ errorMessage || "تعذر تحميل النتائج" }}</span>

					<button
						v-if="retryable"
						type="button"
						class="retry-btn"
						@click="emit('retry')"
					>
						إعادة المحاولة
					</button>
				</div>

				<!-- Empty -->
				<div v-else-if="paginatedOptions.length === 0" class="dropdown-state">
					<svg
						class="state-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							d="M21 21l-5.2-5.2m2.2-5.8a8 8 0 11-16 0 8 8 0 0116 0z"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>

					<span>
						{{ searchQuery ? noResultsText : noOptionsText }}
					</span>
				</div>

				<!-- Options -->
				<div
					v-else
					:id="listboxId"
					ref="listRef"
					class="dropdown-list"
					role="listbox"
					:aria-label="ariaLabel"
				>
					<button
						v-if="!required && hasValue"
						type="button"
						class="dropdown-item clear-item"
						role="option"
						:aria-selected="false"
						@click="clearSelection"
					>
						<span class="item-icon danger-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									d="M6 18L18 6M6 6l12 12"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</span>

						<span class="item-content">
							<span class="item-label"> مسح الاختيار </span>
						</span>
					</button>

					<button
						v-for="(option, index) in paginatedOptions"
						:id="getOptionId(option, index)"
						:key="getOptionKey(option, index)"
						type="button"
						role="option"
						class="dropdown-item"
						:class="{
							active: isSelected(option),
							highlighted: index === highlightedIndex,
							disabled: option.disabled,
						}"
						:aria-selected="isSelected(option)"
						:aria-disabled="option.disabled || undefined"
						:disabled="option.disabled"
						@click="selectOption(option)"
					>
						<span class="item-leading">
							<svg
								v-if="isSelected(option)"
								class="check-icon"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									d="M5 13l4 4L19 7"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>

							<span v-else class="option-indicator" />
						</span>

						<span class="item-content">
							<span class="item-label" v-html="highlightMatch(option.label)" />

							<span v-if="option.subtitle" class="item-subtitle">
								{{ option.subtitle }}
							</span>
						</span>

						<span v-if="option.badge !== undefined" class="item-badge">
							{{ option.badge }}
						</span>
					</button>

					<button v-if="hasMore" type="button" class="load-more" @click="loadMore">
						<span>عرض المزيد</span>

						<span class="remaining-count">
							{{ remainingCount }}
						</span>

						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								d="M19 9l-7 7-7-7"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</div>

				<!-- Async searching while previous results remain -->
				<div
					v-if="loading && paginatedOptions.length > 0"
					class="inline-loading"
					role="status"
					aria-live="polite"
				>
					<svg class="mini-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle
							cx="12"
							cy="12"
							r="9"
							stroke="currentColor"
							stroke-width="2.5"
							class="spinner-track"
						/>
						<path
							d="M21 12a9 9 0 0 0-9-9"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
						/>
					</svg>

					<span>{{ loadingText }}</span>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"

const props = defineProps({
	modelValue: {
		type: [String, Number],
		default: "",
	},

	options: {
		type: Array,
		default: () => [],
	},

	placeholder: {
		type: String,
		default: "البحث...",
	},

	icon: {
		type: String,
		default: "",
	},

	ariaLabel: {
		type: String,
		default: "البحث والاختيار",
	},

	required: {
		type: Boolean,
		default: false,
	},

	disabled: {
		type: Boolean,
		default: false,
	},

	readonly: {
		type: Boolean,
		default: false,
	},

	loading: {
		type: Boolean,
		default: false,
	},

	searchable: {
		type: Boolean,
		default: true,
	},

	minSearchLength: {
		type: Number,
		default: 0,
	},

	searchDebounce: {
		type: Number,
		default: 250,
	},

	pageSize: {
		type: Number,
		default: 50,
	},

	maxVisibleItems: {
		type: Number,
		default: 0,
	},

	invalid: {
		type: Boolean,
		default: false,
	},

	errorMessage: {
		type: String,
		default: "",
	},

	hint: {
		type: String,
		default: "",
	},

	error: {
		type: Boolean,
		default: false,
	},

	retryable: {
		type: Boolean,
		default: false,
	},

	placement: {
		type: String,
		default: "bottom",
		validator: (value) => ["bottom", "top"].includes(value),
	},

	loadingText: {
		type: String,
		default: "جاري البحث...",
	},

	noResultsText: {
		type: String,
		default: "لا توجد نتائج مطابقة",
	},

	noOptionsText: {
		type: String,
		default: "لا توجد خيارات متاحة",
	},

	testId: {
		type: String,
		default: "",
	},
})

const emit = defineEmits([
	"update:modelValue",
	"search",
	"retry",
	"open",
	"close",
	"focus",
	"blur",
])

const containerRef = ref(null)
const inputRef = ref(null)
const listRef = ref(null)

const searchQuery = ref("")
const showDropdown = ref(false)
const highlightedIndex = ref(-1)
const displayLimit = ref(props.pageSize)
const isFocused = ref(false)

let searchTimer = null
let blurTimer = null

const uid = `dypos-autocomplete-${Math.random().toString(36).slice(2, 10)}`

const listboxId = `${uid}-listbox`
const hintId = `${uid}-hint`
const errorId = `${uid}-error`

const selectedOption = computed(() => {
	return props.options.find((option) => option.value === props.modelValue)
})

const hasValue = computed(() => {
	return (
		props.modelValue !== "" &&
		props.modelValue !== null &&
		props.modelValue !== undefined
	)
})

const activeDescendant = computed(() => {
	if (highlightedIndex.value < 0) return undefined

	const option = paginatedOptions.value[highlightedIndex.value]

	if (!option) return undefined

	return getOptionId(option, highlightedIndex.value)
})

const describedBy = computed(() => {
	const ids = []

	if (props.hint) ids.push(hintId)
	if (props.invalid && props.errorMessage) {
		ids.push(errorId)
	}

	return ids.length ? ids.join(" ") : undefined
})

const filteredOptions = computed(() => {
	const query = searchQuery.value.trim()

	if (!query || query === selectedOption.value?.label) {
		return props.options
	}

	if (!props.searchable) {
		return props.options
	}

	const normalizedQuery = normalizeText(query)

	return props.options.filter((option) => {
		if (option.disabled) return false

		const label = normalizeText(String(option.label ?? ""))

		const subtitle = normalizeText(String(option.subtitle ?? ""))

		const searchValue = normalizeText(String(option.searchValue ?? ""))

		return (
			label.includes(normalizedQuery) ||
			subtitle.includes(normalizedQuery) ||
			searchValue.includes(normalizedQuery)
		)
	})
})

const paginatedOptions = computed(() => {
	let options = filteredOptions.value.slice(0, displayLimit.value)

	if (props.maxVisibleItems > 0) {
		options = options.slice(0, props.maxVisibleItems)
	}

	return options
})

const hasMore = computed(() => {
	return filteredOptions.value.length > displayLimit.value
})

const remainingCount = computed(() => {
	return Math.max(filteredOptions.value.length - displayLimit.value, 0)
})

watch(
	() => props.modelValue,
	(newValue) => {
		if (
			newValue !== "" &&
			newValue !== null &&
			newValue !== undefined &&
			selectedOption.value
		) {
			searchQuery.value = selectedOption.value.label ?? ""
		} else if (!newValue) {
			searchQuery.value = ""
		}
	},
	{
		immediate: true,
	},
)

watch(
	() => props.options,
	() => {
		if (hasValue.value && selectedOption.value && !isFocused.value) {
			searchQuery.value = selectedOption.value.label ?? ""
		}
	},
	{
		deep: true,
	},
)

watch(
	() => props.pageSize,
	(value) => {
		displayLimit.value = Math.max(Number(value) || 50, 1)
	},
)

function normalizeText(value) {
	return String(value ?? "")
		.toLocaleLowerCase()
		.normalize("NFKC")
		.trim()
}

function getOptionKey(option, index) {
	return `${String(option.value)}-${index}`
}

function getOptionId(option, index) {
	return `${uid}-option-${String(option.value).replace(/[^a-zA-Z0-9_-]/g, "-")}-${index}`
}

function isSelected(option) {
	return option.value === props.modelValue
}

function handleFocus(event) {
	if (props.disabled || props.readonly) return

	isFocused.value = true

	clearTimeout(blurTimer)

	openDropdown()

	if (searchQuery.value) {
		nextTick(() => {
			inputRef.value?.select()
		})
	}

	emit("focus", event)
}

function handleBlur(event) {
	blurTimer = setTimeout(() => {
		if (containerRef.value?.contains(document.activeElement)) {
			return
		}

		isFocused.value = false
		closeDropdown()
		emit("blur", event)
	}, 120)
}

function handleInput() {
	if (props.disabled || props.readonly) return

	openDropdown()

	highlightedIndex.value = -1
	displayLimit.value = props.pageSize

	clearTimeout(searchTimer)

	const query = searchQuery.value.trim()

	/*
	 * عندما يبدأ المستخدم بتعديل القيمة المحددة،
	 * لا نعتبر القيمة القديمة محددة حتى يتم اختيار
	 * عنصر جديد فعليًا.
	 */
	if (selectedOption.value && query !== selectedOption.value.label) {
		emit("update:modelValue", "")
	}

	if (!props.searchable) return

	if (query.length < props.minSearchLength) {
		return
	}

	searchTimer = setTimeout(
		() => {
			emit("search", query)
		},
		Math.max(props.searchDebounce, 0),
	)
}

function handleKeydown(event) {
	if (props.disabled || props.readonly) return

	switch (event.key) {
		case "ArrowDown":
			event.preventDefault()

			if (!showDropdown.value) {
				openDropdown()
				return
			}

			moveHighlight(1)
			break

		case "ArrowUp":
			event.preventDefault()

			if (!showDropdown.value) {
				openDropdown()
				return
			}

			moveHighlight(-1)
			break

		case "Home":
			if (showDropdown.value) {
				event.preventDefault()
				setHighlight(0)
			}
			break

		case "End":
			if (showDropdown.value) {
				event.preventDefault()
				setHighlight(paginatedOptions.value.length - 1)
			}
			break

		case "Enter":
			if (showDropdown.value && highlightedIndex.value >= 0) {
				event.preventDefault()

				const option = paginatedOptions.value[highlightedIndex.value]

				if (option && !option.disabled) {
					selectOption(option)
				}
			}
			break

		case "Escape":
			if (showDropdown.value) {
				event.preventDefault()
				closeDropdown()
			}
			break

		case "Tab":
			closeDropdown()
			break

		default:
			break
	}
}

function moveHighlight(direction) {
	const options = paginatedOptions.value

	if (!options.length) return

	let nextIndex = highlightedIndex.value + direction

	if (nextIndex < 0) {
		nextIndex = options.length - 1
	}

	if (nextIndex >= options.length) {
		nextIndex = 0
	}

	let attempts = 0

	while (options[nextIndex]?.disabled && attempts < options.length) {
		nextIndex += direction

		if (nextIndex < 0) {
			nextIndex = options.length - 1
		}

		if (nextIndex >= options.length) {
			nextIndex = 0
		}

		attempts++
	}

	setHighlight(nextIndex)
}

function setHighlight(index) {
	highlightedIndex.value = index

	nextTick(() => {
		scrollToHighlighted()
	})
}

function scrollToHighlighted() {
	if (highlightedIndex.value < 0) return

	const option = paginatedOptions.value[highlightedIndex.value]

	if (!option) return

	const id = getOptionId(option, highlightedIndex.value)

	const element = document.getElementById(id)

	element?.scrollIntoView({
		block: "nearest",
		behavior: "smooth",
	})
}

function openDropdown() {
	if (props.disabled || props.readonly || showDropdown.value) {
		return
	}

	showDropdown.value = true
	highlightedIndex.value = -1
	displayLimit.value = props.pageSize

	emit("open")
}

function closeDropdown() {
	if (!showDropdown.value) return

	showDropdown.value = false
	highlightedIndex.value = -1

	restoreSelectedLabel()

	emit("close")
}

function toggleDropdown() {
	if (props.disabled || props.readonly) return

	if (showDropdown.value) {
		closeDropdown()
		return
	}

	inputRef.value?.focus()
	openDropdown()
}

function selectOption(option) {
	if (props.disabled || props.readonly || option?.disabled) {
		return
	}

	emit("update:modelValue", option.value)

	searchQuery.value = option.label !== undefined ? String(option.label) : ""

	closeDropdown()

	nextTick(() => {
		inputRef.value?.blur()
	})
}

function clearSelection() {
	if (props.disabled || props.readonly) return

	emit("update:modelValue", "")
	searchQuery.value = ""
	highlightedIndex.value = -1
	displayLimit.value = props.pageSize

	openDropdown()

	nextTick(() => {
		inputRef.value?.focus()
	})
}

function restoreSelectedLabel() {
	if (selectedOption.value) {
		searchQuery.value = selectedOption.value.label ?? ""
	} else if (!hasValue.value) {
		searchQuery.value = ""
	}
}

function loadMore() {
	displayLimit.value += props.pageSize

	nextTick(() => {
		scrollToHighlighted()
	})
}

/*
 * لا نستخدم v-html مع النص الأصلي مباشرة.
 * يتم escape للنص أولًا لمنع إدخال HTML غير موثوق.
 */
function highlightMatch(text) {
	const value = String(text ?? "")

	if (!searchQuery.value || searchQuery.value === selectedOption.value?.label) {
		return escapeHtml(value)
	}

	const query = searchQuery.value.trim()

	if (!query) {
		return escapeHtml(value)
	}

	const escapedText = escapeHtml(value)
	const escapedQuery = escapeRegExp(escapeHtml(query))

	return escapedText.replace(
		new RegExp(`(${escapedQuery})`, "giu"),
		"<mark>$1</mark>",
	)
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function handleClickOutside(event) {
	if (containerRef.value && !containerRef.value.contains(event.target)) {
		closeDropdown()
	}
}

function handleDocumentKeydown(event) {
	if (event.key === "Escape" && showDropdown.value) {
		closeDropdown()
		inputRef.value?.focus()
	}
}

onMounted(() => {
	document.addEventListener("mousedown", handleClickOutside)

	document.addEventListener("keydown", handleDocumentKeydown)
})

onUnmounted(() => {
	document.removeEventListener("mousedown", handleClickOutside)

	document.removeEventListener("keydown", handleDocumentKeydown)

	clearTimeout(searchTimer)
	clearTimeout(blurTimer)
})
</script>

<style scoped>
.autocomplete-select {
	position: relative;
	width: 100%;
	min-width: 0;
}

.select-input-wrapper {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 46px;
	background: #ffffff;
	border: 1px solid #d1d5db;
	border-radius: 0.75rem;
	transition:
		border-color 150ms ease,
		box-shadow 150ms ease,
		background-color 150ms ease;
}

.select-input-wrapper:hover:not(.is-disabled) {
	border-color: #a1a1aa;
}

.select-input-wrapper.is-focused {
	border-color: #059669;
	box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
}

.select-input-wrapper.is-invalid {
	border-color: #dc2626;
}

.select-input-wrapper.is-invalid.is-focused {
	box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.select-input-wrapper.is-disabled {
	background: #f9fafb;
	cursor: not-allowed;
}

.input-icon {
	position: absolute;
	inset-inline-start: 0.875rem;
	width: 1.125rem;
	height: 1.125rem;
	color: #6b7280;
	pointer-events: none;
	z-index: 1;
}

.select-input {
	width: 100%;
	min-width: 0;
	height: 44px;
	padding: 0.625rem 5rem 0.625rem 0.875rem;
	border: 0;
	border-radius: inherit;
	outline: none;
	background: transparent;
	color: #111827;
	font-size: 0.875rem;
	font-weight: 450;
	line-height: 1.25rem;
	text-align: start;
}

.select-input.has-icon {
	padding-inline-start: 2.75rem;
}

.select-input.has-value {
	font-weight: 600;
	color: #064e3b;
}

.select-input::placeholder {
	color: #9ca3af;
	font-weight: 400;
}

.select-input:disabled {
	cursor: not-allowed;
	color: #9ca3af;
}

.input-actions {
	position: absolute;
	inset-inline-end: 0.375rem;
	display: flex;
	align-items: center;
	gap: 0.125rem;
	z-index: 2;
}

.clear-btn,
.dropdown-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	padding: 0;
	border: 0;
	border-radius: 0.5rem;
	background: transparent;
	color: #6b7280;
	cursor: pointer;
	transition:
		background-color 150ms ease,
		color 150ms ease,
		transform 150ms ease;
}

.clear-btn:hover {
	background: #fef2f2;
	color: #dc2626;
}

.dropdown-toggle:hover:not(:disabled) {
	background: #f3f4f6;
	color: #111827;
}

.clear-btn:focus-visible,
.dropdown-toggle:focus-visible {
	outline: 2px solid #059669;
	outline-offset: 1px;
}

.clear-btn svg,
.dropdown-toggle svg {
	width: 17px;
	height: 17px;
}

.dropdown-toggle svg {
	transition: transform 180ms ease;
}

.dropdown-toggle.is-open svg {
	transform: rotate(180deg);
}

.dropdown-toggle:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.field-hint,
.field-error {
	margin: 0.375rem 0.25rem 0;
	font-size: 0.75rem;
	line-height: 1rem;
}

.field-hint {
	color: #6b7280;
}

.field-error {
	color: #dc2626;
	font-weight: 500;
}

.dropdown-menu {
	position: absolute;
	top: calc(100% + 0.5rem);
	inset-inline-start: 0;
	inset-inline-end: 0;
	z-index: 1000;
	overflow: hidden;
	background: #ffffff;
	border: 1px solid #e5e7eb;
	border-radius: 0.875rem;
	box-shadow:
		0 18px 40px rgba(15, 23, 42, 0.12),
		0 4px 12px rgba(15, 23, 42, 0.06);
}

.dropdown-menu.dropdown-above {
	top: auto;
	bottom: calc(100% + 0.5rem);
}

.dropdown-list {
	max-height: 330px;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: #cbd5e1 transparent;
}

.dropdown-list::-webkit-scrollbar {
	width: 6px;
}

.dropdown-list::-webkit-scrollbar-track {
	background: transparent;
}

.dropdown-list::-webkit-scrollbar-thumb {
	background: #cbd5e1;
	border-radius: 999px;
}

.dropdown-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.625rem;
	min-height: 150px;
	padding: 1.5rem;
	color: #6b7280;
	font-size: 0.8125rem;
	text-align: center;
}

.state-icon {
	width: 30px;
	height: 30px;
	color: #9ca3af;
}

.dropdown-error {
	color: #b91c1c;
}

.dropdown-error .state-icon {
	color: #dc2626;
}

.retry-btn {
	margin-top: 0.25rem;
	padding: 0.5rem 0.75rem;
	border: 1px solid #fecaca;
	border-radius: 0.5rem;
	background: #fef2f2;
	color: #b91c1c;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
}

.retry-btn:hover {
	background: #fee2e2;
}

.loading-spinner {
	width: 28px;
	height: 28px;
	color: #059669;
	animation: spin 700ms linear infinite;
}

.spinner-track {
	opacity: 0.2;
}

.dropdown-item {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	width: 100%;
	min-height: 52px;
	padding: 0.625rem 0.875rem;
	border: 0;
	border-bottom: 1px solid #f3f4f6;
	background: #ffffff;
	color: #111827;
	text-align: start;
	cursor: pointer;
	transition:
		background-color 100ms ease,
		color 100ms ease;
}

.dropdown-item:last-of-type {
	border-bottom: 0;
}

.dropdown-item:hover,
.dropdown-item.highlighted {
	background: #f8fafc;
}

.dropdown-item.active {
	background: #ecfdf5;
}

.dropdown-item.highlighted.active {
	background: #d1fae5;
}

.dropdown-item:focus-visible {
	position: relative;
	z-index: 1;
	outline: 2px solid #059669;
	outline-offset: -2px;
}

.dropdown-item.disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.item-leading {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	flex: 0 0 22px;
}

.check-icon {
	width: 18px;
	height: 18px;
	color: #059669;
}

.option-indicator {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #d1d5db;
}

.item-content {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	gap: 2px;
}

.item-label {
	overflow: hidden;
	color: #111827;
	font-size: 0.875rem;
	font-weight: 500;
	line-height: 1.25rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.dropdown-item.active .item-label {
	color: #065f46;
	font-weight: 650;
}

.item-label :deep(mark) {
	padding: 0 0.125rem;
	border-radius: 3px;
	background: #fef3c7;
	color: #92400e;
	font-weight: 700;
}

.item-subtitle {
	overflow: hidden;
	color: #6b7280;
	font-size: 0.75rem;
	line-height: 1rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.item-badge {
	flex: 0 0 auto;
	padding: 0.25rem 0.5rem;
	border-radius: 999px;
	background: #f3f4f6;
	color: #4b5563;
	font-size: 0.6875rem;
	font-weight: 700;
}

.clear-item {
	min-height: 46px;
	background: #fffafa;
	color: #b91c1c;
}

.clear-item:hover,
.clear-item.highlighted {
	background: #fef2f2;
}

.danger-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	color: #dc2626;
}

.danger-icon svg {
	width: 16px;
	height: 16px;
}

.load-more {
	justify-content: center;
	min-height: 46px;
	gap: 0.5rem;
	border-top: 1px solid #e5e7eb;
	border-bottom: 0;
	background: #f8fafc;
	color: #047857;
	font-weight: 650;
}

.load-more:hover {
	background: #ecfdf5;
}

.load-more svg {
	width: 16px;
	height: 16px;
}

.remaining-count {
	padding: 0.125rem 0.375rem;
	border-radius: 999px;
	background: #d1fae5;
	color: #065f46;
	font-size: 0.6875rem;
	font-weight: 700;
}

.inline-loading {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	min-height: 34px;
	border-top: 1px solid #f3f4f6;
	background: #ffffff;
	color: #6b7280;
	font-size: 0.6875rem;
}

.mini-spinner {
	width: 15px;
	height: 15px;
	color: #059669;
	animation: spin 700ms linear infinite;
}

.dropdown-enter-active,
.dropdown-leave-active {
	transition:
		opacity 150ms ease,
		transform 150ms ease;
	transform-origin: top center;
}

.dropdown-enter-from,
.dropdown-leave-to {
	opacity: 0;
	transform: translateY(-5px) scale(0.99);
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@media (max-width: 640px) {
	.dropdown-item {
		min-height: 54px;
		padding-inline: 0.75rem;
	}

	.dropdown-list {
		max-height: min(55vh, 360px);
	}

	.clear-btn,
	.dropdown-toggle {
		width: 36px;
		height: 36px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.select-input-wrapper,
	.clear-btn,
	.dropdown-toggle,
	.dropdown-toggle svg,
	.dropdown-item,
	.dropdown-enter-active,
	.dropdown-leave-active {
		transition: none !important;
	}

	.loading-spinner,
	.mini-spinner {
		animation: none !important;
	}
}
</style>
