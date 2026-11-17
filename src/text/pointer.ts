import type { Point } from "../point.ts"

/** Targets frame themselves within this distance of the hand: not at all at its edge, fully when touched. */
const RANGE_PX = 120
/** Past the main knob, a tether leads to the nearest target within this distance. */
const TETHER_RANGE_PX = 260
/** Only the nearest target is labelled, and only this close. */
const LABEL_NEAR = 0.6
/** While steering, the knob closes this share of its gap (in words) each second, between `MIN_WPS` and `MAX_WPS`. */
const PULL_RATE = 2.5
const MIN_WPS = 3
const MAX_WPS = 40
/** The steering vector is ticked once per this many words still to go, like the ruler on a future knob's link. */
const WORDS_PER_TICK = 5
/** Lines (the vector, the tether) stop short of the knob and the hand by this much. */
const LINE_INSET_PX = 9
/** Arm length of a corner bracket, and half the width of an I-beam's serifs. */
const BRACKET_ARM_PX = 5
const SERIF_PX = 2.5
/** Room between words and the brackets around them. */
const TEXT_PAD_PX = 3

/**
 * Something the hand can act on: its boxes in viewport coordinates (one per line for text), the room its brackets leave, the element that wakes by nearness, its label,
 * and whether its brackets turn orange while the hand is on it.
 */
export type PointerTarget = { rects: DOMRect[]; pad: number; wake?: HTMLElement; label?: () => (string | Node)[]; isHotOnHover?: boolean }

/** Where the hand points, as the main knob would take it: `gap` words ahead of the knob (negative behind), the last word the knob shows now, the knob's center. */
export type Aim = { gap: number; tip?: DOMRect; knob: Point }

/** What lies under the hand: shown text (it selects), an attention box (it drags), the empty page past the main knob (a press steers), or anything else. */
export type Zone = "text" | "box" | "ahead" | "other"

/** A selection being made: line-high carets at its two ends, and the boxes of the whole words it would become. */
export type SelectionPreview = { anchor: DOMRect; focus: DOMRect; words: DOMRect[] }

type PointerOptions = {
  /** A full-page layer that never takes the pointer. */
  layer: HTMLElement
  targets: () => PointerTarget[]
  /** Whether the hand is dragging something, so the pointer shows live (orange) and nothing else wakes. */
  isDragging: () => boolean
  /** The zone of the viewport point `x`, `y`, over `element`. */
  zoneAt: (element: Element, x: number, y: number) => Zone
  /** The line-high caret between characters nearest the viewport point, over shown text. */
  caretAt: (x: number, y: number) => DOMRect | undefined
  /** The selection in the text while one is being made. */
  selection: () => SelectionPreview | undefined
  /** How the main knob relates to the viewport point `x`, `y`. */
  aim: (x: number, y: number) => Aim | undefined
  /** Moves the main knob `words` further toward the viewport point. */
  pull: (x: number, y: number, words: number) => void
  /** Compact pull-rate readout for a touch press-pull, standing in for the vector label the hidden cursor would show. */
  steerReadout?: HTMLElement
}

type Near = { target: PointerTarget; near: number; distance: number; point: Point }

/**
 * The page's pointer, for mice and pens; touch keeps none. A crosshair always says where the hand is (hairlines edge to edge at its exact position, never snapped);
 * the rest depends on what lies under it:
 * - anywhere, targets within reach frame themselves by nearness and wake; the nearest is labelled. Text spanning lines is framed as one block.
 * - over shown text, a minimal I-beam marks the gap between characters where a selection would start; while selecting, both ends are marked
 *   and the whole words the selection will become are framed. Over an attention box, which drags rather than selects, the I-beam gives way to the dot.
 * - past the main knob, a high-contrast dot marks the point and a tether leads to the nearest target; a press there steers: the knob is pulled
 *   toward the hand word by word, while brackets frame the last word shown, moving forward with it.
 * Orange marks what the hand is changing: a drag, a selection, a pull. The crosshair is drawn straight from each pointer event; everything else once per frame.
 */
export function createPointer({ layer, targets, isDragging, zoneAt, caretAt, selection, aim, pull, steerReadout }: PointerOptions) {
  /** It takes over from the OS pointer on the first mouse or pen movement, and steps aside as soon as a touch arrives, so hybrid devices work. */
  const use = (isCustom: boolean) => {
    if (isCustom) document.documentElement.dataset.cursor = "custom"
    else delete document.documentElement.dataset.cursor
  }

  layer.innerHTML = `
    <i class="hairline vertical"></i><i class="hairline horizontal"></i>
    <svg class="marks"><g class="field"></g><path class="ibeam" /><line class="tether" /><line class="vector" /><path class="vector-ticks" /><g class="live-marks"></g></svg>
    <i class="dot"></i>
    <span class="readout field-label"></span><span class="readout vector-label"></span>`
  const field = layer.querySelector<SVGGElement>(".field")!
  const ibeam = layer.querySelector<SVGPathElement>(".ibeam")!
  const tether = layer.querySelector<SVGLineElement>(".tether")!
  const vector = layer.querySelector<SVGLineElement>(".vector")!
  const ticks = layer.querySelector<SVGPathElement>(".vector-ticks")!
  const liveMarks = layer.querySelector<SVGGElement>(".live-marks")!
  const fieldLabel = layer.querySelector<HTMLElement>(".field-label")!
  const vectorLabel = layer.querySelector<HTMLElement>(".vector-label")!

  const hand = { x: -1000, y: -1000 }
  /** Fingers currently down on the page, so one lifting doesn't drop another's press state. */
  const pressed = new Set<number>()
  let isSteering = false
  /** The pointer steering the pull; other fingers' releases must not end it. */
  let steerId: number | undefined
  /** Whether the steering press is a finger's: only then does the compact readout appear. */
  let steerTouch = false
  /** Fractional words carry over between frames, so the pull rate stays exact at any frame rate. */
  let carry = 0
  /** Scroll offset when the steering press began; `aim` adds the live scroll back, so subtracting it keeps the target anchored in document space if the page scrolls mid-pull. */
  let steerScroll = { x: 0, y: 0 }
  let frame: number | undefined
  let last = 0
  let woken: HTMLElement[] = []
  /** While a touch steers, its target takes `touch-action: pan-y` so vertical pans still scroll natively while other drags stay the app's; `lostpointercapture` restores the inline value. */
  let steeringTouch: { element: HTMLElement; value: string } | undefined

  addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      // Touch keeps no cursor overlay, but the steering finger's drag still needs the hand's position.
      if (isSteering && event.pointerId === steerId) {
        hand.x = event.clientX
        hand.y = event.clientY
        schedule()
      }
      return
    }
    use(true)
    hand.x = event.clientX
    hand.y = event.clientY
    layer.style.setProperty("--x", `${hand.x}px`)
    layer.style.setProperty("--y", `${hand.y}px`)
    schedule()
  })
  document.documentElement.addEventListener("pointerleave", () => {
    hand.x = hand.y = -1000
    layer.style.setProperty("--x", "-1000px")
    schedule()
  })
  addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      use(false)
      if (event.button !== 0 || !(event.target instanceof Element)) return
      pressed.add(event.pointerId)
      hand.x = event.clientX
      hand.y = event.clientY
      // One steering touch at a time; extra fingers still count as presses but must not overwrite `steeringTouch`.
      if (steerId !== undefined) return schedule()
      if (zoneAt(event.target, event.clientX, event.clientY) !== "ahead") return schedule()
      isSteering = true
      steerId = event.pointerId
      steerTouch = true
      carry = 0
      steerScroll = { x: scrollX, y: scrollY }
      // `pan-y pinch-zoom` lets a vertical drag scroll or a pinch zoom natively (the browser then cancels the
      // press); anything else is the app's pull. `touch-action` is read off the touched element itself, so it
      // must be set there, not on an ancestor.
      if (event.target instanceof HTMLElement) {
        steeringTouch = { element: event.target, value: event.target.style.getPropertyValue("touch-action") }
        event.target.style.setProperty("touch-action", "pan-y pinch-zoom")
      }
      return schedule()
    }
    if (event.button !== 0) return
    pressed.add(event.pointerId)
    schedule()
    if (!(event.target instanceof Element) || zoneAt(event.target, event.clientX, event.clientY) !== "ahead") return
    event.preventDefault()
    document.body.setPointerCapture(event.pointerId)
    isSteering = true
    steerId = event.pointerId
    steerTouch = false
    carry = 0
    steerScroll = { x: scrollX, y: scrollY }
  })
  // Only the steering pointer's own release or capture loss ends the pull; other fingers' events are ignored.
  const release = (event: PointerEvent) => {
    pressed.delete(event.pointerId)
    if (event.pointerId !== steerId) return schedule()
    isSteering = false
    steerId = undefined
    steerTouch = false
    releaseSteeringTouch()
    schedule()
  }
  addEventListener("pointerup", release)
  addEventListener("pointercancel", release)
  document.body.addEventListener("lostpointercapture", release)
  addEventListener("scroll", schedule, { passive: true })

  function schedule() {
    frame ??= requestAnimationFrame(tick)
  }

  function releaseSteeringTouch() {
    if (!steeringTouch) return
    const { element, value } = steeringTouch
    steeringTouch = undefined
    if (value) element.style.setProperty("touch-action", value)
    else element.style.removeProperty("touch-action")
  }

  function tick(now: number) {
    frame = undefined
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    const isOnPage = hand.x >= 0
    const under = isOnPage ? document.elementFromPoint(hand.x, hand.y) : null
    const zone = isSteering ? "ahead" : under ? zoneAt(under, hand.x, hand.y) : "other"
    const selecting = pressed.size > 0 && !isSteering ? selection() : undefined

    const pointed = isSteering ? aim(hand.x + steerScroll.x - scrollX, hand.y + steerScroll.y - scrollY) : undefined
    const isPulling = (pointed?.gap ?? 0) > 0
    let rate = 0
    if (isPulling) {
      rate = Math.min(MAX_WPS, Math.max(MIN_WPS, pointed!.gap * PULL_RATE))
      carry += rate * dt
      const words = Math.min(pointed!.gap, Math.floor(carry))
      if (words > 0) {
        carry -= words
        pull(hand.x, hand.y, words)
      }
    } else carry = 0

    const isLive = isPulling || isDragging() || selecting !== undefined
    layer.toggleAttribute("data-live", isLive)
    layer.dataset.zone = isOnPage ? zone : "other"
    const near = isOnPage && !isLive ? measure() : []
    showField(near, zone === "box")
    showTether(zone === "ahead" && !isLive ? near : [])
    ibeam.setAttribute("d", zone === "text" && !isLive ? iBeamAt(caretAt(hand.x, hand.y)) : "")
    liveMarks.replaceChildren()
    if (selecting) showSelection(selecting)
    showVector(pointed, rate)
    if (steerReadout) {
      const text = isSteering && steerTouch ? (isPulling ? `+${pointed!.gap} words · ${Math.round(rate)} w/s` : "behind the knob") : ""
      if (steerReadout.textContent !== text) steerReadout.textContent = text
    }

    // Steering integrates words per second, so it repaints every frame; every other state repaints on demand.
    if (isSteering) frame = requestAnimationFrame(tick)
    else last = 0
  }

  /** How near each target is to the hand, with its point nearest the hand. */
  function measure(): Near[] {
    return targets()
      .filter(({ rects }) => rects.length > 0)
      .map((target) => {
        const nearest = target.rects
          .map(({ left, top, right, bottom }) => {
            const point = { x: Math.min(Math.max(hand.x, left), right), y: Math.min(Math.max(hand.y, top), bottom) }
            return { point, distance: Math.hypot(hand.x - point.x, hand.y - point.y) }
          })
          .reduce((a, b) => (b.distance < a.distance ? b : a))
        return { target, ...nearest, near: eased(1 - nearest.distance / RANGE_PX) }
      })
  }

  /** Frames each target within reach by nearness (the nearest fully, the rest at 60%) and wakes it; labels the nearest at close range. `isOnBox`: the hand is on an attention box, the nearest target, whose brackets then turn orange: a press there grabs it. */
  function showField(all: Near[], isOnBox: boolean) {
    for (const element of woken) element.style.removeProperty("--near")
    woken = []
    const near = all.filter(({ near }) => near > 0)
    const nearest = near.reduce<Near | undefined>((best, entry) => (!best || entry.near > best.near ? entry : best), undefined)
    field.innerHTML = near
      .map(({ target, near }) => {
        const { contour, corners } = outline(target.rects, target.pad)
        const isGrabbable = target === nearest?.target && (isOnBox || (target.isHotOnHover === true && nearest.distance === 0))
        const opacity = isGrabbable ? 1 : target === nearest?.target ? near : near * 0.6
        return `<g opacity="${opacity.toFixed(3)}"${isGrabbable ? ' class="grabbable"' : ""}><path class="contour" d="${contour}" /><path class="corners" d="${corners}" /></g>`
      })
      .join("")
    for (const { target, near: value } of near) {
      if (!target.wake) continue
      target.wake.style.setProperty("--near", value.toFixed(3))
      woken.push(target.wake)
    }
    const parts = nearest && nearest.near > LABEL_NEAR ? (nearest.target.label?.() ?? []) : []
    fieldLabel.replaceChildren(...parts)
    if (parts.length) {
      const first = nearest!.target.rects.reduce((a, b) => (b.top < a.top ? b : a))
      fieldLabel.style.translate = `${first.left - 3}px ${first.top - 18}px`
    }
  }

  /** Past the main knob: a dashed line from the dot to the nearest target's nearest edge, stronger the nearer it is. */
  function showTether(all: Near[]) {
    const nearest = all.reduce<Near | undefined>((best, entry) => (!best || entry.distance < best.distance ? entry : best), undefined)
    const strength = nearest ? eased(1 - nearest.distance / TETHER_RANGE_PX) : 0
    if (!nearest || strength === 0 || nearest.distance < LINE_INSET_PX) return void tether.setAttribute("opacity", "0")
    const { point, distance } = nearest
    const ux = (point.x - hand.x) / distance
    const uy = (point.y - hand.y) / distance
    tether.setAttribute("x1", `${hand.x + ux * LINE_INSET_PX}`)
    tether.setAttribute("y1", `${hand.y + uy * LINE_INSET_PX}`)
    tether.setAttribute("x2", `${point.x}`)
    tether.setAttribute("y2", `${point.y}`)
    tether.setAttribute("opacity", (0.3 + 0.7 * strength).toFixed(3))
  }

  /** While selecting: I-beams at both ends, and the whole words the selection will become framed as one block. */
  function showSelection({ anchor, focus, words }: SelectionPreview) {
    const block = words.length ? outline(words, TEXT_PAD_PX) : { contour: "", corners: "" }
    liveMarks.innerHTML = `<path class="contour" d="${block.contour}" /><path class="corners" d="${block.corners}" /><path class="ends" d="${iBeamAt(anchor)}${iBeamAt(focus)}" />`
  }

  /** The steering vector from the knob to the hand, ticked per five words to go, and brackets on the last word shown as it moves forward. */
  function showVector(pointed: Aim | undefined, rate: number) {
    const state = !pointed || pointed.gap === 0 ? "off" : pointed.gap > 0 ? "pulling" : "behind"
    layer.dataset.steer = state
    if (state === "off") {
      vectorLabel.textContent = ""
      return
    }
    const { knob, gap, tip } = pointed!
    const length = Math.hypot(hand.x - knob.x, hand.y - knob.y)
    const ux = (hand.x - knob.x) / (length || 1)
    const uy = (hand.y - knob.y) / (length || 1)
    vector.setAttribute("x1", `${knob.x + ux * LINE_INSET_PX}`)
    vector.setAttribute("y1", `${knob.y + uy * LINE_INSET_PX}`)
    vector.setAttribute("x2", `${hand.x - ux * LINE_INSET_PX}`)
    vector.setAttribute("y2", `${hand.y - uy * LINE_INSET_PX}`)
    const count = state === "pulling" ? Math.floor(gap / WORDS_PER_TICK) : 0
    ticks.setAttribute(
      "d",
      Array.from({ length: count }, (_, i) => {
        const along = LINE_INSET_PX + ((length - 2 * LINE_INSET_PX) * (i + 1)) / (count + 1)
        const x = knob.x + ux * along
        const y = knob.y + uy * along
        return `M${x - uy * 3},${y + ux * 3}L${x + uy * 3},${y - ux * 3}`
      }).join(""),
    )
    if (state === "pulling" && tip) liveMarks.innerHTML += `<path class="corners" d="${outline([tip], TEXT_PAD_PX).corners}" />`
    vectorLabel.replaceChildren(...(state === "pulling" ? [strong(`+${gap}`), ` words · ${Math.round(rate)} w/s`] : ["behind the knob"]))
    vectorLabel.style.translate = `${hand.x + 12}px ${hand.y + 10}px`
  }
}

/**
 * Brackets for boxes stacked as lines of text: corner brackets at the block's four defining corners (where it starts, the first line's end,
 * where it ends, the last line's start), and for a block of several lines a contour hairline around its ragged shape, lines meeting halfway between them.
 */
const strong = (text: string | number) => Object.assign(document.createElement("b"), { textContent: String(text) })

function outline(rects: DOMRect[], pad: number) {
  const lines = [...rects].sort((a, b) => a.top - b.top)
  const n = lines.length
  const tops = lines.map((r, i) => (i === 0 ? r.top - pad : (lines[i - 1].bottom + r.top) / 2))
  const bottoms = lines.map((r, i) => (i === n - 1 ? r.bottom + pad : (r.bottom + lines[i + 1].top) / 2))
  const left = (r: DOMRect) => r.left - pad
  const right = (r: DOMRect) => r.right + pad
  const [first, last] = [lines[0], lines[n - 1]]
  const corner = (x: number, y: number, dx: number, dy: number) => `M${x + dx * BRACKET_ARM_PX},${y}H${x}V${y + dy * BRACKET_ARM_PX}`
  const corners =
    corner(left(first), tops[0], 1, 1) +
    corner(right(first), tops[0], -1, 1) +
    corner(right(last), bottoms[n - 1], -1, -1) +
    corner(left(last), bottoms[n - 1], 1, -1)
  if (n === 1) return { contour: "", corners }
  const points: [number, number][] = [[left(first), tops[0]]]
  lines.forEach((r, i) => points.push([right(r), tops[i]], [right(r), bottoms[i]]))
  for (let i = n - 1; i >= 0; i--) points.push([left(lines[i]), bottoms[i]], [left(lines[i]), tops[i]])
  return { contour: `M${points.map(([x, y]) => `${x},${y}`).join("L")}Z`, corners }
}

/** A minimal I-beam: a line-high stroke with small serifs, at the caret. */
function iBeamAt(caret: DOMRect | undefined) {
  if (!caret) return ""
  const { x, top, bottom } = caret
  return `M${x - SERIF_PX},${top}H${x + SERIF_PX}M${x},${top}V${bottom}M${x - SERIF_PX},${bottom}H${x + SERIF_PX}`
}

/** 0 at or below 0, 1 at or above 1, smooth in between. */
function eased(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}
