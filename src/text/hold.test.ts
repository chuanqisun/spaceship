import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { holdWindow, onPressAndHold, touchHoldOnly } from "./hold.ts"

/** A press event with just the fields `onPressAndHold` reads. */
function press(type: string, { x = 0, y = 0, at = 0, pointerId = 1 }: { x?: number; y?: number; at?: number; pointerId?: number } = {}) {
  const event = new Event("pointerdown")
  Object.defineProperties(event, {
    pointerType: { value: type },
    pageX: { value: x },
    pageY: { value: y },
    timeStamp: { value: at },
    pointerId: { value: pointerId },
    button: { value: 0 },
  })
  return event
}

/** The DOM surface `onPressAndHold` touches, without a document: an EventTarget plus the attribute/style calls the sweep makes. */
function fakeElement() {
  return Object.assign(new EventTarget(), {
    toggleAttribute() {},
    removeAttribute() {},
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  }) as unknown as HTMLElement
}

const HOLD_MS = 100
/** The sweep starts after `SWEEP_DELAY_MS` (100) plus the hold time. */
const SETTLE_MS = 300

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("scrollX", 0)
  vi.stubGlobal("scrollY", 0)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("holdWindow", () => {
  it("leaves touch ungated and keeps the double-press window for mouse and pen", () => {
    expect(holdWindow("touch", 400)).toBeUndefined()
    expect(holdWindow("mouse", 400)).toBe(400)
    expect(holdWindow("pen", 400)).toBe(400)
  })
})

describe("touchHoldOnly", () => {
  it("ungates touch and never lets other pointers hold", () => {
    expect(touchHoldOnly(press("touch") as PointerEvent)).toBeUndefined()
    expect(touchHoldOnly(press("mouse") as PointerEvent)).toBe(false)
    expect(touchHoldOnly(press("pen") as PointerEvent)).toBe(false)
  })
})

describe("onPressAndHold pointer policy", () => {
  it("fires onHold for a single still touch press", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { secondPressWithin: (event) => holdWindow(event.pointerType, 400) })
    element.dispatchEvent(press("touch"))
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it("does not hold a mouse press until the second press of a double", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { secondPressWithin: (event) => holdWindow(event.pointerType, 400) })
    element.dispatchEvent(press("mouse", { at: 0 }))
    element.dispatchEvent(new Event("pointerup"))
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).not.toHaveBeenCalled()

    element.dispatchEvent(press("mouse", { at: 200 }))
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it("never holds a mouse press under the touch-only gate, even a double press", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { secondPressWithin: touchHoldOnly })
    element.dispatchEvent(press("mouse", { at: 0 }))
    element.dispatchEvent(new Event("pointerup"))
    element.dispatchEvent(press("mouse", { at: 100 }))
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it("cancels the hold when the press moves past the still tolerance", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { secondPressWithin: (event) => holdWindow(event.pointerType, 400) })
    element.dispatchEvent(press("touch"))
    const move = new Event("pointermove")
    Object.defineProperties(move, { pointerType: { value: "touch" }, pageX: { value: 100 }, pageY: { value: 0 } })
    element.dispatchEvent(move)
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })
})

describe("onPressAndHold stillness", () => {
  const moveTo = (element: HTMLElement, x: number, y = 0) => {
    const move = new Event("pointermove")
    Object.defineProperties(move, { pageX: { value: x }, pageY: { value: y } })
    element.dispatchEvent(move)
  }

  it("lets the press wander further before the sweep when stillPx is raised", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { stillPx: 10 })
    element.dispatchEvent(press("touch"))
    moveTo(element, 8)
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it("judges the sweep by sweepRegion instead of the element's circle", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { sweepRegion: () => (point) => point.x > 50 })
    element.dispatchEvent(press("touch"))
    await vi.advanceTimersByTimeAsync(150)
    moveTo(element, 60)
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it("cancels the sweep when the press leaves sweepRegion", async () => {
    const element = fakeElement()
    const onHold = vi.fn()
    onPressAndHold(element, HOLD_MS, onHold, { sweepRegion: () => (point) => point.x < 50 })
    element.dispatchEvent(press("touch"))
    await vi.advanceTimersByTimeAsync(150)
    moveTo(element, 60)
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })
})
