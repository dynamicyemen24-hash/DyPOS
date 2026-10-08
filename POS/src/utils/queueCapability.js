import { computed } from "vue"
import { posContext } from "@/utils/posContext"

const SERVICE_VALUES = new Set([
  "service", "services", "خدمي", "خدمات", "خدميّة", "خدمى",
])

function normalize(value) {
  return String(value ?? "").trim().toLowerCase()
}

function levelNumber(value) {
  const match = String(value ?? "").match(/\d+/)
  return match ? Number(match[0]) : null
}

/**
 * Queue is a product capability, not a global navigation item.
 * Authoritative rule:
 *   - subscriber must be service-sector/business;
 *   - subscription level must be explicitly allowed by subscriber config;
 *     otherwise numeric level >= 2 is the conservative fallback.
 */
export function isQueueEnabled(context = posContext) {
  const sector = normalize(context.sector || context.businessType)
  if (!SERVICE_VALUES.has(sector)) return false

  const configured = context.queueLevels
  const level = context.subscriptionLevel
  if (Array.isArray(configured) && configured.length) {
    return configured.map(normalize).includes(normalize(level))
  }

  if (configured != null && typeof configured === "string") {
    const allowed = configured.split(",").map(normalize).filter(Boolean)
    if (allowed.length) return allowed.includes(normalize(level))
  }

  const numeric = levelNumber(level)
  return numeric !== null && numeric >= 2
}

export function useQueueCapability() {
  const enabled = computed(() => isQueueEnabled(posContext))
  return { enabled }
}

export default isQueueEnabled
