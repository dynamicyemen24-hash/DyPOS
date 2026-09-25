/**
 * WorkSearch — بحث موحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Debounced input
 *  - Clear button
 *  - Search suggestions dropdown
 *  - Keyboard navigation (Arrow up/down, Enter, Escape)
 *  - ARIA: combobox, listbox, option
 *  - RTL-aware
 */
<template>
  <div
    class="work-search"
    :class="[
      `work-search--${size}`,
      { 'work-search--focused': focused, 'work-search--loading': loading },
    ]"
  >
    <label
      v-if="label"
      :for="inputId"
      class="work-search__label"
    >
      {{ t(label) }}
    </label>

    <div class="work-search__input-wrapper" ref="wrapperRef">
      <div class="work-search__prefix" aria-hidden="true">
        <FeatherIcon name="search" class="w-5 h-5" />
      </div>

      <input
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="t(placeholder)"
        :disabled="disabled"
        :aria-autocomplete="suggestions.length ? 'list' : 'none'"
        :aria-controls="suggestions.length ? listboxId : undefined"
        :aria-activedescendant="suggestions.length && highlightedIndex >= 0 ? optionIds[highlightedIndex] : undefined"
        :aria-expanded="suggestionsOpen"
        :aria-label="label ? undefined : t(placeholder)"
        class="work-search__input"
        @input="$emit('update:modelValue', $event.target.value)"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
        @compositionstart="composing = true"
        @compositionend="handleCompositionEnd"
      />

      <div v-if="modelValue && !disabled" class="work-search__suffix">
        <button
          type="button"
          class="work-search__clear"
          @click="clear"
          :aria-label="t('clearSearch')"
        >
          <FeatherIcon name="x" class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div v-if="loading" class="work-search__loading" aria-hidden="true">
        <div class="work-search__spinner" />
      </div>
    </div>

    <!-- Suggestions Dropdown -->
    <Transition name="work-search-dropdown">
      <div
        v-if="suggestionsOpen && suggestions.length"
        :id="listboxId"
        class="work-search__dropdown"
        role="listbox"
        :aria-label="t('searchSuggestions')"
      >
        <ul class="work-search__list" role="presentation">
          <li
            v-for="(suggestion, index) in suggestions"
            :key="suggestion.id || index"
            :id="optionIds[index]"
            role="option"
            :aria-selected="index === highlightedIndex"
            class="work-search__option"
            :class="{ 'work-search__option--highlighted': index === highlightedIndex }"
            @click="selectSuggestion(suggestion)"
            @mousemove="highlightedIndex = index"
          >
            <div class="work-search__option-content">
              <span v-if="suggestion.icon" class="work-search__option-icon" aria-hidden="true">
                <FeatherIcon :name="suggestion.icon" class="w-4 h-4" />
              </span>
              <div class="work-search__option-text">
                <span class="work-search__option-label">{{ t(suggestion.label) }}</span>
                <span v-if="suggestion.description" class="work-search__option-desc">{{ t(suggestion.description) }}</span>
              </div>
            </div>
            <span v-if="suggestion.badge" class="work-search__option-badge">{{ t(suggestion.badge) }}</span>
          </li>
        </ul>
        <div v-if="suggestionsFooter" class="work-search__footer">
          <slot name="footer" :suggestions="suggestions">{{ suggestionsFooter }}</slot>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	modelValue: { type: String, default: "" },
	label: { type: String, default: "" },
	placeholder: { type: String, default: "search" },
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	disabled: { type: Boolean, default: false },
	loading: { type: Boolean, default: false },
	/** Debounce ms */
	debounce: { type: Number, default: 300 },
	/** Suggestions array */
	suggestions: {
		type: Array,
		default: () => [],
		// [{ id, label, description?, icon?, badge? }]
	},
	/** Footer text */
	suggestionsFooter: { type: String, default: "" },
	/** Input type */
	type: { type: String, default: "search" },
	/** Clearable */
	clearable: { type: Boolean, default: true },
})

const emit = defineEmits([
	"update:modelValue",
	"search",
	"select",
	"clear",
	"focus",
	"blur",
])

const inputId = `work-search-${Math.random().toString(36).slice(2)}`
const listboxId = `${inputId}-listbox`
const wrapperRef = ref(null)

const focused = ref(false)
const suggestionsOpen = ref(false)
const highlightedIndex = ref(-1)
const composing = ref(false)
let debounceTimer = null

const optionIds = computed(() =>
	suggestions.value.map((_, i) => `${listboxId}-option-${i}`),
)

function handleInput(e) {
	const value = e.target.value
	if (composing.value) return
	emit("update:modelValue", value)
	clearTimeout(debounceTimer)
	debounceTimer = setTimeout(() => {
		emit("search", value)
		suggestionsOpen.value = true
		highlightedIndex.value = -1
	}, props.debounce)
}

function handleFocus() {
	focused.value = true
	if (props.suggestions.length) suggestionsOpen.value = true
	emit("focus")
}

function handleBlur(e) {
	focused.value = false
	// Delay to allow click on suggestion
	setTimeout(() => {
		suggestionsOpen.value = false
		highlightedIndex.value = -1
	}, 150)
	emit("blur")
}

function handleKeydown(e) {
	const maxIndex = props.suggestions.length - 1

	switch (e.key) {
		case "ArrowDown":
			e.preventDefault()
			highlightedIndex.value = Math.min(highlightedIndex.value + 1, maxIndex)
			break
		case "ArrowUp":
			e.preventDefault()
			highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1)
			break
		case "Enter":
			if (
				highlightedIndex.value >= 0 &&
				props.suggestions[highlightedIndex.value]
			) {
				e.preventDefault()
				selectSuggestion(props.suggestions[highlightedIndex.value])
			} else {
				emit("search", props.modelValue)
			}
			break
		case "Escape":
			suggestionsOpen.value = false
			highlightedIndex.value = -1
			wrapperRef.value?.querySelector("input")?.blur()
			break
		case "Tab":
			suggestionsOpen.value = false
			highlightedIndex.value = -1
			break
	}
}

function handleCompositionEnd(e) {
	composing.value = false
	handleInput(e)
}

function clear() {
	emit("update:modelValue", "")
	emit("clear")
	suggestionsOpen.value = false
	highlightedIndex.value = -1
	nextTick(() => wrapperRef.value?.querySelector("input")?.focus())
}

function selectSuggestion(suggestion) {
	emit("select", suggestion)
	if (suggestion.value !== undefined) {
		emit("update:modelValue", suggestion.value)
	}
	suggestionsOpen.value = false
	highlightedIndex.value = -1
	nextTick(() => wrapperRef.value?.querySelector("input")?.focus())
}

function closeDropdown() {
	suggestionsOpen.value = false
	highlightedIndex.value = -1
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside)
	clearTimeout(debounceTimer)
})

function handleClickOutside(e) {
	if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
		closeDropdown()
	}
}
</script>

<style scoped>
/* ============================================================================
   WorkSearch — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-search {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-1, 4px);
  width: 100%;
}

.work-search__label {
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-secondary, #334155);
}

.work-search__input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.work-search__prefix {
  position: absolute;
  inset-inline-start: var(--dy-spacing-3, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dy-color-text-muted, #94a3b8);
  pointer-events: none;
}

.work-search__input {
  width: 100%;
  height: var(--dy-components-input-height-md, 40px);
  padding: 0 var(--dy-spacing-10, 40px) 0 var(--dy-spacing-10, 40px);
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
.work-search__input::placeholder { color: var(--dy-color-text-disabled, #94a3b8); }
.work-search__input:hover { border-color: var(--dy-color-surface-border-strong, #cbd5e1); }
.work-search__input:focus {
  outline: none;
  border-color: var(--dy-color-brand-500, #10b981);
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}
.work-search__input:disabled {
  background: var(--dy-color-surface-overlay, #f8fafc);
  color: var(--dy-color-text-disabled, #94a3b8);
  cursor: not-allowed;
}

.work-search--focused .work-search__prefix { color: var(--dy-color-brand-500, #10b981); }

.work-search__suffix {
  position: absolute;
  inset-inline-end: var(--dy-spacing-2, 8px);
  display: flex;
  align-items: center;
}

.work-search__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms), color var(--dy-motion-duration-fast, 100ms);
}
.work-search__clear:hover { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-text-primary, #0f172a); }
.work-search__clear:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-search__loading {
  position: absolute;
  inset-inline-end: var(--dy-spacing-2, 8px);
  display: flex;
  align-items: center;
}
.work-search__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--dy-color-surface-border, #e2e8f0);
  border-block-start-color: var(--dy-color-brand-500, #10b981);
  border-radius: 50%;
  animation: work-search-spin 1s linear infinite;
}
@keyframes work-search-spin { to { transform: rotate(360deg); } }

/* Dropdown */
.work-search__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  inset-inline-start: 0;
  inset-inline-end: 0;
  z-index: var(--dy-zIndex-dropdown, 100);
  max-height: 320px;
  overflow-y: auto;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
}

.work-search__list {
  list-style: none;
  margin: 0;
  padding: var(--dy-spacing-1, 4px);
}

.work-search__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border-radius: var(--dy-radius-md, 6px);
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-primary, #0f172a);
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}
.work-search__option:hover,
.work-search__option--highlighted {
  background: var(--dy-color-surface-overlay, #f8fafc);
}
.work-search__option:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-search__option-content {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  min-width: 0;
}
.work-search__option-icon { color: var(--dy-color-text-muted, #64748b); flex-shrink: 0; }
.work-search__option-text { display: flex; flex-direction: column; min-width: 0; }
.work-search__option-label { font-weight: var(--dy-font-weight-medium, 500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.work-search__option-desc { font-size: var(--dy-typography-font-size-xs-min, 0.7rem); color: var(--dy-color-text-muted, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.work-search__option-badge {
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  padding: 2px 6px;
  border-radius: var(--dy-radius-full, 9999px);
  background: var(--dy-color-brand-100, #d1fae5);
  color: var(--dy-color-brand-700, #047857);
  white-space: nowrap;
}

/* Footer */
.work-search__footer {
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  color: var(--dy-color-text-muted, #64748b);
  text-align: center;
}

/* Sizes */
.work-search--sm .work-search__input { height: var(--dy-components-input-height-sm, 32px); font-size: var(--dy-typography-font-size-xs-min, 0.7rem); }
.work-search--lg .work-search__input { height: var(--dy-components-input-height-lg, 48px); font-size: var(--dy-typography-font-size-base-min, 1rem); }

/* Transitions */
.work-search-dropdown-enter-active,
.work-search-dropdown-leave-active {
  transition: opacity var(--dy-motion-duration-fast, 100ms), transform var(--dy-motion-duration-fast, 100ms);
}
.work-search-dropdown-enter-from,
.work-search-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-search__input,
  .work-search__clear,
  .work-search__option,
  .work-search-dropdown-enter-active,
  .work-search-dropdown-leave-active,
  .work-search__spinner {
    transition: none;
    animation: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-search__input { border-color: CanvasText; background: Canvas; color: CanvasText; }
  .work-search__input:focus { border-color: Highlight; }
  .work-search__dropdown { border-color: CanvasText; background: Canvas; }
  .work-search__option:hover { background: Highlight; color: HighlightText; }
  .work-search__clear { color: CanvasText; }
  .work-search__clear:hover { background: Highlight; color: HighlightText; }
}
</style>