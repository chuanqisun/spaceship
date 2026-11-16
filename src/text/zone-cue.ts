type ZoneCueOptions = {
  element: HTMLElement
  /** The text column; the cue marks its right edge. */
  textElement: HTMLElement
  /** Called with the pointer's viewport position each frame it moves. */
  zoneAtPoint: (x: number, y: number) => string
}

/**
 * Marks the boundary of the press-pull steering zone: while the pointer is in the empty region past the
 * caret, a faint hairline shows where the shown text ends and steering begins.
 */
export function createZoneCue({ element, textElement, zoneAtPoint }: ZoneCueOptions) {
  let frame: number | undefined
  let x = -1
  let y = -1

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    x = event.clientX
    y = event.clientY
    frame ??= requestAnimationFrame(place)
  }
  addEventListener("pointermove", onMove, { passive: true })

  function place() {
    frame = undefined
    const { right, top, bottom } = textElement.getBoundingClientRect()
    const isAhead = zoneAtPoint(x, y) === "ahead"
    element.style.left = `${right + 2}px`
    element.style.top = `${top}px`
    element.style.height = `${bottom - top}px`
    element.toggleAttribute("data-show", isAhead)
  }

  return {
    destroy() {
      removeEventListener("pointermove", onMove)
      if (frame !== undefined) cancelAnimationFrame(frame)
      element.remove()
    },
  }
}
