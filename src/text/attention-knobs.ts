import type { Point } from "../point.ts"
import { startAttention, type AttentionBox, type AttentionGeneration, type AttentionSource, type Lead } from "./attention.ts"
import { makeDraggable } from "./drag.ts"
import { circleOf, distance, linkBetween, pathOf } from "./links.ts"
import { onPressAndHold } from "./hold.ts"
import { wordSpans, type Span } from "./segments.ts"
import { sounds } from "./sound/sounds.ts"
import { domPointAt, textOffsetOf } from "./text-offsets.ts"
import { isCoarsePointer } from "./breakpoints.ts"
import { guardTouchHold, onTouchTap } from "./touch.ts"

const KEYWORD_HIGHLIGHT = "attention-word"
/** The keyword of the box under the pointer or being dragged, set apart since it is what a drag moves. */
const ACTIVE_KEYWORD_HIGHLIGHT = "attention-word-active"
/** Must match the `::highlight(attention-shade-N)` rules in the page styles. */
const SHADE_LEVELS = 5
/** Effective touch target edge for an attention box on coarse pointers (SC-003). */
const TOUCH_TARGET_PX = 24

type AttentionKnobsOptions = {
  source: AttentionSource
  textElement: HTMLElement
  knob: HTMLElement
  /** Draws a line from each keyword's underline to `knob`. */
  linkPath: SVGPathElement
  /** Draws the link of the box under the pointer or being dragged, instead of `linkPath`. */
  activeLinkPath: SVGPathElement
  isPastEnd: (point: Point) => boolean
  /** Called when the user changes the boxes or the text drops some; may fire in quick succession while dragging. Not called by `expand`, which the caller can await. */
  onChange: () => void
  /** Called with the text span of the box under the pointer (or being dragged) whenever it changes, or with undefined once there is none. */
  onHover: (phrase: Span | undefined) => void
  /** Called after the boxes are repainted, including while `expand` adds them. */
  onPaint?: () => void
  /** Called with a box's keyword when a touch tap lands on it, standing in for the hover readout. */
  onBoxTap?: (keyword: string) => void
}

/**
 * Attention knobs are shaded boxes of words: generated around keywords by expanding, or made from a text selection.
 * Dragging a box moves its keyword to the word under the pointer; double clicking a box deletes it.
 * `text` must equal the element's text with line breaks as spaces, so offsets match the DOM text, which may be split across child elements.
 */
export function createAttentionKnobs({
  source,
  textElement,
  knob,
  linkPath,
  activeLinkPath,
  isPastEnd,
  onChange,
  onHover,
  onPaint,
  onBoxTap,
}: AttentionKnobsOptions) {
  const lineHeight = parseFloat(getComputedStyle(textElement).lineHeight)
  /** Later boxes are on top, so they are grabbed first. */
  let boxes: AttentionBox[] = []
  let grabbed: AttentionBox | undefined
  /** The box under the pointer or being dragged. */
  let active: AttentionBox | undefined
  let text = ""
  let words: Span[] = []
  let wordRects: DOMRect[] | undefined
  let prefetched: AttentionGeneration | undefined
  let shown: AttentionGeneration | undefined
  /** Whether the press that made the current selection held Alt, which is what turns it into a box on release. */
  let selectWithAlt = false
  /** The pointer type of the last press on the text: touch selections get the floating box action instead of a modifier. */
  let lastPointer: string = "mouse"
  /** The floating action that turns a touch selection into a box. */
  const boxAction = Object.assign(document.createElement("button"), {
    id: "box-action",
    type: "button",
    textContent: "box",
    hidden: true,
  })
  boxAction.setAttribute("aria-label", "make the selection an attention box")
  document.body.append(boxAction)
  guardTouchHold(boxAction)
  /** The pointer's latest page x over the text, where box sounds come from. */
  let pointerX = 0
  /** Release of the touch press currently suppressing text gestures for a box; one claim at a time so overlapping presses can't corrupt each other's restore. */
  let releaseBoxTouch: (() => void) | undefined

  makeDraggable(textElement, { onStart: grab, onDrag: moveGrabbed, onDrop: dropGrabbed })
  textElement.addEventListener("pointerdown", (event) => {
    const { altKey, pointerType, pageX, pageY } = event
    selectWithAlt = altKey
    lastPointer = pointerType
    const point = { x: pageX, y: pageY }
    hover(grabbed ?? boxes[boxAt(point)])
    if (pointerType === "touch") claimBoxTouch(event)
  })
  textElement.addEventListener("mousedown", (event) => {
    if (boxAt(pointOf(event)) !== -1) event.preventDefault()
  })
  textElement.addEventListener("pointermove", (event) => {
    pointerX = event.pageX
    const index = boxAt(pointOf(event))
    textElement.style.cursor = index === -1 ? "" : "grab"
    hover(grabbed ?? boxes[index])
  })
  textElement.addEventListener("pointerleave", () => hover(grabbed))
  textElement.addEventListener("dblclick", (event) => {
    // A synthesized dblclick from a touch double-tap must not delete; touch deletes on a still press.
    if (lastPointer === "touch") return
    if (deleteBox(boxAt(pointOf(event)))) sounds.remove(event.pageX)
  })
  // Touch has no double click: a still ~500 ms press on a box deletes it, where a mouse double clicks.
  // Only a press that starts on a box arms the sweep, so still-presses for native selection or copy
  // never paint the delete affordance. The press also grabs the box for a possible drag, so a deleted
  // grab must not be re-added on release.
  onPressAndHold(
    textElement,
    500,
    ({ pageX, pageY }) => {
      // A press that started on a box already grabbed it; if reflow moved the words mid-hold,
      // `boxAt` can miss — fall back to the grabbed box rather than no-op.
      const at = boxAt({ x: pageX, y: pageY })
      const index = at === -1 && grabbed ? boxes.indexOf(grabbed) : at
      if (index === -1) return
      const removed = boxes[index]
      if (!deleteBox(index)) return
      if (grabbed === removed) grabbed = undefined
      sounds.remove(pageX)
    },
    {
      secondPressWithin: (event) => {
        if (event.pointerType !== "touch") return false
        return boxAt({ x: event.pageX, y: event.pageY }) === -1 ? false : undefined
      },
      sweepRegion: (press) => {
        const index = boxAt({ x: press.pageX, y: press.pageY })
        if (index === -1) return
        const rects = targetRectsOf(boxes[index])
        return (point) => rects.some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom)
      },
    },
  )
  // A touch tap on a box reports its keyword the way hover does for a mouse.
  onTouchTap(textElement, ({ x, y }) => {
    const index = boxAt({ x, y })
    const box = boxes[index]
    if (!box) return
    onBoxTap?.(text.slice(words[box.keyword].start, words[box.keyword].end))
  })
  document.addEventListener("pointerup", boxSelection)
  document.addEventListener("selectionchange", showBoxAction)
  boxAction.addEventListener("click", () => {
    commitSelection(pointerX, true)
    hideBoxAction()
  })
  addEventListener("scroll", hideBoxAction, { passive: true })
  addEventListener("resize", hideBoxAction)

  return {
    update,
    prefetch,
    expand,
    collapse,
    leads,
    spans,
    isExpanded: () => boxes.length > 0 || shown !== undefined,
    isDragging: () => grabbed !== undefined,
    /** Whether the page point is on a box, which a press there would drag. */
    isOverBox: (point: Point) => boxAt(point) !== -1,
    states,
    restore,
    /** The touch ⊞ commit: turns the current text selection into a box, no modifier needed. */
    commitSelection: () => commitSelection(pointerX, true),
    canCommitSelection,
  }

  /** Repaints even when `nextText` is unchanged, because the main knob may have moved. */
  function update(nextText: string) {
    if (nextText !== text) {
      text = nextText
      words = wordSpans(text)
      wordRects = undefined
      const kept = boxes.filter(({ keyword }) => keyword < words.length)
      const isDropped = kept.length < boxes.length
      boxes = kept
      discardPrefetched()
      if (isDropped) onChange()
    }
    paint()
  }

  function leads(): Lead[] {
    return boxes.map((box) => {
      const [first, last] = spanOf(box, words.length)
      const keyword = words[box.keyword]
      return {
        before: text.slice(words[first].start, keyword.start),
        keyword: text.slice(keyword.start, keyword.end),
        after: text.slice(keyword.end, words[last].end),
      }
    })
  }

  /** Each box's phrase and keyword as spans of the text, and whether it is under the pointer or dragged; in the order of `leads`. */
  function spans(): BoxSpans[] {
    return boxes.map((box) => {
      const [first, last] = spanOf(box, words.length)
      return { phrase: { start: words[first].start, end: words[last].end }, keyword: words[box.keyword], isActive: box === active }
    })
  }

  function prefetch() {
    if (words.length && prefetched?.text !== text) prefetched = startAttention(source, text)
  }

  /** Generates boxes, adding each as it arrives. */
  async function expand() {
    if (!words.length) return
    const generation = takePrefetched() ?? startAttention(source, text)
    shown = generation
    let revealed = 0
    for await (const box of generation) {
      if (shown !== generation) return
      if (box.keyword >= words.length) continue
      addBox({ ...box })
      sounds.boxRevealed(revealed++, pageRect(rangeOf(box.keyword, box.keyword).getBoundingClientRect()).x)
    }
    if (shown === generation) shown = undefined
  }

  /** Removes all boxes, including those still arriving. */
  function collapse() {
    shown?.abort()
    shown = undefined
    const hadBoxes = boxes.length > 0
    boxes = []
    paint()
    if (hadBoxes) onChange()
  }

  function takePrefetched() {
    const generation = prefetched
    prefetched = undefined
    if (generation?.text === text) return generation
    generation?.abort()
  }

  function discardPrefetched() {
    prefetched?.abort()
    prefetched = undefined
  }

  /** The `[first, last]` word indexes a selection inside the text covers, rounded out to the whole words it overlaps, or undefined when it cannot become a box. Both endpoints must lie inside `#text`, matching `#box-action`'s common-ancestor check. */
  function selectionSpan(): [number, number] | undefined {
    const selection = getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (!textElement.contains(range.commonAncestorContainer)) return
    const start = textOffsetOf(textElement, range.startContainer, range.startOffset)
    const end = textOffsetOf(textElement, range.endContainer, range.endOffset)
    const first = words.findIndex((word) => word.end > start)
    const last = words.findLastIndex((word) => word.start < end)
    return first === -1 || last < first ? undefined : [first, last]
  }

  /** Whether the current selection inside the text could become a box right now; drives the ⊞ button's disabled state. */
  function canCommitSelection() {
    return selectionSpan() !== undefined
  }

  /** A selection becomes a box only when Alt was held through it (or the floating action asked); a plain selection stays a normal selection so copying works. */
  function boxSelection({ pageX, altKey }: PointerEvent) {
    commitSelection(pageX, altKey || selectWithAlt)
  }

  function commitSelection(pageX: number, viaAction: boolean) {
    const selection = getSelection()
    if (!selection?.rangeCount || !viaAction) return
    const span = selectionSpan()
    if (!span) return

    const [first, last] = span
    const keyword = Math.floor((first + last) / 2)
    selection.removeAllRanges()
    addBox({ keyword, before: keyword - first, after: last - keyword })
    sounds.boxCreate(pageX)
    onChange()
  }

  /** While a touch selection covers text, offer the box action beside it; it hides as soon as the selection collapses or the page moves. */
  function showBoxAction() {
    const selection = getSelection()
    if (lastPointer !== "touch" || !selection?.rangeCount || selection.isCollapsed || !words.length) return hideBoxAction()
    const range = selection.getRangeAt(0)
    if (!textElement.contains(range.commonAncestorContainer)) return hideBoxAction()
    boxAction.hidden = false
    const rect = range.getBoundingClientRect()
    const margin = 8
    boxAction.style.left = `${Math.min(Math.max(margin, rect.left + rect.width / 2 - boxAction.offsetWidth / 2), innerWidth - boxAction.offsetWidth - margin)}px`
    boxAction.style.top = `${Math.min(rect.bottom + margin, innerHeight - boxAction.offsetHeight - margin)}px`
  }

  function hideBoxAction() {
    boxAction.hidden = true
  }

  /** Each box as a session state: its keyword's word and how many words flank it. */
  function states(): BoxState[] {
    return boxes.map((box) => ({
      keyword: text.slice(words[box.keyword].start, words[box.keyword].end),
      before: box.before,
      after: box.after,
    }))
  }

  /** Rebuilds boxes from session states, matching each keyword's word in the current text; unmatched states are dropped. */
  function restore(states: BoxState[]) {
    const used = new Set<number>()
    for (const state of states) {
      const index = words.findIndex((word, i) => !used.has(i) && text.slice(word.start, word.end) === state.keyword)
      if (index === -1) continue
      used.add(index)
      addBox({ keyword: index, before: state.before, after: state.after })
    }
    if (used.size) onChange()
  }

  /** Adds `box` on top, replacing boxes on the same keyword. */
  function addBox(box: AttentionBox) {
    boxes = [...boxes.filter((other) => other !== box && other.keyword !== box.keyword), box]
    paint()
  }

  /** Returns whether there was a box to delete. */
  function deleteBox(index: number) {
    if (index === -1) return false
    boxes.splice(index, 1)
    paint()
    onChange()
    return true
  }

  function grab(point: Point) {
    const index = boxAt(point)
    if (index === -1) return false
    grabbed = boxes.splice(index, 1)[0]
    boxes.push(grabbed)
    sounds.boxGrab(point.x)
    return true
  }

  function moveGrabbed(point: Point) {
    const word = wordNear(point)
    if (!grabbed || word === undefined || word === grabbed.keyword) return
    grabbed.keyword = word
    sounds.boxHop(point.x)
    paint()
    onChange()
  }

  function dropGrabbed() {
    if (grabbed) {
      addBox(grabbed)
      sounds.boxDrop(pointerX)
      paint()
    }
    grabbed = undefined
  }

  function hover(box: AttentionBox | undefined) {
    if (box !== active) {
      if (box && !grabbed) sounds.boxHover(pointerX)
      active = box
      paintFocus()
    }
    if (!box) return onHover(undefined)
    const [first, last] = spanOf(box, words.length)
    onHover({ start: words[first].start, end: words[last].end })
  }

  /**
   * A touch press that starts on a box belongs to the box for its whole gesture: `touch-action: none` keeps
   * vertical drags from scrolling instead of moving the keyword, and the callout, context menu and selection
   * stay suppressed until the finger lifts. Presses anywhere else keep the text's native pan and selection.
   */
  function claimBoxTouch(event: PointerEvent) {
    const point = { x: event.pageX, y: event.pageY }
    if (releaseBoxTouch || boxAt(point) === -1) return
    const previousAction = textElement.style.touchAction
    const previousCallout = textElement.style.getPropertyValue("-webkit-touch-callout")
    textElement.style.touchAction = "none"
    textElement.style.setProperty("-webkit-touch-callout", "none")
    const suppress = (e: Event) => e.preventDefault()
    // `touch-action` alone can lose the race with the browser's scroll decision; a non-passive
    // touchmove cancel settles it: while the box owns the press, no pan or callout may start.
    textElement.addEventListener("touchmove", suppress, { passive: false })
    textElement.addEventListener("selectstart", suppress)
    textElement.addEventListener("contextmenu", suppress)
    const controller = new AbortController()
    let released = false
    const release = () => {
      if (released) return
      released = true
      releaseBoxTouch = undefined
      controller.abort()
      if (previousAction) textElement.style.touchAction = previousAction
      else textElement.style.removeProperty("touch-action")
      if (previousCallout) textElement.style.setProperty("-webkit-touch-callout", previousCallout)
      else textElement.style.removeProperty("-webkit-touch-callout")
      textElement.removeEventListener("touchmove", suppress)
      textElement.removeEventListener("selectstart", suppress)
      textElement.removeEventListener("contextmenu", suppress)
    }
    releaseBoxTouch = release
    // On window, not document: pointer.ts' steering release was registered earlier, so its captured
    // `touch-action` restore runs first and this release lands last.
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      addEventListener(type, (e) => (e as PointerEvent).pointerId === event.pointerId && release(), { signal: controller.signal })
    }
  }

  /** Index of the topmost box containing `point` (-1 if none). */
  function boxAt(point: Point) {
    if (!words.length) return -1
    return boxes.findLastIndex((box) =>
      targetRectsOf(box).some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom),
    )
  }

  /**
   * A box's page-space target: its words' line rects grown to a full line height tall, and on coarse
   * pointers to at least `TOUCH_TARGET_PX` wide so narrow or one-letter boxes stay reachable by finger.
   */
  function targetRectsOf(box: AttentionBox) {
    const coarse = isCoarsePointer()
    const reach = (coarse ? TOUCH_TARGET_PX : lineHeight) / 2
    return [...rangeOf(...spanOf(box, words.length)).getClientRects()].map((rect) => {
      const { left, right, top, height } = pageRect(rect)
      const xPad = coarse ? Math.max(0, (TOUCH_TARGET_PX - (right - left)) / 2) : 0
      const centerY = top + height / 2
      return { left: left - xPad, right: right + xPad, top: centerY - reach, bottom: centerY + reach }
    })
  }

  function paint() {
    const coverage = coverageOf(boxes, words.length)
    for (let level = 1; level <= SHADE_LEVELS; level++) {
      const ranges = runsAtLeast(coverage, level).map(([first, last]) => rangeOf(first, last))
      CSS.highlights.set(`attention-shade-${level}`, new Highlight(...ranges))
    }
    paintFocus()
    onPaint?.()
  }

  /** Underlines each keyword and links it to the knob, the active box's apart from the others. */
  function paintFocus() {
    const isActive = (box: AttentionBox) => box === active && boxes.includes(box)
    const keywords = (shown: AttentionBox[]) => new Highlight(...shown.map(({ keyword }) => rangeOf(keyword, keyword)))
    const others = boxes.filter((box) => !isActive(box))
    const focused = boxes.filter(isActive)
    CSS.highlights.set(KEYWORD_HIGHLIGHT, keywords(others))
    CSS.highlights.set(ACTIVE_KEYWORD_HIGHLIGHT, keywords(focused))
    linkPath.setAttribute("d", linksOf(others))
    activeLinkPath.setAttribute("d", linksOf(focused))
  }

  /** Links each keyword's underline end closer to the knob. */
  function linksOf(linked: AttentionBox[]) {
    const main = circleOf(knob)
    const nearerEnd = (ends: Point[]) => ends.reduce((nearer, end) => (distance(end, main.center) < distance(nearer, main.center) ? end : nearer))
    return pathOf(linked.map(({ keyword }) => linkBetween({ center: nearerEnd(underlineOf(keyword)), radius: 0 }, main)))
  }

  /** Underline ends of `word`, assuming `text-underline-position: under` puts it at the bottom of the text box. */
  function underlineOf(word: number): [Point, Point] {
    const { left, right, bottom } = pageRect(rangeOf(word, word).getBoundingClientRect())
    const y = bottom - parseFloat(getComputedStyle(linkPath).strokeWidth) / 2
    return [
      { x: left, y },
      { x: right, y },
    ]
  }

  function wordNear(point: Point) {
    if (!words.length || isPastEnd(point)) return
    wordRects ??= words.map((_, index) => pageRect(rangeOf(index, index).getBoundingClientRect()))
    return nearestIndex(wordRects, point)
  }

  function rangeOf(firstWord: number, lastWord: number) {
    const range = document.createRange()
    range.setStart(...domPointAt(textElement, words[firstWord].start))
    range.setEnd(...domPointAt(textElement, words[lastWord].end))
    return range
  }
}

export type BoxSpans = { phrase: Span; keyword: Span; isActive: boolean }

/** A box's session identity: the keyword's word text plus its flank counts. */
export type BoxState = { keyword: string; before: number; after: number }

/** `[first, last]` words of `box`, clipped to the text. */
function spanOf({ keyword, before, after }: AttentionBox, wordCount: number): [number, number] {
  return [Math.max(0, keyword - before), Math.min(wordCount - 1, keyword + after)]
}

/** Counts, per word, how many boxes include it. */
function coverageOf(boxes: AttentionBox[], wordCount: number) {
  const coverage = Array.from({ length: wordCount }, () => 0)
  for (const box of boxes) {
    const [first, last] = spanOf(box, wordCount)
    for (let i = first; i <= last; i++) coverage[i]++
  }
  return coverage
}

/** Contiguous `[first, last]` word runs covered at least `level` times. */
function runsAtLeast(coverage: number[], level: number) {
  const runs: [number, number][] = []
  coverage.forEach((count, i) => {
    if (count < level) return
    const run = runs.at(-1)
    if (run?.[1] === i - 1) run[1] = i
    else runs.push([i, i])
  })
  return runs
}

/** Prefers the nearest line, then the nearest word on that line, so gaps between lines and words still map to a word. */
function nearestIndex(rects: DOMRect[], point: Point) {
  const distance = (rect: DOMRect) => [gap(point.y, rect.top, rect.bottom), gap(point.x, rect.left, rect.right)]
  return rects.reduce((best, rect, i) => {
    const [dy, dx] = distance(rect)
    const [bestDy, bestDx] = distance(rects[best])
    return dy < bestDy || (dy === bestDy && dx < bestDx) ? i : best
  }, 0)
}

function gap(value: number, min: number, max: number) {
  return Math.max(min - value, 0, value - max)
}

function pointOf({ pageX, pageY }: MouseEvent): Point {
  return { x: pageX, y: pageY }
}

function pageRect({ x, y, width, height }: DOMRect) {
  return new DOMRect(x + scrollX, y + scrollY, width, height)
}
