import { layoutNextLine, prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import type { Provider, ProviderId } from "../llm/provider.ts"
import { caretAt, pointAt, type Caret, type TextMetrics } from "../text/caret.ts"
import { makeDraggable } from "../text/drag.ts"
import { layoutLines, textWidth } from "../text/layout.ts"
import type { Point } from "../point.ts"
import { createTextStream, type GenerationOutcome, type Steering, type StreamActivity, type TextSource } from "../text/text-stream.ts"
import { countWords, firstWords } from "../text/words.ts"
import type { ArenaOpening } from "./opening.ts"
import { createStorySource } from "./story-source.ts"

/** Generated words kept ready past the caret knob: the knob rests this far behind the stream's end. */
const BUFFER_WORDS = 60
/** A top-up that adds no words is retried after this long, doubling each time up to `MAX_RETRY_MS`. */
const RETRY_MS = 1000
const MAX_RETRY_MS = 16000

export type PaneConfig = {
  slot: number
  provider: ProviderId
  model: string
  focused?: boolean
}

export type PaneDeps = {
  providers: Readonly<Partial<Record<ProviderId, Provider>>>
  opening: ArenaOpening
  onRemove?: (slot: number) => void
  onFocus?: (slot: number) => void
}

export type Pane = {
  readonly slot: number
  readonly config: PaneConfig
  setModel(provider: ProviderId, model: string): void
  steer(steering: Steering): void
  regenerate(): void
  activity(): StreamActivity
  destroy(): void
}

export type PaneSessionHooks = {
  onChange?: () => void
  /** Called with the failure, or `undefined` once a generation completes cleanly. */
  onError?: (error: unknown) => void
}

export type PaneSession = {
  readonly text: () => string
  readonly wordCount: () => number
  /** Where the caret knob rests, in words from the start of the generated text. */
  readonly caret: () => number
  readonly activity: () => StreamActivity
  beginScrub(): void
  scrubTo(words: number): void
  endScrub(): void
  steer(steering: Steering): void
  regenerate(): void
  setSource(source: TextSource): void
  destroy(): void
}

type AttemptOutcome = GenerationOutcome | "failed"

/**
 * The DOM-free core of a pane: owns the `createTextStream`, the caret position and the top-up loop.
 * The caret chases the stream's end `BUFFER_WORDS` behind, so a steer or scrub always has generated text past it to regenerate.
 */
export function createPaneSession(source: TextSource, { onChange = () => {}, onError = () => {} }: PaneSessionHooks = {}): PaneSession {
  let stream = createTextStream(source, changed)
  let steering: Steering = { leads: [], controls: [] }
  let caret = 0
  /** True while the knob is dragged: the caret stays where the pointer put it instead of chasing the stream. */
  let held = false
  let scrubStart = 0
  let destroyed = false
  let topUpTimer: number | undefined
  let retryAt = 0
  let retryMs = RETRY_MS

  const session: PaneSession = {
    text: () => stream.text,
    wordCount: () => countWords(stream.text),
    caret: () => caret,
    activity: () => stream.activity(),
    beginScrub,
    scrubTo,
    endScrub,
    steer,
    regenerate,
    setSource,
    destroy,
  }
  scheduleTopUp()
  return session

  function changed() {
    if (destroyed) return
    const total = countWords(stream.text)
    if (!held) caret = Math.min(total, Math.max(caret, total - BUFFER_WORDS))
    scheduleTopUp()
    onChange()
  }

  function beginScrub() {
    if (destroyed) return
    held = true
    scrubStart = caret
  }

  function scrubTo(words: number) {
    if (destroyed) return
    caret = Math.max(0, Math.min(words, countWords(stream.text)))
    onChange()
  }

  /** A scrub that landed behind where it started discards the text past the caret and generates it again; a forward scrub only moves the knob. */
  function endScrub() {
    if (destroyed) return
    held = false
    if (caret < scrubStart) void regenerateFromCaret()
    else scheduleTopUp()
  }

  function steer(next: Steering) {
    if (destroyed) return
    steering = next
    if (countWords(stream.text) > caret) void regenerateFromCaret()
  }

  function regenerate() {
    if (destroyed) return
    if (countWords(stream.text) > caret) void regenerateFromCaret()
    else scheduleTopUp()
  }

  function regenerateFromCaret() {
    return attempt(() => stream.regenerate(caret, "steering changed", steering))
  }

  function setSource(next: TextSource) {
    if (destroyed) return
    stream.truncate(0)
    stream = createTextStream(next, changed)
    caret = 0
    scheduleTopUp()
    changed()
  }

  function destroy() {
    destroyed = true
    clearTimeout(topUpTimer)
    stream.truncate(0)
  }

  function scheduleTopUp() {
    topUpTimer ??= setTimeout(() => {
      topUpTimer = undefined
      void topUp()
    }, 0)
  }

  /** Keeps at least `BUFFER_WORDS` generated words past the caret, continuing the text from its end whenever fewer remain. */
  async function topUp() {
    if (destroyed || held || stream.activity().isGenerating || performance.now() < retryAt) return
    const before = countWords(stream.text)
    if (before - caret >= BUFFER_WORDS) return
    const outcome = await attempt(() => stream.generate("buffer low", steering))
    settleTopUp(outcome, before)
  }

  /** Runs a stream operation, reporting a rejection through `onError` instead of letting it escape. */
  async function attempt(run: () => Promise<GenerationOutcome>): Promise<AttemptOutcome> {
    try {
      const outcome = await run()
      if (outcome === "done") onError(undefined)
      return outcome
    } catch (error) {
      onError(error)
      return "failed"
    }
  }

  /** A top-up that added words resets the retry delay; one that added none waits before trying again, longer each time. */
  function settleTopUp(outcome: AttemptOutcome, before: number) {
    if (outcome === "done" || countWords(stream.text) > before) {
      retryMs = RETRY_MS
      retryAt = 0
      return scheduleTopUp()
    }
    retryAt = performance.now() + retryMs
    setTimeout(scheduleTopUp, retryMs)
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
  }
}

/**
 * One comparison pane inside the `<section class="pane">` subtree: label, status, text, error slot, caret knob, remove button.
 * The knob marks the caret in the generated text; dragging it back and releasing regenerates this pane's continuation from there.
 */
export function createPane(root: HTMLElement, config: PaneConfig, deps: PaneDeps): Pane {
  const text = root.querySelector<HTMLElement>(".pane-text")!
  const label = root.querySelector<HTMLElement>(".pane-label")!
  const status = root.querySelector<HTMLElement>(".pane-status")!
  const error = root.querySelector<HTMLElement>(".pane-error")!
  const knob = root.querySelector<HTMLButtonElement>(".knob")!
  const remove = root.querySelector<HTMLButtonElement>(".pane-remove")!
  const style = getComputedStyle(text)
  let current = config
  let prepared: { text: string; layout: PreparedTextWithSegments } | undefined
  let destroyed = false

  const session = createPaneSession(sourceFor(current), {
    onChange: render,
    onError: (failure) => {
      error.textContent = failure === undefined ? "" : failure instanceof Error ? failure.message : String(failure)
    },
  })

  label.textContent = modelLabel(current)
  makeDraggable(knob, {
    onStart: () => {
      session.beginScrub()
      return true
    },
    onDrag: (point) => session.scrubTo(wordsAtPoint(point)),
    onDrop: () => session.endScrub(),
  })
  remove.addEventListener("click", () => deps.onRemove?.(current.slot))
  root.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, dialog")) return
    deps.onFocus?.(current.slot)
  })
  render()

  return {
    slot: current.slot,
    get config() {
      return current
    },
    setModel,
    steer: (steering) => session.steer(steering),
    regenerate: () => session.regenerate(),
    activity: () => session.activity(),
    destroy() {
      destroyed = true
      session.destroy()
    },
  }

  function sourceFor({ provider, model }: PaneConfig) {
    const found = deps.providers[provider] ?? deps.providers.sim
    if (!found) throw new Error(`no provider registered for "${provider}"`)
    return createStorySource(found, model, deps.opening)
  }

  function modelLabel({ provider, model }: PaneConfig) {
    const name = deps.providers[provider]?.name ?? provider
    return `${name} · ${model}`
  }

  function setModel(provider: ProviderId, model: string) {
    if (destroyed || !deps.providers[provider]) return
    current = { ...current, provider, model }
    label.textContent = modelLabel(current)
    session.setSource(sourceFor(current))
  }

  function render() {
    if (destroyed) return
    const content = session.text()
    if (text.textContent !== content) text.textContent = content
    positionKnob()
    scrollCaretIntoView()
    renderStatus()
  }

  function renderStatus() {
    const activity = session.activity()
    const parts = [`${session.wordCount()}w`]
    if (activity.wordsPerSecond !== undefined) parts.push(`${activity.wordsPerSecond.toFixed(1)}w/s`)
    if (activity.firstChunkMs !== undefined) parts.push(`${Math.round(activity.firstChunkMs)}ms`)
    status.textContent = parts.join(" · ")
    status.toggleAttribute("data-generating", activity.isGenerating)
  }

  function layout() {
    const content = session.text()
    if (prepared?.text !== content) prepared = { text: content, layout: prepareWithSegments(content, style.font) }
    return prepared.layout
  }

  function columnWidth() {
    return text.getBoundingClientRect().width
  }

  /** Page-space metrics of the text column's first line, like the flagship's `metricsOf`, adjusted for the column's own scroll. */
  function metrics(): TextMetrics {
    const rect = text.getBoundingClientRect()
    return {
      left: rect.left + scrollX,
      top: rect.top + scrollY - text.scrollTop + parseFloat(style.paddingTop),
      lineHeight: parseFloat(style.lineHeight),
    }
  }

  /** The caret showing exactly `count` words of the generated text. */
  function caretForWords(count: number): Caret {
    const width = columnWidth()
    if (!(width > 0)) return { line: 0, x: 0 }
    const font = style.font
    let cursor
    let seen = 0
    for (let line = 0; ; line++) {
      const next = layoutNextLine(layout(), width, cursor)
      if (!next) return line === 0 ? { line: 0, x: 0 } : { line: line - 1, x: width }
      const words = countWords(next.text)
      if (seen + words >= count) {
        return { line, x: Math.min(width, textWidth(firstWords(next.text, count - seen), font)) }
      }
      seen += words
      cursor = next.end
    }
  }

  /** How many words of the generated text the viewport point `point` reaches. */
  function wordsAtPoint(point: Point) {
    const width = columnWidth()
    if (!(width > 0)) return session.wordCount()
    const caret = caretAt(point, metrics())
    const lines = layoutLines(layout(), { line: caret.line, x: Math.max(0, Math.min(caret.x, width)) }, width)
    return countWords(lines.join(" "))
  }

  function positionKnob() {
    const point = pointAt(caretForWords(session.caret()), metrics())
    const paneRect = root.getBoundingClientRect()
    const size = knob.offsetWidth
    const x = Math.min(Math.max(point.x - paneRect.left - scrollX - size / 2, 0), Math.max(0, paneRect.width - size))
    const y = Math.min(Math.max(point.y - paneRect.top - scrollY - size / 2, 0), Math.max(0, paneRect.height - size))
    knob.style.transform = `translate(${x}px, ${y}px)`
  }

  /** Keeps the caret line near the bottom of the column so the knob stays visible as the text grows. */
  function scrollCaretIntoView() {
    const point = pointAt(caretForWords(session.caret()), metrics())
    const caretViewportY = point.y - (text.getBoundingClientRect().top + scrollY)
    const target = text.scrollTop + caretViewportY - text.clientHeight + parseFloat(style.lineHeight) * 3
    text.scrollTop = Math.max(0, target)
  }
}
