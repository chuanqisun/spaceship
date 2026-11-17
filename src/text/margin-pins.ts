import type { Point } from "../point.ts"

/** Space between the column, a knob, its label and the page edge; and between stacked pins. */
const GAP_PX = 8
/** A label needs at least this much room beside its knob to be worth showing there; less and it moves under the knob. */
const MIN_LABEL_ROOM_PX = 24

/** A knob to pin beside the column, level with `anchor`: the page point of its sentence's first character. */
export type MarginPin = { anchor: Point; element: HTMLElement; label: HTMLElement }

/**
 * Places each pin in the right gutter, the left one being the rail's, with its label wrapped to fit the gutter, and stacks pins downward so they never overlap.
 * Where the gutter is too narrow for a label (`room` runs out, as in the collapsed mobile layout), pins stack inside the viewport's right edge instead, each label tucked under its knob — nothing is placed off-screen.
 * `columnRight` is the page x of the text column's right edge. Returns each pin's knob center, in order.
 */
export function placeInRightMargin(pins: MarginPin[], columnRight: number): Point[] {
  const viewportRight = document.documentElement.clientWidth + scrollX
  const room = viewportRight - columnRight
  const points: Point[] = []
  let bottom = -Infinity
  const order = pins.map((_, i) => i).sort((a, b) => pins[a].anchor.y - pins[b].anchor.y)
  for (const i of order) {
    const { element, label, anchor } = pins[i]
    const size = element.offsetWidth
    const labelRoom = room - size - 4 * GAP_PX
    let x: number
    // Extent above and below the knob's center; a label under the knob reaches further down than up.
    let above: number
    let below: number
    if (labelRoom >= MIN_LABEL_ROOM_PX) {
      label.style.maxWidth = `${labelRoom}px`
      clearBelow(label)
      const height = Math.max(size, label.offsetHeight)
      above = below = height / 2
      x = columnRight + GAP_PX + size / 2
    } else {
      x = Math.min(columnRight + GAP_PX + size / 2, viewportRight - GAP_PX - size / 2)
      // Flush right under the knob: centered, the label would run past the viewport edge the knob is clamped against, and the cap keeps its left edge on screen too.
      label.style.maxWidth = `${Math.max(0, x + size / 2 - scrollX - GAP_PX)}px`
      placeBelow(label, "end")
      above = size / 2
      below = size / 2 + GAP_PX + label.offsetHeight
    }
    const y = Math.max(anchor.y, bottom + GAP_PX + above)
    bottom = y + below
    points[i] = { x, y }
  }
  return points
}

/** Moves a pin's label from beside its knob to underneath it, centered or flush with the knob's right edge. */
function placeBelow(label: HTMLElement, align: "center" | "end" = "center") {
  label.style.left = align === "end" ? "auto" : "50%"
  label.style.right = align === "end" ? "0" : ""
  label.style.top = "calc(100% + var(--gap))"
  label.style.translate = align === "end" ? "0 0" : "-50% 0"
  label.style.textAlign = align === "end" ? "end" : "center"
}

function clearBelow(label: HTMLElement) {
  label.style.left = ""
  label.style.right = ""
  label.style.top = ""
  label.style.translate = ""
  label.style.textAlign = ""
}
