import { describe, expect, it } from "vitest"
import { centeredAt, distanceBetween, lerp, subtract } from "./point.ts"

describe("point", () => {
  it("interpolates between two points", () => {
    expect(lerp({ x: 0, y: 10 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 12.5 })
  })

  it("subtracts component-wise", () => {
    expect(subtract({ x: 5, y: 3 }, { x: 2, y: 7 })).toEqual({ x: 3, y: -4 })
  })

  it("scales vertical distance by the aspect ratio", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 8 }, 2)).toBe(5)
  })

  it("formats a translate centered on the point", () => {
    expect(centeredAt({ x: 50, y: 40 }, 20)).toBe("40px 30px")
  })
})
