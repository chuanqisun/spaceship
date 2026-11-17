import { stored, store } from "./storage.ts"

const HINT_KEY = "spaceship.hint-dismissed"
/** Auto-reveal paces the knob through the buffer at about this many words per second. */
const REVEAL_WPS = 90
/** How many words the reveal covers at most, so it never takes over the whole buffer. */
const REVEAL_WORDS = 140
/** The attract loop starts this long after the reveal ends. */
const ATTRACT_DELAY_MS = 6000
const ATTRACT_NUDGE_WORDS = 6
const ATTRACT_HALF_MS = 1100
/** The hint lingers this long after it appears before fading on its own. */
const HINT_LINGER_MS = 7000
const STEP_MS = 50

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches

type OnboardingOptions = {
  knob: HTMLElement
  /** Words the knob currently shows. */
  shownWords: () => number
  /** Words the stream holds in total. */
  bufferedWords: () => number
  /** Moves the knob `delta` words forward (negative rewinds). */
  nudge: (delta: number) => void
  /** Called once on the first real interaction. */
  onEngaged?: () => void
}

/**
 * Teaches the scrub on a first visit: the knob reveals buffered text by itself, a hint names the gestures,
 * and after a quiet spell the knob demonstrates a small back-and-forth. Any real input ends all of it for the
 * session; the first completed drag retires the hint forever.
 */
export function createOnboarding({ knob, shownWords, bufferedWords, nudge, onEngaged }: OnboardingOptions) {
  const hint = document.getElementById("hint") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "hint" }))
  hint.textContent = matchMedia("(pointer: coarse)").matches
    ? "drag to reveal · select text, tap box · hold knob for future"
    : "drag to reveal · ⌥-select to box · 2×click+hold for future"

  let isEngaged = false
  let isDestroyed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => (timers.delete(timer), fn()), ms)
    timers.add(timer)
  }

  // Session-only dismissal: the hint returns next visit until the user has actually dragged — any engagement alone doesn't prove they learned the gesture.
  const engage = () => {
    if (isEngaged) return
    isEngaged = true
    timers.forEach(clearTimeout)
    timers.clear()
    hideHint()
    onEngaged?.()
  }
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(type, engage, { capture: true, passive: true })

  function positionHint() {
    const rect = knob.getBoundingClientRect()
    // The hint is fixed-positioned, so its viewport bounds are the limit; clamp so it never hangs off an edge on narrow screens.
    const margin = 8
    const left = rect.left + rect.width / 2 - hint.offsetWidth / 2
    const top = rect.bottom + 10
    hint.style.left = `${Math.min(Math.max(margin, left), Math.max(margin, innerWidth - hint.offsetWidth - margin))}px`
    hint.style.top = `${Math.min(top, Math.max(margin, innerHeight - hint.offsetHeight - margin))}px`
  }

  function showHint() {
    if (stored(HINT_KEY) === "dismissed" || isEngaged) return
    positionHint()
    hint.dataset.show = ""
    addEventListener("resize", positionHint)
    later(hideHint, HINT_LINGER_MS)
  }

  function hideHint() {
    delete hint.dataset.show
    removeEventListener("resize", positionHint)
  }

  /** The first successful drag retires the hint forever. */
  function noteDrag() {
    if (stored(HINT_KEY) === "dismissed") return
    store(HINT_KEY, "dismissed")
    hideHint()
  }

  const pause = (ms: number) => new Promise<void>((resolve) => later(resolve, ms))

  async function reveal() {
    const target = Math.min(bufferedWords(), shownWords() + REVEAL_WORDS)
    // Reduced motion gets the destination at once rather than an animated scrub; the attract loop below skips it entirely.
    if (reducedMotion()) return nudge(target - shownWords())
    while (!isEngaged && shownWords() < target) {
      nudge(Math.min(Math.ceil((REVEAL_WPS * STEP_MS) / 1000), target - shownWords()))
      await pause(STEP_MS)
    }
  }

  async function attract() {
    while (!isEngaged && !reducedMotion() && !isDestroyed) {
      if (bufferedWords() - shownWords() <= ATTRACT_NUDGE_WORDS * 2) return
      nudge(ATTRACT_NUDGE_WORDS)
      await pause(ATTRACT_HALF_MS)
      if (isEngaged) return
      nudge(-ATTRACT_NUDGE_WORDS)
      await pause(ATTRACT_HALF_MS)
    }
  }

  return {
    /** Begins once the stream holds words; call after the first render. */
    async start() {
      while (!isEngaged && bufferedWords() === 0) await pause(120)
      if (isEngaged || isDestroyed) return
      await reveal()
      if (isEngaged || isDestroyed) return
      showHint()
      later(() => void attract(), ATTRACT_DELAY_MS)
    },
    noteDrag,
    isEngaged: () => isEngaged,
    destroy() {
      isDestroyed = true
      timers.forEach(clearTimeout)
      timers.clear()
      hint.remove()
    },
  }
}
