import { describe, expect, it } from "vitest"
import { WORK_SCREENS } from "@/data/workScreens"

describe("settlement worklist", () => {
  const screen = WORK_SCREENS.find((entry) => entry.id === "settlements")

  it("is a real source-backed shift settlement screen", () => {
    expect(screen).toBeTruthy()
    expect(screen.doctype).toBe("POS Opening Shift")
    expect(screen.permission).toBe("work.settlements")
    expect(screen.load).toBeTypeOf("function")
  })

  it("exposes reconciliation fields needed to close a cash session", () => {
    const keys = screen.columns.map((column) => column.key)
    expect(keys).toEqual(expect.arrayContaining([
      "opening_cash",
      "expected_cash",
      "closing_cash",
      "variance",
      "status",
    ]))
  })

  it("formats each monetary settlement field from its own source value", () => {
    const row = {
      opening_cash: 100,
      expected_cash: 150.5,
      closing_cash: 149,
      variance: -1.5,
    }
    for (const key of ["opening_cash", "expected_cash", "closing_cash", "variance"]) {
      const column = screen.columns.find((entry) => entry.key === key)
      expect(column.format(row)).toBe(Number(row[key]).toFixed(2))
    }
  })
})
