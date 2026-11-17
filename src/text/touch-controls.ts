import { guardTouchHold } from "./touch.ts"

/** Hold this long before a nudge button's repeat kicks in. */
const ARM_MS = 300
/** Repeat speed right after arming, in words per second. */
const BASE_WPS = 6
const MIN_WPS = 1
const MAX_WPS = 48
/** Vertical drag distance, in px, per octave of repeat speed. */
const PX_PER_OCTAVE = 40
/** Drag this far vertically before the repeat speed leaves `BASE_WPS`. */
const DEAD_PX = 6

type TouchControlsOptions = {
  /** Moves the knob `delta` words along the reading order and returns how many it actually moved. */
  nudge: (delta: number) => number
  /** Word tick for each step the nudge buttons take: direction, words, speed 0–1, and the button's page x. */
  tick?: (direction: number, count: number, speed: number, x: number) => void
  /** Expands attention boxes or collapses them and future knobs. */
  toggleAttention: () => void
  /** Turns the current text selection into an attention box, no modifier needed. */
  commitBox: () => void
  /** Whether the current selection could become a box; drives the ⊞ button's disabled state. */
  canCommitBox: () => boolean
}

/** A press on a nudge button: the tap has already fired, and a hold repeats `nudge` at `wps` words per second. */
type NudgeHold = {
  pointerId: number
  /** The finger's clientY at press; vertical drags from here set `wps`. */
  startY: number
  wps: number
  armed: boolean
  /** `performance.now()` when the press started, and of the previous frame while repeating. */
  armAt: number
  last: number
  /** Fractional words carried between frames. */
  acc: number
  raf: number
}

/**
 * On-screen stand-ins for the keyboard's arrows and Enter plus the ⊞ box commit, shown only on coarse pointers via CSS.
 * They are ordinary buttons, so they work with touch, a stylus, or any click. A nudge button fires once on `pointerdown`;
 * holding it repeats at `BASE_WPS` after `ARM_MS`, and dragging vertically while held speeds the repeat up or down,
 * filling `--fill` like the knob's hold sweep does.
 */
export function createTouchControls({ nudge, tick, toggleAttention, commitBox, canCommitBox }: TouchControlsOptions) {
  const element = document.getElementById("touch-controls")
  if (!element) return { destroy() {} }
  const boxButton = element.querySelector<HTMLElement>("#touch-box")
  const updateBox = () => {
    if (boxButton instanceof HTMLButtonElement) boxButton.disabled = !canCommitBox()
  }
  const nudgeStops: (() => void)[] = []
  for (const button of element.querySelectorAll<HTMLButtonElement>("[data-nudge]")) {
    nudgeStops.push(watchNudge(button, tapNudge, nudge, tick))
  }
  const onClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest("button")
    if (!button || button.disabled) return
    if (button.id === "touch-box") return commitBox()
    if (button.hasAttribute("data-expand")) return toggleAttention()
    const delta = Number(button.dataset.nudge)
    // Pointer presses already nudged on pointerdown; only keyboard and screen-reader clicks (`detail` 0) still need it.
    if (delta && event.detail === 0) tapNudge(button as HTMLButtonElement, delta)
  }
  element.addEventListener("click", onClick)
  document.addEventListener("selectionchange", updateBox)
  guardTouchHold(element)
  updateBox()
  return {
    destroy() {
      element.removeEventListener("click", onClick)
      document.removeEventListener("selectionchange", updateBox)
      for (const stop of nudgeStops) stop()
    },
  }

  /** The tap half of a nudge: one step plus its word tick at the button's page x, shared by pointerdown and generated clicks. */
  function tapNudge(button: HTMLButtonElement, delta: number) {
    const moved = nudge(delta)
    if (!moved) return
    const rect = button.getBoundingClientRect()
    tick?.(Math.sign(moved), Math.abs(moved), 0, rect.left + rect.width / 2 + scrollX)
  }
}

/** Wires hold-to-repeat and drag-for-speed onto one `[data-nudge]` button; returns a function that removes its listeners. */
function watchNudge(
  button: HTMLButtonElement,
  tapNudge: (button: HTMLButtonElement, delta: number) => void,
  nudge: (delta: number) => number,
  tick: ((direction: number, count: number, speed: number, x: number) => void) | undefined,
) {
  const delta = Number(button.dataset.nudge)
  // The container guard lets descendant buttons keep their native menu; this button's own hold-repeat
  // must still suppress it, so it is guarded as the target itself.
  guardTouchHold(button)
  let hold: NudgeHold | undefined

  /** The button's horizontal center in page coordinates, where its word ticks sound from. */
  const centerX = () => {
    const rect = button.getBoundingClientRect()
    return rect.left + rect.width / 2 + scrollX
  }

  const frame = (now: number) => {
    if (!hold) return
    const dt = Math.min(0.1, (now - hold.last) / 1000)
    hold.last = now
    if (!hold.armed) {
      const progress = clamp01((now - hold.armAt) / ARM_MS)
      // Eases 0 → speedFill while arming so the fill's rise into the repeat state is continuous.
      button.style.setProperty("--fill", `${progress * speedFill(hold.wps)}`)
      if (progress < 1) return void (hold.raf = requestAnimationFrame(frame))
      hold.armed = true
    }
    hold.acc += hold.wps * dt
    const step = Math.floor(hold.acc)
    if (step > 0) {
      hold.acc -= step
      const moved = nudge(Math.sign(delta) * step)
      if (moved) tick?.(Math.sign(moved), Math.abs(moved), Math.min(1, hold.wps / MAX_WPS), centerX())
    }
    button.style.setProperty("--fill", `${speedFill(hold.wps)}`)
    hold.raf = requestAnimationFrame(frame)
  }

  const stopHold = () => {
    if (!hold) return
    cancelAnimationFrame(hold.raf)
    hold = undefined
    button.removeAttribute("data-holding")
    button.style.removeProperty("--fill")
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || hold || button.disabled) return
    tapNudge(button, delta)
    // Capture keeps vertical drags — and mouse or pen drags off the button — delivering pointermove here.
    button.setPointerCapture(event.pointerId)
    button.toggleAttribute("data-holding", true)
    button.style.setProperty("--fill", "0")
    hold = { pointerId: event.pointerId, startY: event.clientY, wps: BASE_WPS, armed: false, armAt: performance.now(), last: performance.now(), acc: 0, raf: 0 }
    hold.raf = requestAnimationFrame(frame)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!hold || event.pointerId !== hold.pointerId) return
    // Positive px means the finger moved up from the press point: faster. Down: slower.
    hold.wps = repeatSpeed(hold.startY - event.clientY)
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (hold?.pointerId === event.pointerId) stopHold()
  }

  button.addEventListener("pointerdown", onPointerDown)
  button.addEventListener("pointermove", onPointerMove)
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) button.addEventListener(type, onPointerEnd)
  return () => {
    stopHold()
    button.removeEventListener("pointerdown", onPointerDown)
    button.removeEventListener("pointermove", onPointerMove)
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) button.removeEventListener(type, onPointerEnd)
  }
}

/** Repeat speed in words per second for a vertical drag of `px` from the press point: one octave per `PX_PER_OCTAVE`, dead near the start. */
function repeatSpeed(px: number) {
  const offset = Math.abs(px) < DEAD_PX ? 0 : px
  return Math.min(MAX_WPS, Math.max(MIN_WPS, BASE_WPS * 2 ** (offset / PX_PER_OCTAVE)))
}

/** How full `--fill` reads at `wps`: 0 at `MIN_WPS`, 1 at `MAX_WPS`, logarithmic between. */
function speedFill(wps: number) {
  return clamp01((Math.log2(wps) - Math.log2(MIN_WPS)) / (Math.log2(MAX_WPS) - Math.log2(MIN_WPS)))
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
