import type { Point } from "../point.ts"
import { circleOf, distance } from "./links.ts"

const STILL_TOLERANCE_PX = 4
/** Keeps a slow click from flashing the start of the sweep. */
const SWEEP_DELAY_MS = 100
/** A second press counts as part of a double press only this close to the first. */
const DOUBLE_PRESS_PX = 8

type HoldOptions = {
  /** The sweep starts filling. */
  onSweep?: () => void
  /** A started sweep ends: `completed` before `onHold` is called, or cancelled. */
  onSweepEnd?: (completed: boolean) => void
  /** If set, only the second press of a double press can hold: one starting within this many ms of the previous press, near the same spot. A function decides per press (returning undefined leaves that press ungated, `false` never holds), so touch can hold on a single press while mouse keeps the double-press gate. */
  secondPressWithin?: number | false | ((event: PointerEvent) => number | false | undefined)
  /** How far the press may wander, in px, before the sweep starts; defaults to 4. Touch jitter wants more room than a mouse's. */
  stillPx?: number
  /** Once sweeping, the press must stay inside the region this returns for the press (page coordinates), instead of the element's circle; undefined keeps the press point's `stillPx` radius. */
  sweepRegion?: (press: PointerEvent) => ((point: Point) => boolean) | undefined
}

/**
 * Calls `onHold` with the latest pointer event once a press on `element` stays still for `SWEEP_DELAY_MS` plus `ms`, sweeping `--fill` on `element` from 0 to 1 over the `ms`, with `data-holding` set while it sweeps.
 * Moving more than `stillPx` (4 px by default) before the sweep, leaving `sweepRegion`'s area (the element's circle by default) during it, or releasing cancels the hold; a cancelled press can't hold again.
 * Holding never blocks other handling of the press, such as a drag: moving away simply cancels it.
 */
export function onPressAndHold(
  element: HTMLElement,
  ms: number,
  onHold: (press: PointerEvent) => void,
  { onSweep, onSweepEnd, secondPressWithin, stillPx, sweepRegion }: HoldOptions = {},
) {
  let press: { start: PointerEvent; latest: PointerEvent; controller: AbortController; isSweeping: boolean; region: (point: Point) => boolean } | undefined
  let lastPress: { at: number; x: number; y: number } | undefined

  element.addEventListener("pointerdown", (event) => {
    release()
    const window = typeof secondPressWithin === "function" ? secondPressWithin(event) : secondPressWithin
    if (window === false) return
    const previous = lastPress
    lastPress = { at: event.timeStamp, x: event.pageX, y: event.pageY }
    const isSecondPress = previous !== undefined && event.timeStamp - previous.at <= (window ?? 0) && distance(previous, lastPress) <= DOUBLE_PRESS_PX
    if (window !== undefined && !isSecondPress) return
    const still = stillPx ?? STILL_TOLERANCE_PX
    const fallback = (point: Point) => distance(point, { x: event.pageX, y: event.pageY }) <= still
    const region = sweepRegion
      ? (sweepRegion(event) ?? fallback)
      : (point: Point) => {
          const { center, radius } = circleOf(element)
          return distance(point, center) <= radius
        }
    press = { start: event, latest: event, controller: new AbortController(), isSweeping: false, region }
    sweep(press)
  })
  element.addEventListener("pointermove", (event) => {
    if (!press) return
    press.latest = event
    const { start, isSweeping, region } = press
    const point = { x: event.pageX, y: event.pageY }
    const still = stillPx ?? STILL_TOLERANCE_PX
    const inside = isSweeping ? region(point) : distance(point, { x: start.pageX, y: start.pageY }) <= still
    if (!inside) release()
  })
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) element.addEventListener(type, release)

  async function sweep(held: NonNullable<typeof press>) {
    const { signal } = held.controller
    for await (const fill of fillProgress(ms, signal, SWEEP_DELAY_MS)) {
      if (fill > 0 && !held.isSweeping) {
        held.isSweeping = true
        onSweep?.()
      }
      element.toggleAttribute("data-holding", fill > 0)
      element.style.setProperty("--fill", `${fill}`)
    }
    element.removeAttribute("data-holding")
    element.style.removeProperty("--fill")
    if (held.isSweeping) onSweepEnd?.(!signal.aborted)
    if (!signal.aborted) onHold(held.latest)
  }

  function release() {
    press?.controller.abort()
    press = undefined
  }
}

/** The `secondPressWithin` window for a pointer type: touch holds on a single still press; mouse and pen keep the double-press gate. */
export function holdWindow(pointerType: string, doublePressMs: number) {
  return pointerType === "touch" ? undefined : doublePressMs
}

/** The `secondPressWithin` gate for a touch-only hold: any other pointer type can never hold. */
export function touchHoldOnly(event: PointerEvent) {
  return event.pointerType === "touch" ? undefined : false
}

/** Yields progress once per animation frame, staying at 0 for `delayMs` then reaching 1 over `ms`; stops early once `signal` aborts. */
async function* fillProgress(ms: number, signal: AbortSignal, delayMs = 0) {
  const start = performance.now() + delayMs
  let fill = 0
  while (fill < 1) {
    const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    if (signal.aborted) return
    fill = Math.min(1, Math.max(0, (now - start) / ms))
    yield fill
  }
}
