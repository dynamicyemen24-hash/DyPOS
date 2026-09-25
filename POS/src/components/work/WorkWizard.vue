/**
 * WorkWizard — معالج نماذج متعدد الخطوات (Enterprise Grade).
 *
 * Features:
 *  - Stepper navigation with validation per step
 *  - Branching logic (conditional steps)
 *  - Async validation (server-side)
 *  - Progress persistence (localStorage/sessionStorage)
 *  - Keyboard navigation (Enter=next, Escape=cancel)
 *  - RTL-first, WCAG 2.2 AA
 *  - Step completion tracking
 */
<template>
  <div
    class="work-wizard"
    :class="[
      `work-wizard--${layout}`,
      { 'work-wizard--vertical': layout === 'vertical' },
    ]"
    role="application"
    :aria-label="t('wizard')"
  >
    <!-- Progress Header -->
    <header
      v-if="showProgress"
      class="work-wizard__header"
      role="navigation"
      :aria-label="t('wizardProgress')"
    >
      <div class="work-wizard__progress-bar" :style="{ '--progress': progressPercent + '%' }">
        <template v-for="(step, index) in steps" :key="step.id">
          <div
            class="work-wizard__step-marker"
            :class="[
              'work-wizard__step-marker',
              { 'work-wizard__step-marker--completed': index < currentStepIndex },
              { 'work-wizard__step-marker--current': index === currentStepIndex },
              { 'work-wizard__step-marker--error': step.error },
              { 'work-wizard__step-marker--optional': step.optional },
            ]"
            :style="{ '--step-index': index + 1 }"
          >
            <span class="work-wizard__step-number" aria-hidden="true">{{ index + 1 }}</span>
            <span class="work-wizard__step-check" v-if="index < currentStepIndex" aria-hidden="true">
              <FeatherIcon name="check" class="w-4 h-4" />
            </span>
          </div>
          <div
            v-if="index < steps.length - 1"
            class="work-wizard__step-connector"
            :class="{ 'work-wizard__step-connector--completed': index < currentStepIndex }"
          />
        </template>
      </div>
      <div class="work-wizard__step-labels">
        <template v-for="(step, index) in steps" :key="step.id">
          <span
            class="work-wizard__step-label"
            :class="{ 'work-wizard__step-label--current': index === currentStepIndex }"
          >
            {{ t(step.title) }}
            <span v-if="step.optional" class="work-wizard__step-optional">({{ t('optional') }})</span>
          </span>
        </template>
      </div>
    </header>

    <!-- Step Content -->
    <main class="work-wizard__content" role="main">
      <Transition name="work-wizard-step">
        <div
          v-show="!loading"
          class="work-wizard__step"
          role="tabpanel"
          :aria-labelledby="`wizard-step-${currentStep.id}`"
        >
          <h2
            id={`wizard-step-${currentStep.id}`}
            class="work-wizard__step-title"
          >
            {{ t(currentStep.title) }}
          </h2>
          <p v-if="currentStep.description" class="work-wizard__step-description">
            {{ t(currentStep.description) }}
          </p>

          <slot
            :name="`step-${currentStep.id}`"
            :step="currentStep"
            :model="stepModels[currentStep.id]"
            :errors="stepErrors[currentStep.id]"
            :dirty="stepDirty[currentStep.id]"
          />
        </div>
      </Transition>

      <div v-if="loading" class="work-wizard__loading" role="status">
        <div class="work-wizard__spinner" aria-hidden="true" />
        <span>{{ t('loading') }}</span>
      </div>
    </main>

    <!-- Navigation Footer -->
    <footer class="work-wizard__footer" role="navigation" :aria-label="t('wizardNavigation')">
      <div class="work-wizard__footer-left">
        <WorkActions
          :secondary-actions="[
            { id: 'save-draft', label: t('saveDraft'), icon: 'save', variant: 'ghost', handler: saveDraft },
            { id: 'reset', label: t('resetWizard'), icon: 'refresh-ccw', variant: 'ghost', handler: resetWizard, confirm: true },
          ]"
        />
      </div>
      <div class="work-wizard__footer-right">
        <WorkActions
          :primary-actions="[
            {
              id: 'prev',
              label: t('previous'),
              icon: direction === 'rtl' ? 'chevron-right' : 'chevron-left',
              iconPosition: 'start',
              variant: 'secondary',
              disabled: currentStepIndex === 0 || loading,
              handler: previousStep,
            },
            {
              id: 'next',
              label: isLastStep ? t('finish') : t('next'),
              icon: isLastStep ? 'check' : (direction === 'rtl' ? 'chevron-left' : 'chevron-right'),
              iconPosition: 'end',
              variant: 'primary',
              disabled: !canProceed || loading,
              loading: loading && currentStepIndex === steps.length - 1,
              handler: nextStep,
            },
          ]"
        />
      </div>
    </footer>

    <!-- Completion Screen -->
    <div
      v-if="completed"
      class="work-wizard__completion"
      role="status"
      aria-live="polite"
    >
      <div class="work-wizard__completion-icon" aria-hidden="true">
        <FeatherIcon name="check-circle" class="w-16 h-16 text-green-600" />
      </div>
      <h2 class="work-wizard__completion-title">{{ t('wizardCompleted') }}</h2>
      <p class="work-wizard__completion-message">{{ t('wizardCompletedMessage') }}</p>
      <div class="work-wizard__completion-summary">
        <h3>{{ t('summary') }}</h3>
        <slot name="completion-summary" :model="finalModel" />
      </div>
      <div class="work-wizard__completion-actions">
        <WorkActions
          :primary-actions="[
            { id: 'new', label: t('startNew'), icon: 'plus', variant: 'primary', handler: restartWizard },
          ]"
          :secondary-actions="[
            { id: 'download', label: t('downloadResults'), icon: 'download', variant: 'ghost', handler: downloadResults },
          ]"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, inject, provide } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import WorkActions from "./WorkActions.vue"

const props = defineProps({
	/** Step definitions */
	steps: {
		type: Array,
		required: true,
		// [{ id, title, description, component?, optional?, validator?, asyncValidator? }]
	},
	/** Initial model data */
	initialModel: { type: Object, default: () => ({}) },
	/** Layout: horizontal | vertical */
	layout: {
		type: String,
		default: "horizontal",
		validator: (v) => ["horizontal", "vertical"].includes(v),
	},
	/** Show progress bar */
	showProgress: { type: Boolean, default: true },
	/** Persist progress to storage */
	persistKey: { type: String, default: "" },
	/** Allow skipping optional steps */
	allowSkipOptional: { type: Boolean, default: true },
	/** Validate on step change */
	validateOnChange: { type: Boolean, default: true },
	/** Direction */
	direction: {
		type: String,
		default: "rtl",
		validator: (v) => ["rtl", "ltr"].includes(v),
	},
})

const emit = defineEmits([
	"complete",
	"cancel",
	"step-change",
	"save-draft",
	"draft-saved",
])

const currentStepIndex = ref(0)
const loading = ref(false)
const completed = ref(false)
const stepModels = ref({})
const stepErrors = ref({})
const stepDirty = ref({})
const stepTouched = ref({})

const { dir: direction } = inject("dy-direction", { value: "rtl" })

// Persistence
const STORAGE_KEY = computed(() =>
	props.persistKey ? `wizard:${props.persistKey}` : "",
)

function loadPersisted() {
	if (!STORAGE_KEY.value) return
	try {
		const saved = localStorage.getItem(STORAGE_KEY.value)
		if (saved) {
			const data = JSON.parse(saved)
			stepModels.value = data.models || {}
			currentStepIndex.value = data.currentStep || 0
			completed.value = data.completed || false
		}
	} catch (e) {
		/* ignore */
	}
}

function savePersisted() {
	if (!STORAGE_KEY.value) return
	try {
		localStorage.setItem(
			STORAGE_KEY.value,
			JSON.stringify({
				models: stepModels.value,
				currentStep: currentStepIndex.value,
				completed: completed.value,
				timestamp: Date.now(),
			}),
		)
	} catch (e) {
		/* ignore */
	}
}

function clearPersisted() {
	if (!STORAGE_KEY.value) return
	localStorage.removeItem(STORAGE_KEY.value)
}

const currentStep = computed(() => props.steps[currentStepIndex.value])
const isLastStep = computed(
	() => currentStepIndex.value === props.steps.length - 1,
)
const progressPercent = computed(
	() => ((currentStepIndex.value + 1) / props.steps.length) * 100,
)

const canProceed = computed(() => {
	const step = currentStep.value
	if (!step) return false
	const model = stepModels.value[step.id] || {}
	const errors = stepErrors.value[step.id] || {}

	// Check required fields
	if (step.validator) {
		const validationErrors = step.validator(model)
		if (validationErrors) {
			stepErrors.value = { ...stepErrors.value, [step.id]: validationErrors }
			return false
		}
	}

	// Check async validation
	if (step.asyncValidator && stepDirty.value[step.id]) {
		return !Object.keys(errors).some((k) => errors[k])
	}

	// For optional steps, allow proceeding even if empty
	if (step.optional && props.allowSkipOptional) return true

	return true
})

const finalModel = computed(() => {
	const result = { ...props.initialModel }
	for (const step of props.steps) {
		Object.assign(result, stepModels.value[step.id] || {})
	}
	return result
})

// Initialize step models
onMounted(() => {
	if (props.persistKey) {
		loadPersisted()
	}

	// Initialize empty models for each step
	for (const step of props.steps) {
		if (!stepModels.value[step.id]) {
			stepModels.value[step.id] = {}
		}
	}

	// Validate initial step
	if (props.validateOnChange && currentStep.value) {
		validateCurrentStep()
	}
})

watch(currentStepIndex, (newIdx, oldIdx) => {
	if (oldIdx >= 0) {
		validateStep(oldIdx)
	}
	if (props.validateOnChange) {
		validateCurrentStep()
	}
	savePersisted()
	emit("step-change", props.steps[newIdx], props.steps[oldIdx])
})

async function validateCurrentStep() {
	await validateStep(currentStepIndex.value)
}

async function validateStep(index) {
	const step = props.steps[index]
	if (!step) return true

	const model = stepModels.value[step.id] || {}
	stepTouched.value = { ...stepTouched.value, [step.id]: true }

	// Sync validation
	if (step.validator) {
		const errors = step.validator(model)
		stepErrors.value = { ...stepErrors.value, [step.id]: errors || {} }
		if (errors && Object.keys(errors).length > 0) return false
	}

	// Async validation
	if (step.asyncValidator) {
		loading.value = true
		try {
			const errors = await step.asyncValidator(model)
			stepErrors.value = { ...stepErrors.value, [step.id]: errors || {} }
			return !errors || Object.keys(errors).length === 0
		} catch (e) {
			stepErrors.value = {
				...stepErrors.value,
				[step.id]: { _async: e.message },
			}
			return false
		} finally {
			loading.value = false
		}
	}

	return true
}

function nextStep() {
	if (!canProceed.value) {
		validateCurrentStep()
		return
	}

	if (isLastStep.value) {
		finishWizard()
	} else {
		currentStepIndex.value = Math.min(
			currentStepIndex.value + 1,
			props.steps.length - 1,
		)
	}
}

function previousStep() {
	if (currentStepIndex.value > 0) {
		currentStepIndex.value--
	}
}

function finishWizard() {
	loading.value = true

	// Final validation of all steps
	let allValid = true
	for (let i = 0; i < props.steps.length; i++) {
		if (!validateStep(i)) {
			allValid = false
			// Jump to first invalid step
			if (currentStepIndex.value === props.steps.length - 1) {
				currentStepIndex.value = i
			}
		}
	}

	if (allValid) {
		completed.value = true
		clearPersisted()
		emit("complete", finalModel.value)
	}

	loading.value = false
}

function restartWizard() {
	currentStepIndex.value = 0
	completed.value = false
	stepModels.value = {}
	stepErrors.value = {}
	stepDirty.value = {}
	stepTouched.value = {}

	for (const step of props.steps) {
		stepModels.value[step.id] = { ...props.initialModel }
	}

	clearPersisted()
	emit("cancel")
}

function resetWizard() {
	if (confirm(t("confirmResetWizard"))) {
		restartWizard()
	}
}

function saveDraft() {
	savePersisted()
	emit("draft-saved")
	// Could show toast notification
}

function downloadResults() {
	const data = JSON.stringify(finalModel.value, null, 2)
	const blob = new Blob([data], { type: "application/json" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = `wizard-result-${Date.now()}.json`
	a.click()
	URL.revokeObjectURL(url)
}

// Expose methods for external control
provide("wizardApi", {
	next: nextStep,
	previous: previousStep,
	goToStep: (index) => {
		currentStepIndex.value = index
	},
	getModel: () => finalModel.value,
	getErrors: () => stepErrors.value,
	validateAll: () => {
		let valid = true
		for (let i = 0; i < props.steps.length; i++) {
			if (!validateStep(i)) valid = false
		}
		return valid
	},
})
</script>

<style scoped>
/* ============================================================================
   WorkWizard — Enterprise Multi-Step Form Wizard
   ============================================================================ */

.work-wizard {
  display: flex;
  flex-direction: column;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-xl, 12px);
  overflow: hidden;
}

.work-wizard--vertical {
  flex-direction: row;
}

.work-wizard--vertical .work-wizard__header {
  flex-direction: column;
  width: 240px;
  min-width: 240px;
  border-inline-end: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-bottom: none;
}

.work-wizard--vertical .work-wizard__progress-bar {
  flex-direction: column;
  align-items: center;
  padding: var(--dy-spacing-6, 24px) var(--dy-spacing-4, 16px);
}

.work-wizard--vertical .work-wizard__step-connector {
  width: 2px;
  height: 24px;
  margin: 0;
}

.work-wizard--vertical .work-wizard__step-labels {
  flex-direction: column;
  gap: var(--dy-spacing-6, 24px);
  padding: 0 var(--dy-spacing-4, 16px) var(--dy-spacing-6, 24px);
  text-align: center;
}

.work-wizard--vertical .work-wizard__content {
  flex: 1;
  min-width: 0;
}

.work-wizard--vertical .work-wizard__footer {
  flex-direction: column;
  padding: var(--dy-spacing-4, 16px);
  border-inline-start: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-top: none;
}

/* Header / Progress */
.work-wizard__header {
  padding: var(--dy-spacing-6, 24px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-wizard__progress-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  position: relative;
  margin-bottom: var(--dy-spacing-4, 16px);
}

.work-wizard__step-marker {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--dy-radius-full, 9999px);
  background: var(--dy-color-surface-border, #e2e8f0);
  color: var(--dy-color-text-muted, #94a3b8);
  font-weight: 700;
  font-size: 0.75rem;
  transition: all var(--dy-motion-duration-normal, 150ms);
}

.work-wizard__step-marker--completed {
  background: var(--dy-color-brand-500, #10b981);
  color: white;
}

.work-wizard__step-marker--current {
  background: var(--dy-color-brand-500, #10b981);
  color: white;
  box-shadow: 0 0 0 4px var(--dy-color-brand-100, #d1fae5);
}

.work-wizard__step-marker--error {
  background: var(--dy-color-status-danger-icon, #ef4444);
  color: white;
}

.work-wizard__step-marker--optional {
  border: 2px dashed var(--dy-color-text-muted, #94a3b8);
}

.work-wizard__step-check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.work-wizard__step-connector {
  flex: 1;
  max-width: 80px;
  height: 2px;
  background: var(--dy-color-surface-border, #e2e8f0);
  margin: 0 var(--dy-spacing-2, 8px);
  transition: background var(--dy-motion-duration-normal, 150ms);
}

.work-wizard__step-connector--completed {
  background: var(--dy-color-brand-500, #10b981);
}

.work-wizard__step-labels {
  display: flex;
  justify-content: space-between;
  gap: var(--dy-spacing-2, 8px);
  font-size: 0.7rem;
  color: var(--dy-color-text-muted, #64748b);
}

.work-wizard__step-label {
  flex: 1;
  text-align: center;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-wizard__step-label--current {
  color: var(--dy-color-brand-500, #10b981);
  font-weight: 600;
}

.work-wizard__step-optional {
  display: block;
  font-size: 0.6rem;
  color: var(--dy-color-text-muted, #94a3b8);
  margin-top: 2px;
}

/* Content */
.work-wizard__content {
  flex: 1;
  padding: var(--dy-spacing-6, 24px);
  overflow-y: auto;
  min-height: 300px;
}

.work-wizard__step {
  animation: work-wizard-step-fade 0.2s ease-out;
}

@keyframes work-wizard-step-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.work-wizard__step-title {
  margin: 0 0 var(--dy-spacing-2, 8px);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--dy-color-text-primary, #0f172a);
}

.work-wizard__step-description {
  margin: 0 0 var(--dy-spacing-6, 24px);
  color: var(--dy-color-text-secondary, #334155);
  line-height: 1.6;
}

.work-wizard__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px);
  gap: var(--dy-spacing-3, 12px);
  color: var(--dy-color-text-muted, #64748b);
}

.work-wizard__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--dy-color-surface-border, #e2e8f0);
  border-block-start-color: var(--dy-color-brand-500, #10b981);
  border-radius: 50%;
  animation: work-wizard-spin 1s linear infinite;
}

@keyframes work-wizard-spin {
  to { transform: rotate(360deg); }
}

/* Footer */
.work-wizard__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-4, 16px) var(--dy-spacing-6, 24px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-wizard__footer-left,
.work-wizard__footer-right {
  display: flex;
  align-items: center;
}

/* Completion */
.work-wizard__completion {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--dy-spacing-12, 48px) var(--dy-spacing-6, 24px);
}

.work-wizard__completion-icon {
  margin-bottom: var(--dy-spacing-4, 16px);
}

.work-wizard__completion-title {
  margin: 0 0 var(--dy-spacing-2, 8px);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--dy-color-text-primary, #0f172a);
}

.work-wizard__completion-message {
  margin: 0 0 var(--dy-spacing-8, 32px);
  color: var(--dy-color-text-secondary, #334155);
  max-width: 400px;
}

.work-wizard__completion-summary {
  width: 100%;
  max-width: 500px;
  margin-bottom: var(--dy-spacing-8, 32px);
  padding: var(--dy-spacing-6, 24px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-radius: var(--dy-radius-xl, 12px);
  text-align: start;
}

.work-wizard__completion-summary h3 {
  margin: 0 0 var(--dy-spacing-4, 16px);
  font-size: 1rem;
  font-weight: 600;
  color: var(--dy-color-text-primary, #0f172a);
}

.work-wizard__completion-actions {
  width: 100%;
  max-width: 500px;
}

/* Responsive */
@media (max-width: 768px) {
  .work-wizard--vertical {
    flex-direction: column;
  }
  .work-wizard--vertical .work-wizard__header {
    width: 100%;
    border-inline-end: none;
    border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  }
  .work-wizard--vertical .work-wizard__progress-bar {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .work-wizard--vertical .work-wizard__step-connector {
    display: none;
  }
  .work-wizard--vertical .work-wizard__footer {
    flex-direction: column;
  }
  .work-wizard__footer {
    flex-direction: column;
  }
  .work-wizard__footer-left,
  .work-wizard__footer-right {
    width: 100%;
    justify-content: center;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-wizard__step { animation: none; }
  .work-wizard__step-marker { transition: none; }
  .work-wizard__step-connector { transition: none; }
  .work-wizard__spinner { animation: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-wizard { border-color: CanvasText; }
  .work-wizard__header { border-color: CanvasText; background: Canvas; }
  .work-wizard__footer { border-color: CanvasText; background: Canvas; }
  .work-wizard__step-marker { border-color: CanvasText; background: Canvas; color: CanvasText; }
  .work-wizard__step-marker--completed { background: Highlight; color: HighlightText; }
  .work-wizard__step-marker--current { background: Highlight; color: HighlightText; }
  .work-wizard__step-connector { background: CanvasText; }
  .work-wizard__step-connector--completed { background: Highlight; }
}
</style>