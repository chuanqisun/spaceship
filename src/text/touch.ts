import type { Point } from "../point.ts"

/** A touch press counts as a tap under this long and this still. */
export const TAP_MS = 400
export const TAP_PX = 12

type TouchTap = {
  x: number
  y: number
  at: number
  pointerId: number
}

/**
 * Calls `onTap` for a quick, still touch press on `element`. Drags, long presses and non-touch pointers never tap;
 * while a drag is in flight (`data-dragging`) the release is not a tap either.
 */
export function onTouchTap(element: HTMLElement, onTap: (point: Point) => void) {
  let press: TouchTap | undefined
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return
    press = { x: event.pageX, y: event.pageY, at: event.timeStamp, pointerId: event.pointerId }
  })
  element.addEventListener("pointerup", (event) => {
    const start = press
    press = undefined
    if (!start || event.pointerType !== "touch" || event.pointerId !== start.pointerId) return
    if (event.timeStamp - start.at > TAP_MS || Math.hypot(event.pageX - start.x, event.pageY - start.y) > TAP_PX) return
    if (element.hasAttribute("data-dragging")) return
    onTap({ x: event.pageX, y: event.pageY })
  })
  element.addEventListener("pointercancel", () => (press = undefined))
}

/**
 * Marks `element` with `data-pressed` while a touch press is down on it, so press-state styling can
 * answer "what is under the finger" where hover never fires. Other pointers and cancelled presses leave no mark.
 */
export function trackTouchPress(element: HTMLElement) {
  element.addEventListener("pointerdown", (event) => {
    element.toggleAttribute("data-pressed", event.pointerType === "touch")
  })
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    element.addEventListener(type, () => element.removeAttribute("data-pressed"))
  }
}

/**
 * Stops the native long-press context menu from firing `pointercancel` mid-hold on Android,
 * which would kill press-and-hold gestures such as the fan-menu spawn.
 * Only touch and pen presses are guarded: a mouse right-click or a keyboard-invoked menu
 * (`pointerType` empty) keeps its menu, and so does a press inside a text field, where the
 * menu is how paste and spellcheck are reached.
 */
export function guardTouchHold(element: HTMLElement) {
  element.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) return
      const { pointerType } = event as PointerEvent
      if (pointerType === "touch" || pointerType === "pen") event.preventDefault()
    },
    { capture: true },
  )
}
