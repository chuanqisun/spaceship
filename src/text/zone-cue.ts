type ZoneCueOptions = {
  element: HTMLElement
  /** The text column; the cue marks its right edge. */
  textElement: HTMLElement
  /** Called with the pointer's viewport position each frame it moves. */
  zoneAtPoint: (x: number, y: number) => string
}

/**
 * Marks the boundary of the press-pull steering zone: while the pointer is in the empty region past the
 * caret, a faint hairline shows where the shown text ends and steering begins. Touch has no hover, so the
 * cue appears while a finger is down in the zone and hides when it lifts.
 */
export function createZoneCue({ element, textElement, zoneAtPoint }: ZoneCueOptions) {
  let frame: number | undefined
  let x = -1
  let y = -1
  /** The finger the cue currently tracks; other fingers' releases must not hide it. */
  let activeTouch: number | undefined

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      if (event.buttons === 0) return
      // The first finger down owns the cue; a second finger must not retarget it or hide it on lift.
      if (activeTouch !== undefined && event.pointerId !== activeTouch) return
      activeTouch = event.pointerId
    }
    x = event.clientX
    y = event.clientY
    frame ??= requestAnimationFrame(place)
  }
  const onTouchEnd = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || event.pointerId !== activeTouch) return
    activeTouch = undefined
    x = y = -1
    frame ??= requestAnimationFrame(place)
  }
  addEventListener("pointermove", onMove, { passive: true })
  addEventListener("pointerdown", onMove, { passive: true })
  addEventListener("pointerup", onTouchEnd, { passive: true })
  addEventListener("pointercancel", onTouchEnd, { passive: true })

  function place() {
    frame = undefined
    const { right, top, bottom } = textElement.getBoundingClientRect()
    const isAhead = x >= 0 && zoneAtPoint(x, y) === "ahead"
    // At <=44rem the column reaches the viewport edge, so the cue clamps inside it rather than marking offscreen.
    element.style.left = `${Math.min(right + 2, innerWidth - 1)}px`
    element.style.top = `${top}px`
    element.style.height = `${bottom - top}px`
    element.toggleAttribute("data-show", isAhead)
  }

  return {
    destroy() {
      removeEventListener("pointermove", onMove)
      removeEventListener("pointerdown", onMove)
      removeEventListener("pointerup", onTouchEnd)
      removeEventListener("pointercancel", onTouchEnd)
      if (frame !== undefined) cancelAnimationFrame(frame)
      element.remove()
    },
  }
}
