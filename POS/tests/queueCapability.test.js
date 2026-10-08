import { describe, expect, it } from "vitest"
import { isQueueEnabled } from "@/utils/queueCapability"

describe("queue capability policy", () => {
  it("enables queues for service subscribers at level 2+", () => {
    expect(isQueueEnabled({ sector: "service", subscriptionLevel: 2 })).toBe(true)
    expect(isQueueEnabled({ sector: "خدمي", subscriptionLevel: "3" })).toBe(true)
  })

  it("hides queues for non-service subscribers regardless of level", () => {
    expect(isQueueEnabled({ sector: "retail", subscriptionLevel: 5 })).toBe(false)
    expect(isQueueEnabled({ sector: "manufacturing", subscriptionLevel: 3 })).toBe(false)
  })

  it("uses explicit subscriber queue levels when provisioned", () => {
    expect(isQueueEnabled({ sector: "service", subscriptionLevel: 1, queueLevels: ["1", "3"] })).toBe(true)
    expect(isQueueEnabled({ sector: "service", subscriptionLevel: 2, queueLevels: ["1", "3"] })).toBe(false)
  })

  it("fails closed when service level is missing", () => {
    expect(isQueueEnabled({ sector: "service" })).toBe(false)
  })
})
