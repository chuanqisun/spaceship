import { afterEach, describe, expect, it, vi } from "vitest"
import { placeInRightMargin, type MarginPin } from "./margin-pins.ts"

/** Matches `GAP_PX` in `margin-pins.ts`. */
const GAP_PX = 8
const KNOB_PX = 16

type FakeLabel = { style: Record<string, string>; offsetHeight: number }

function fakePin(y: number, labelHeight = 14) {
  const element = { offsetWidth: KNOB_PX }
  const label: FakeLabel = { style: {}, offsetHeight: labelHeight }
  const pin: MarginPin = {
    anchor: { x: 0, y },
    element: element as unknown as HTMLElement,
    label: label as unknown as HTMLElement,
  }
  return { pin, label }
}

function stubViewport(documentElement: { clientWidth: number }) {
  vi.stubGlobal("document", { documentElement })
  vi.stubGlobal("scrollX", 0)
}

afterEach(() => vi.unstubAllGlobals())

describe("placeInRightMargin", () => {
  it("keeps a fallback label's right edge inside the viewport on a narrow screen", () => {
    stubViewport({ clientWidth: 320 })
    const { pin, label } = fakePin(100)
    // The column fills the width, so the gutter has no room for a beside-label and the pin falls back under its knob.
    const [point] = placeInRightMargin([pin], 300)
    expect(point.x + KNOB_PX / 2).toBeLessThanOrEqual(320 - GAP_PX)
    expect(label.style.right).toBe("0")
    expect(label.style.left).toBe("auto")
    // Flush right under the knob: the cap spans from the viewport's left gap to the knob's right edge.
    expect(parseFloat(label.style.maxWidth)).toBeLessThanOrEqual(point.x + KNOB_PX / 2 - GAP_PX)
  })

  it("clears the fallback alignment when the gutter has room again", () => {
    const documentElement = { clientWidth: 320 }
    stubViewport(documentElement)
    const { pin, label } = fakePin(100)
    placeInRightMargin([pin], 300)
    expect(label.style.right).toBe("0")
    documentElement.clientWidth = 800
    placeInRightMargin([pin], 300)
    expect(label.style.maxWidth).toBe(`${800 - 300 - KNOB_PX - 4 * GAP_PX}px`)
    expect(label.style.left).toBe("")
    expect(label.style.right).toBe("")
    expect(label.style.top).toBe("")
    expect(label.style.translate).toBe("")
    expect(label.style.textAlign).toBe("")
  })

  it("stacks fallback pins by each label's real bottom edge", () => {
    stubViewport({ clientWidth: 320 })
    const first = fakePin(100, 30)
    const second = fakePin(110, 10)
    const [a, b] = placeInRightMargin([first.pin, second.pin], 300)
    // first's label bottom: 100 + 8 (half knob) + 8 (gap) + 30 = 146; second's knob top must clear it by GAP_PX.
    expect(b.y - KNOB_PX / 2).toBeGreaterThanOrEqual(146 + GAP_PX)
    expect(b.y).toBeGreaterThan(a.y)
  })
})
