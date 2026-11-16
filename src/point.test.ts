import { describe, expect, it } from "vitest"
import { centeredAt, distanceBetween, lerp, subtract } from "./point.ts"

describe("lerp", () => {
  it("interpolates each axis", () => {
    expect(lerp({ x: 0, y: 10 }, { x: 10, y: 30 }, 0.5)).toEqual({ x: 5, y: 20 })
  })

  it("returns the endpoints at t=0 and t=1", () => {
    const from = { x: 1, y: 2 }
    const to = { x: 3, y: 4 }
    expect(lerp(from, to, 0)).toEqual(from)
    expect(lerp(from, to, 1)).toEqual(to)
  })
})

describe("subtract", () => {
  it("subtracts component-wise", () => {
    expect(subtract({ x: 5, y: -2 }, { x: 1, y: 3 })).toEqual({ x: 4, y: -5 })
  })
})

describe("distanceBetween", () => {
  it("scales the y axis by the aspect ratio", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 2)).toBeCloseTo(Math.hypot(3, 2))
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 1)).toBeCloseTo(5)
  })
})

describe("centeredAt", () => {
  it("centers a square of the given size on the point", () => {
    expect(centeredAt({ x: 10, y: 20 }, 4)).toBe("8px 18px")
  })
})
