const FOCUS_RATIO = 0.5
const SETTLE_PX = 0.5
const MAX_STEP_PX = 120

/**
 * Keeps the last shown line near the middle of the window once the text reaches it.
 * `focusY` returns that line's page y; the scroll goal is the offset that puts it at the middle, clamped to the document.
 */
export function createViewportFollow(focusY: () => number) {
  let frame: number | undefined
  let goal = scrollY

  addEventListener("resize", onResize)
  addEventListener("wheel", cancel, { passive: true })
  addEventListener("touchmove", cancel, { passive: true })
  addEventListener("keydown", cancel)
  return { follow }

  function onResize() {
    requestAnimationFrame(follow)
  }

  function follow() {
    goal = Math.min(Math.max(focusY() - innerHeight * FOCUS_RATIO, 0), maxScroll())
    if (goal === scrollY) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return jump()
    frame ??= requestAnimationFrame(step)
  }

  function jump() {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    window.scrollTo({ top: goal, left: scrollX, behavior: "instant" })
  }

  function step() {
    frame = undefined
    const diff = goal - scrollY
    if (Math.abs(diff) <= SETTLE_PX) return jump()
    const stepPx = Math.sign(diff) * Math.min(Math.abs(diff) * 0.25, MAX_STEP_PX)
    window.scrollTo({ top: scrollY + stepPx, left: scrollX, behavior: "instant" })
    frame = requestAnimationFrame(step)
  }

  /** A hand on the scroll itself — wheel, touch drag, or keys — wins over the follow animation. */
  function cancel() {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
    frame = undefined
  }

  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - innerHeight)
  }
}
