import { storeJson, storedJson } from "./storage.ts"

const SESSION_KEY = "spaceship.session"
/** A session older than this is treated as abandoned: the story it steered is long gone. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 500

/** One attention box, identified by its keyword's word so it survives regeneration. */
export type BoxState = { keyword: string; before: number; after: number }

/** One future knob's setting, identified by its dimension's name. */
export type FutureState = { dimension: string; position: number; strength: number }

export type SessionState = {
  version: 1
  caretWords: number
  attention: BoxState[]
  future: FutureState[]
  savedAt: number
}

type SessionOptions = {
  snapshot: () => Omit<SessionState, "version" | "savedAt">
  now?: () => number
}

/**
 * Persists steering state — where the knob rests, which words are boxed, which dimensions are tuned —
 * so a reload resumes the session. The generated text itself is not stored; it regenerates.
 */
export function createSession({ snapshot, now = Date.now }: SessionOptions) {
  let timer: number | undefined

  function save() {
    clearTimeout(timer)
    timer = setTimeout(() => storeJson(SESSION_KEY, { version: 1, ...snapshot(), savedAt: now() } satisfies SessionState), SAVE_DEBOUNCE_MS)
  }

  function load(): SessionState | undefined {
    const state = storedJson<SessionState>(SESSION_KEY)
    if (!state || state.version !== 1 || typeof state.savedAt !== "number" || now() - state.savedAt > SESSION_TTL_MS) return
    if (typeof state.caretWords !== "number" || !Array.isArray(state.attention) || !Array.isArray(state.future)) return
    return state
  }

  function clear() {
    clearTimeout(timer)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {}
  }

  return { save, load, clear }
}
