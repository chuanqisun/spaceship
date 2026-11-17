import type { Point } from "../point.ts"

type DragHandlers = {
  /** Return false to ignore this press. */
  onStart?: (point: Point, pointerId: number) => boolean
  onDrag: (point: Point) => void
  onDrop?: () => void
}

export function makeDraggable(element: HTMLElement, { onStart, onDrag, onDrop }: DragHandlers) {
  element.addEventListener("pointerdown", ({ pointerId, pageX, pageY }) => {
    if (onStart?.({ x: pageX, y: pageY }, pointerId) === false) return
    element.setPointerCapture(pointerId)
  })
  element.addEventListener("pointermove", ({ pointerId, pageX, pageY }) => {
    if (element.hasPointerCapture(pointerId)) onDrag({ x: pageX, y: pageY })
  })
  if (onDrop) element.addEventListener("lostpointercapture", onDrop)
}
