import { layoutNextLine, prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import "@fontsource-variable/jetbrains-mono/wght.css"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { createAttentionKnobs } from "./attention-knobs.ts"
import { caretAt, isAhead, pointAt, type Caret, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { createConnections } from "./connections.ts"
import { makeDraggable } from "./drag.ts"
import { createFutureKnobs } from "./future-knobs.ts"
import { createGhostText } from "./ghost-text.ts"
import { holdWindow, onPressAndHold } from "./hold.ts"
import { createKeyboard } from "./keyboard.ts"
import { createKeywordRelevance } from "./keyword-relevance.ts"
import { layoutLines, textWidth } from "./layout.ts"
import { createLeftRail } from "./left-rail.ts"
import { createLegend } from "./legend.ts"
import { circleOf } from "./links.ts"
import { liveAttention } from "./live-attention.ts"
import { liveSource } from "./live-completion.ts"
import { liveDimension } from "./live-dimension.ts"
import { liveInfluence } from "./live-influence.ts"
import { bindModeToggle } from "./live-mode.ts"
import { liveRealization } from "./live-realization.ts"
import { liveRelevance } from "./live-relevance.ts"
import { createOnboarding } from "./onboarding.ts"
import { isNarrowLayout } from "./breakpoints.ts"
import { createPointer, type Aim, type PointerTarget, type SelectionPreview, type Zone } from "./pointer.ts"
import { createSession } from "./session.ts"
import { wordSpans, type Span } from "./segments.ts"
import { simulatedAttention } from "./simulated-attention.ts"
import { simulatedDimension } from "./simulated-dimension.ts"
import { simulatedInfluence } from "./simulated-influence.ts"
import { simulatedRealization } from "./simulated-realization.ts"
import { simulatedRelevance } from "./simulated-relevance.ts"
import { isSoundOn, setSoundOn, startSound, type Sound } from "./sound/engine.ts"
import { sounds } from "./sound/sounds.ts"
import { createZoneCue } from "./zone-cue.ts"
import { showStatus } from "./status-line.ts"
import { storyLayoutOf, type StoryLayout } from "./story-layout.ts"
import { domPointAt, textOffsetOf } from "./text-offsets.ts"
import { createTextStream, type Steering } from "./text-stream.ts"
import { observeTrayHeight } from "./tray-height.ts"
import { createTouchControls } from "./touch-controls.ts"
import { guardTouchHold, onTouchTap, trackTouchPress } from "./touch.ts"
import { createViewportFollow } from "./viewport-follow.ts"
import { countWords, firstWords } from "./words.ts"

const DWELL_MS = 100
/** Generated words kept ready past the knob: whenever fewer remain, the stream continues the text, appending, never rewriting. */
const BUFFER_WORDS = 300
/** A top-up that adds no words (the source failed or said nothing) is retried after this long, doubling each time up to `MAX_RETRY_MS`. */
const RETRY_MS = 1000
const MAX_RETRY_MS = 16000
/** Double click and hold: the second press, if it starts within `DOUBLE_PRESS_MS` of the first and is held still, opens the fan menu after 100 ms plus this sweep (500 ms in all). */
const HOLD_MS = 400
const DOUBLE_PRESS_MS = 400
/** Between the rail and the text column. */
const RAIL_GAP_PX = 12
/** Drag speed, in px per ms, at which the word tick is softest. */
const DRAG_SPEED_FULL = 1.2
/** Tray controls sit flush with each other and the screen's bottom edge, so their brackets are drawn just inside them. */
const TRAY_PAD_PX = -1

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const statusElement = $("#status")
const soundToggle = $<HTMLButtonElement>("#sound-toggle")
const modeToggle = $<HTMLButtonElement>("#mode-toggle")
const extraLink = $<HTMLAnchorElement>("#extra-link")
const legendToggle = $<HTMLButtonElement>("#legend-toggle")
const legendDialog = $<HTMLDialogElement>("#legend")
const restoreChip = $<HTMLButtonElement>("#restore-chip")
const railElement = $("#rail")
const style = getComputedStyle(element)
await document.fonts.load(style.font)
/** Measures where the first hidden word on the caret's line starts, in the text's font. */
const measure = document.createElement("canvas").getContext("2d")!
measure.font = style.font

const isLive = new URLSearchParams(location.search).get("live") === "true"
const isRailVisible = () => !isNarrowLayout()
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
const rail = createLeftRail(railElement)
const connections = createConnections({ source: isLive ? liveInfluence : simulatedInfluence, onChange: refreshRail, isEnabled: isRailVisible })
const relevance = createKeywordRelevance(isLive ? liveRelevance : simulatedRelevance, refreshRail, isRailVisible)
const attention = createAttentionKnobs({
  source: isLive ? liveAttention : simulatedAttention,
  textElement: element,
  knob: handle,
  linkPath: $<SVGPathElement>("#attention-links"),
  activeLinkPath: $<SVGPathElement>("#attention-active-link"),
  isPastEnd: (point) => isAhead(caretAt(point, metricsOf()), caret),
  onChange: invalidateFuture,
  onHover: (phrase) => {
    connections.focusPhrase(phrase)
    refreshRail()
  },
  onPaint: refreshRail,
  onBoxTap: (keyword) => {
    statusNote = `box: ${keyword}`
    report()
  },
})
const futureKnobs = createFutureKnobs({
  template: $<HTMLTemplateElement>("#future-knob"),
  mainKnob: handle,
  linkPath: $<SVGPathElement>("#future-links"),
  tunedLinkPath: $<SVGPathElement>("#future-tuned-link"),
  hud: $<SVGGElement>("#future-hud"),
  source: isLive ? liveDimension : simulatedDimension,
  realization: isLive ? liveRealization : simulatedRealization,
  textElement: element,
  context: () => ({ text: shownText, leads: attention.leads() }),
  onChange: invalidateFuture,
})
let caret: Caret = { line: 0, x: 0 }
/** Page y of the last shown line's center, or the first line's while the text is empty. */
let readingY = 0
let shownText = ""
let story: StoryLayout = { content: "", text: "", combined: "", sentences: [] }
let railFrame: number | undefined
let shownCount: number | undefined
/** Words shown where the knob last rested, or where a drag back last discarded the text past it. */
let restCount = 0
let restTimer: number | undefined
/** A drag back discarded the text past the knob; it is generated again only once the knob rests, not at every word on the way. */
let isRegenerationHeld = false
let dwellTimer: number | undefined
/** Counts dwells, so requests deferred by an older one are dropped. */
let dwellCount = 0
let topUpTimer: number | undefined
let retryAt = 0
let retryMs = RETRY_MS
let isFutureStale = false
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined
let holdSound: Sound | undefined
/** Whether the current press opened the fan menu, so its double click does not also expand or collapse. */
let didHold = false
/** A transient status-line message, like the keyword a tapped attention box reported; shown by the next `report` and cleared by it. */
let statusNote: string | undefined
/** The previous drag point, for how fast the knob moves. */
let lastDrag: { point: Point; at: number } | undefined
/** The text a drag back discarded, restorable from the tray chip until it expires or the knob moves forward again; `caretWords` is where the knob rested before the scrub, so restore can return there. The snapshot is the buffer at the first discard of a scrub, so scrubbing back in stages still restores everything that was thrown away. */
let restoreTail: { words: number; caretWords: number; snapshot: string } | undefined
let restoreTimer: number | undefined
let didRestoreSession = false
/** Set once the reader moves the caret themselves; a session restore still waiting on generated words is abandoned. */
let sessionRestoreCancelled = false
/** Session restore waits for the stream to hold the saved caret's words; past this deadline it clamps to whatever arrived. */
const SESSION_RESTORE_DEADLINE_MS = 30000
let sessionRestoreDeadline: number | undefined
const viewportFollow = createViewportFollow(() => readingY)

const ghostText = createGhostText({ textElement: element })
observeTrayHeight($("#tray"))
createZoneCue({
  element: $("#zone-cue"),
  textElement: element,
  zoneAtPoint: (x, y) => {
    const target = document.elementFromPoint(x, y)
    return target ? zoneAt(target, x, y) : "other"
  },
})
const legend = createLegend({ dialog: legendDialog, toggle: legendToggle })
const session = createSession({
  snapshot: () => ({ caretWords: shownCount ?? 0, attention: attention.states(), future: futureKnobs.states() }),
})
const savedSession = session.load()
const onboarding = createOnboarding({
  knob: handle,
  shownWords: () => shownCount ?? 0,
  bufferedWords: () => countWords(stream.text),
  nudge,
})
createKeyboard({
  nudge: userNudge,
  toggleAttention: detachAllOrExpand,
  openLegend: legend.open,
  isEditing: () =>
    legendDialog.open ||
    $<HTMLDialogElement>("#live-keys").open ||
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement,
})
createTouchControls({
  nudge: userNudge,
  tick: sounds.word,
  toggleAttention: detachAllOrExpand,
  commitBox: attention.commitSelection,
  canCommitBox: attention.canCommitSelection,
})
// Long-press on gesture chrome must not raise the native callout or context menu.
for (const element of [$("#tray"), legendDialog, $("#live-keys")]) guardTouchHold(element)

bindModeToggle(modeToggle, $<HTMLDialogElement>("#live-keys"), isLive)
startSound()
showSoundToggle()
soundToggle.addEventListener("click", () => {
  setSoundOn(!isSoundOn())
  showSoundToggle()
})

handle.addEventListener("pointerenter", ({ buttons, pageX }) => buttons || sounds.knobHover(pageX))
/** The pointer type of the knob's last press: a synthesized dblclick from a touch double-tap must not toggle, taps already handle it. */
let knobPointer = "mouse"
handle.addEventListener("pointerdown", ({ pageX, pointerType }) => {
  didHold = false
  knobPointer = pointerType
  sounds.knobGrab(pageX)
  // A press that follows a tap is a new gesture: it must not let the tap's expand timer fire mid-hold.
  if (pendingTap !== undefined) {
    clearTimeout(pendingTap)
    pendingTap = undefined
  }
})
// A quick double click expands or collapses; one whose second press was held opened the fan menu instead.
handle.addEventListener("dblclick", () => {
  if (knobPointer === "touch") return (didHold = false)
  didHold ? (didHold = false) : detachAllOrExpand()
})
guardTouchHold(handle)
trackTouchPress(handle)
// Touch has no double click: a single tap toggles, and a second tap soon after cancels both so a double tap stays harmless.
// Pairing is judged by when the second press began: its pointerdown already cleared the armed timer, so a
// slow second tap can't re-arm and toggle once more.
let pendingTap: number | undefined
/** When the last tap armed its expand timer; a following press clears the timer early, so taps pair up on this instead. */
let tapArmedAt = -Infinity
onTouchTap(handle, (_point, tap) => {
  if (didHold) {
    didHold = false
    return
  }
  if (tap.at - tapArmedAt <= 300) {
    tapArmedAt = -Infinity
    return
  }
  tapArmedAt = performance.now()
  pendingTap = window.setTimeout(() => {
    pendingTap = undefined
    tapArmedAt = -Infinity
    detachAllOrExpand()
  }, 300)
})
onPressAndHold(
  handle,
  HOLD_MS,
  ({ pageX, pageY, pointerId }) => {
    didHold = true
    futureKnobs.spawn({ x: pageX, y: pageY }, pointerId)
  },
  {
    onSweep: () => (holdSound = sounds.holdSweep(circleOf(handle).center.x, HOLD_MS / 1000)),
    onSweepEnd: (completed) => completed || holdSound?.stop(),
    // Touch holds on a single press; mouse and pen keep the double-press gate.
    secondPressWithin: (event) => holdWindow(event.pointerType, DOUBLE_PRESS_MS),
  },
)
// Dragging scrubs at once, forward or back.
makeDraggable(handle, {
  onDrag: (point) => {
    handle.toggleAttribute("data-dragging", true)
    cancelSessionRestore()
    const before = shownCount
    moveTo(point)
    discardIfBehindRest()
    soundWordsCrossed(before, point)
    onboarding.noteDrag()
  },
  onDrop: () => {
    if (handle.hasAttribute("data-dragging")) sounds.knobRelease(circleOf(handle).center.x)
    handle.removeAttribute("data-dragging")
    lastDrag = undefined
  },
})

createPointer({
  layer: $("#cursor"),
  targets: pointerTargets,
  isDragging: () => handle.hasAttribute("data-dragging") || document.querySelector(".future[data-dragging]") !== null || attention.isDragging(),
  zoneAt,
  caretAt: caretBoxAt,
  selection: selectionPreview,
  aim: aimAt,
  pull: pullToward,
  steerReadout: $("#steer-readout"),
})

// Reflow changes where words land, so re-anchor by word count: the same words stay shown rather than the same geometric caret.
addEventListener("resize", () => {
  const next = caretAfterWords(shownCount ?? restCount)
  moveTo(next ? pointAt(next, metricsOf()) : pointAt(caret, metricsOf()))
})
moveTo(pointAt(caret, metricsOf()))
// A saved session means a returning reader; the first-run theatre is only for fresh visits.
if (!savedSession?.caretWords) void onboarding.start()

/** Moves the knob `delta` words along the reading order, clamped to the generated text, and returns how many words it actually moved; used by the keyboard, onboarding and touch controls. */
function nudge(delta: number) {
  const before = shownCount ?? 0
  const target = Math.max(0, Math.min(countWords(stream.text), before + delta))
  const next = caretAfterWords(target)
  if (next) moveTo(pointAt(next, metricsOf()))
  return (shownCount ?? 0) - before
}

/** The reader took over the caret, so a session restore still waiting on generated words is abandoned. */
function cancelSessionRestore() {
  sessionRestoreCancelled = true
}

/** `nudge` for real input — keyboard and touch controls; onboarding's scripted nudges don't count as taking over. */
function userNudge(delta: number) {
  cancelSessionRestore()
  return nudge(delta)
}

/** Once the stream holds the saved caret's words, restores the session: caret position, attention boxes, future knobs. */
function restoreSession() {
  if (!savedSession || didRestoreSession || sessionRestoreCancelled) return
  const available = countWords(stream.text)
  sessionRestoreDeadline ??= performance.now() + SESSION_RESTORE_DEADLINE_MS
  if (available < savedSession.caretWords && performance.now() < sessionRestoreDeadline) return
  didRestoreSession = true
  const next = caretAfterWords(Math.min(savedSession.caretWords, available))
  if (next) moveTo(pointAt(next, metricsOf()))
  attention.restore(savedSession.attention)
  void futureKnobs.restore(savedSession.future)
}

/** The knob stops at the column's right edge, as no line reaches past it. */
function moveTo({ x, y }: Point) {
  const { left, width } = element.getBoundingClientRect()
  const point = { x: Math.min(x, left + scrollX + width), y }
  caret = caretAt(point, metricsOf())
  const half = handle.offsetWidth / 2
  const visible = {
    x: Math.min(Math.max(point.x, scrollX + half), scrollX + innerWidth - half),
    y: point.y,
  }
  handle.style.translate = centeredAt(visible, handle.offsetWidth)
  // The knob is clamped inside the viewport at the column's edges; the pip still marks the caret itself.
  handle.style.setProperty("--caret-dx", `${point.x - visible.x}px`)
  render()
  restartRest()
}

/** The knob rests once it has not moved for `DWELL_MS`; the text past it is then generated again if a drag back discarded it. */
function restartRest() {
  clearTimeout(restTimer)
  restTimer = setTimeout(() => {
    // A stalled pointer can leave this armed mid-drag; resting early would release the regeneration
    // hold and rebase `restCount` on a transient count, so wait for the drop instead.
    if (handle.hasAttribute("data-dragging")) return restartRest()
    // Only a rested caret forward of the discard point drops the offer; mid-drag counts can jitter with reflow.
    if (restoreTail && (shownCount ?? 0) > restoreTail.words) clearRestore()
    restCount = shownCount ?? 0
    isRegenerationHeld = false
    session.save()
    topUp()
  }, DWELL_MS)
}

/** Dragging back far enough to hide the word the knob rested on means the reader wants another continuation, so the text past the knob is discarded at once — but kept restorable from the tray chip until it expires. */
function discardIfBehindRest() {
  const count = shownCount ?? 0
  if (count >= restCount) return
  if (!restoreTail) restoreTail = { words: count, caretWords: restCount, snapshot: stream.text }
  else restoreTail.words = count
  stream.truncate(count)
  restCount = count
  isRegenerationHeld = true
  showRestoreChip()
}

/** The restore chip lives this long after a scrub-back: long enough to notice, short enough not to nag. */
const RESTORE_MS = 10000

/** The discarded tail as `stream.restore` takes it: everything in the snapshot past the kept words. */
function restoreBuffer() {
  if (!restoreTail) return
  const kept = firstWords(restoreTail.snapshot, restoreTail.words)
  return { words: restoreTail.words, text: restoreTail.snapshot.slice(kept.length) }
}

function showRestoreChip() {
  clearTimeout(restoreTimer)
  restoreChip.textContent = `↩ ${countWords(restoreBuffer()!.text)}w`
  restoreChip.hidden = false
  restoreTimer = setTimeout(clearRestore, RESTORE_MS)
}

function clearRestore() {
  clearTimeout(restoreTimer)
  restoreTimer = undefined
  restoreTail = undefined
  restoreChip.hidden = true
}

restoreChip.addEventListener("click", () => {
  cancelSessionRestore()
  const tail = restoreBuffer()
  if (!tail || !stream.restore(tail)) return
  const back = caretAfterWords(Math.min(restoreTail!.caretWords, countWords(stream.text)))
  if (back) moveTo(pointAt(back, metricsOf()))
  clearRestore()
})

function detachAllOrExpand() {
  if (!attention.isExpanded() && !futureKnobs.count()) return revealAttention()
  sounds.collapse(circleOf(handle).center.x)
  attention.collapse()
  futureKnobs.clear()
}

/** The continuation generated alongside the prefetched boxes was not led by them, so it is replaced as soon as they are all shown. */
async function revealAttention() {
  await attention.expand()
  regenerateFuture()
  afterStreaming(futureKnobs.preload)
}

function render() {
  const bounds = element.getBoundingClientRect()
  /** Unrounded, unlike `clientWidth`: a line that fills the column exactly measures a hair wider than the rounded width. */
  const lines = layoutLines(prepareWords(), caret, bounds.width)
  const text = lines.join(" ")
  const count = countWords(text)
  const previousReadingY = readingY
  const textTop = bounds.top + scrollY + parseFloat(style.paddingTop)
  readingY = textTop + (Math.max(lines.length, 1) - 0.5) * parseFloat(style.lineHeight)

  if (count !== shownCount) restartDwell()
  shownCount = count
  scheduleTopUp()
  story = storyLayoutOf(lines, stream.text)
  const first = element.firstChild
  if (!(first instanceof Text) || first.data !== story.content) element.textContent = story.content
  ghostText.update(story.combined.slice(story.text.length))
  connections.update(story)
  shownText = text
  attention.update(text)
  futureKnobs.follow(story)
  if (!didRestoreSession && savedSession && countWords(stream.text) > 0) restoreSession()
  if (readingY !== previousReadingY) viewportFollow.follow()
  report()
}

/** The text after the knob was steered by the previous boxes and future knobs, so it is regenerated once they settle. */
function invalidateFuture() {
  refreshRail()
  isFutureStale = true
  restartDwell()
  session.save()
  report()
}

/** Shows whether the model is generating and how full the buffer past the knob is, on the knob and in the status line, with what the text holds and is steered by. */
function report() {
  const activity = stream.activity()
  const buffer = Math.max(0, countWords(stream.text) - (shownCount ?? 0))
  handle.toggleAttribute("data-generating", activity.isGenerating)
  handle.style.setProperty("--buffer", `${Math.min(1, buffer / BUFFER_WORDS)}`)
  const note = statusNote
  statusNote = undefined
  showStatus(statusElement, {
    ...activity,
    words: shownCount ?? 0,
    buffer,
    boxes: attention.leads().length,
    steering: futureKnobs.controls().length,
    pinned: futureKnobs.pinnedCount(),
    note,
  })
}

function restartDwell() {
  clearTimeout(dwellTimer)
  const dwell = ++dwellCount
  dwellTimer = setTimeout(() => {
    if (isFutureStale) regenerateFuture()
    else topUp()
    afterStreaming(() => {
      if (dwell !== dwellCount) return
      attention.prefetch()
      futureKnobs.preload()
    })
  }, DWELL_MS)
}

/**
 * Runs `request` once the continuation is streaming. Keyword highlights and future knob menus share the text API's rate limit,
 * and the continuation is what the reader waits for, so it is always asked first.
 */
function afterStreaming(request: () => void) {
  stream.streaming().then(request)
}

function regenerateFuture() {
  isFutureStale = false
  restCount = shownCount ?? 0
  stream.regenerate(shownCount ?? 0, "steering changed", steering())
}

function steering(): Steering {
  return { leads: attention.leads(), controls: futureKnobs.controls() }
}

/**
 * Keeps at least `BUFFER_WORDS` generated words past the knob, continuing the text from its end whenever fewer remain.
 * Asked after every change, but run on the next task, after a finished generation has reported how it went.
 */
function scheduleTopUp() {
  topUpTimer ??= setTimeout(() => {
    topUpTimer = undefined
    topUp()
  })
}

function topUp() {
  if (isRegenerationHeld || stream.activity().isGenerating || performance.now() < retryAt) return
  const words = countWords(stream.text)
  if (words - (shownCount ?? 0) >= BUFFER_WORDS) return
  stream.generate("buffer low", steering()).then(
    (outcome) => outcome === "done" && settleTopUp(words),
    (error) => (console.error(error), settleTopUp(words)),
  )
}

/** A top-up that added words resets the retry delay; one that added none waits before trying again, longer each time. */
function settleTopUp(wordsBefore: number) {
  if (countWords(stream.text) > wordsBefore) {
    retryMs = RETRY_MS
    retryAt = 0
    return scheduleTopUp()
  }
  retryAt = performance.now() + retryMs
  setTimeout(scheduleTopUp, retryMs)
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
}

function prepareWords() {
  const text = stream.text
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) }
  return prepared.layout
}

/** What the pointer frames as the hand nears it: the main knob (labelled with its word count), each future knob, each attention box line by line (labelled with its relevance), and the tray's toggles and extra link. */
function pointerTargets(): PointerTarget[] {
  const leads = attention.leads()
  return [
    { rects: [handle.getBoundingClientRect()], pad: 5, wake: handle, label: () => [strong(shownCount ?? 0), " words"] },
    ...[...document.querySelectorAll<HTMLElement>(".future")].map((knob) => ({ rects: [knob.getBoundingClientRect()], pad: 5 })),
    ...attention.spans().map(({ phrase }, i) => ({
      rects: clientRectsOf(phrase),
      pad: 3,
      label: () => {
        const { relevance: value, isMeasuring } = relevance.relevanceOf(leads[i])
        if (isMeasuring) return ["box ", strong("··")]
        if (value === undefined) return ["box"]
        return ["box ", strong(value >= 1 ? "1.0" : value.toFixed(2).replace(/^0/, ""))]
      },
    })),
    { rects: [modeToggle.getBoundingClientRect()], pad: TRAY_PAD_PX, isHotOnHover: true, wake: modeToggle },
    { rects: [soundToggle.getBoundingClientRect()], pad: TRAY_PAD_PX, isHotOnHover: true, wake: soundToggle },
    { rects: [extraLink.getBoundingClientRect()], pad: TRAY_PAD_PX, isHotOnHover: true, wake: extraLink },
  ]
}

const strong = (text: string | number) => Object.assign(document.createElement("b"), { textContent: String(text) })

/** The viewport boxes of a span of the shown text, one per line it covers. */
function clientRectsOf({ start, end }: Span) {
  const range = document.createRange()
  range.setStart(...domPointAt(element, start))
  range.setEnd(...domPointAt(element, end))
  return [...range.getClientRects()].filter(({ width }) => width > 0)
}

/**
 * What lies under the viewport point: knobs, controls, the tray and dialogs have gestures of their own; past the main knob there is no text yet,
 * so the page there is where a press steers; before it, the shown text selects, except an attention box, which drags.
 */
function zoneAt(target: Element, x: number, y: number): Zone {
  const point = { x: x + scrollX, y: y + scrollY }
  if (attention.isDragging()) return "box"
  if (target.closest(".knob, button, a, #tray, dialog")) return "other"
  if (isAhead(caretAt(point, metricsOf()), caret)) return "ahead"
  if (!target.closest("#text")) return "other"
  return attention.isOverBox(point) ? "box" : "text"
}

/** The caret between characters nearest the viewport point, line-high, while over the shown text. */
function caretBoxAt(x: number, y: number) {
  const position = document.caretPositionFromPoint(x, y)
  if (!position || !element.contains(position.offsetNode)) return
  return caretBoxOf(position.offsetNode, position.offset)
}

/** A line-high box at zero width where the caret before character `offset` of `node` sits. */
function caretBoxOf(node: Node, offset: number) {
  const range = document.createRange()
  range.setStart(node, offset)
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  const { top } = element.getBoundingClientRect()
  const lineHeight = parseFloat(style.lineHeight)
  const textTop = top + parseFloat(style.paddingTop)
  const line = Math.floor((rect.top + rect.height / 2 - textTop) / lineHeight)
  return new DOMRect(rect.left, textTop + line * lineHeight, 0, lineHeight)
}

/** While a selection is made in the text: carets at its ends, and the whole words it will become as a box (as the attention box from a selection rounds it). */
function selectionPreview(): SelectionPreview | undefined {
  const selection = getSelection()
  if (!selection?.rangeCount || selection.isCollapsed || !selection.anchorNode || !selection.focusNode || !element.contains(selection.anchorNode)) return
  const range = selection.getRangeAt(0)
  const start = textOffsetOf(element, range.startContainer, range.startOffset)
  const end = textOffsetOf(element, range.endContainer, range.endOffset)
  const words = wordSpans(shownText)
  const first = words.findIndex((word) => word.end > start)
  const last = words.findLastIndex((word) => word.start < end)
  return {
    anchor: caretBoxOf(selection.anchorNode, selection.anchorOffset),
    focus: caretBoxOf(selection.focusNode, selection.focusOffset),
    words: first === -1 || last < first ? [] : clientRectsOf({ start: words[first].start, end: words[last].end }),
  }
}

/** Where the main knob would stop for the viewport point `x`, `y`: how many words ahead (or behind) that is, and the box of the last word it shows now. */
function aimAt(x: number, y: number): Aim {
  const width = element.getBoundingClientRect().width
  const target = caretAt({ x: x + scrollX, y: y + scrollY }, metricsOf())
  const lines = layoutLines(prepareWords(), { line: target.line, x: Math.min(target.x, width) }, width)
  const knob = handle.getBoundingClientRect()
  return {
    gap: countWords(lines.join(" ")) - (shownCount ?? 0),
    tip: tipRect(),
    knob: { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 },
  }
}

/** The viewport box of the last word the main knob shows. */
function tipRect() {
  const caret = caretAfterWords(shownCount ?? 0)
  return caret && lastWordRect(layoutLines(prepareWords(), caret, element.getBoundingClientRect().width))
}

/** The viewport box of the last word of `lines`, laid out in the column. */
function lastWordRect(lines: string[]) {
  const index = lines.findLastIndex((line) => line.trim())
  if (index === -1) return
  const line = lines[index].trimEnd()
  const word = line.slice(line.lastIndexOf(" ") + 1)
  const { left, top } = element.getBoundingClientRect()
  const lineHeight = parseFloat(style.lineHeight)
  const x = left + measure.measureText(line.slice(0, line.length - word.length)).width
  return new DOMRect(x, top + parseFloat(style.paddingTop) + index * lineHeight, measure.measureText(word).width, lineHeight)
}

/** Steering: moves the main knob `words` further along the reading order, as if dragged there, ticking once per word. */
function pullToward(_x: number, _y: number, words: number) {
  cancelSessionRestore()
  const next = caretAfterWords((shownCount ?? 0) + words)
  if (!next) return
  const before = shownCount
  const point = pointAt(next, metricsOf())
  moveTo(point)
  soundWordsCrossed(before, point)
}

/** The caret that shows exactly `count` words, or undefined while the text holds fewer. */
function caretAfterWords(count: number): Caret | undefined {
  const width = element.getBoundingClientRect().width
  const layout = prepareWords()
  let cursor
  let seen = 0
  for (let line = 0; ; line++) {
    const next = layoutNextLine(layout, width, cursor)
    if (!next) return
    const words = countWords(next.text)
    if (seen + words >= count) return { line, x: Math.min(width, textWidth(firstWords(next.text, count - seen), style.font)) }
    seen += words
    cursor = next.end
  }
}

/** Redraws the rail beside the text once per frame, however many changes ask for it. */
function refreshRail() {
  railFrame ??= requestAnimationFrame(() => {
    railFrame = undefined
    const leads = attention.leads()
    relevance.update(story, leads)
    if (isNarrowLayout()) return
    const { left, top } = element.getBoundingClientRect()
    // The rail's page x can go negative where the column sits near the left edge; keep it inside the document.
    const railX = Math.min(
      Math.max(0, left + scrollX - railElement.offsetWidth - RAIL_GAP_PX),
      Math.max(0, document.documentElement.clientWidth - railElement.offsetWidth),
    )
    railElement.style.translate = `${railX}px ${top + scrollY + parseFloat(style.paddingTop)}px`
    rail.show({
      lines: lineSpansOf(story.content),
      boxes: attention.spans().map((spans, i) => ({ ...spans, ...relevance.relevanceOf(leads[i]) })),
      connection: connections.current(),
    })
  })
}

/** Each line's span of the text, where lines are joined by single spaces. */
function lineSpansOf(content: string): Span[] {
  let start = 0
  return content.split("\n").map((line) => {
    const span = { start, end: start + line.length }
    start = span.end + 1
    return span
  })
}

/** Ticks once per word the dragged knob reveals or removes; words arriving from the generator are silent. */
function soundWordsCrossed(before: number | undefined, point: Point) {
  const now = performance.now()
  const speed = lastDrag ? Math.hypot(point.x - lastDrag.point.x, point.y - lastDrag.point.y) / Math.max(1, now - lastDrag.at) / DRAG_SPEED_FULL : 0
  lastDrag = { point, at: now }
  if (before !== undefined && shownCount !== undefined && shownCount !== before)
    sounds.word(Math.sign(shownCount - before), Math.abs(shownCount - before), speed, point.x)
}

function showSoundToggle() {
  const isOn = isSoundOn()
  soundToggle.setAttribute("aria-pressed", `${isOn}`)
  soundToggle.querySelector("b")!.textContent = isOn ? "on" : "off"
}

/** Read on every use, since the centered column moves with the window. */
function metricsOf(): TextMetrics {
  const { left, top } = element.getBoundingClientRect()
  return { left: left + scrollX, top: top + scrollY + parseFloat(style.paddingTop), lineHeight: parseFloat(style.lineHeight) }
}
