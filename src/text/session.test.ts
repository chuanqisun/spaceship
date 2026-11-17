import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSession, type SessionState } from "./session.ts"

const mem = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mem.get(key) ?? null,
  setItem: (key: string, value: string) => void mem.set(key, String(value)),
  removeItem: (key: string) => void mem.delete(key),
})

const snapshot = { caretWords: 12, attention: [{ keyword: "drift", before: 1, after: 2 }], future: [] }

function sessionOf(overrides: Partial<Parameters<typeof createSession>[0]> = {}) {
  return createSession({ snapshot: () => snapshot, ...overrides })
}

function stored(): SessionState | undefined {
  const raw = mem.get("spaceship.session")
  return raw === undefined ? undefined : (JSON.parse(raw) as SessionState)
}

beforeEach(() => {
  mem.clear()
  vi.useRealTimers()
})

describe("save and load", () => {
  it("round-trips the snapshot with a version and timestamp", async () => {
    vi.useFakeTimers()
    const session = sessionOf({ now: () => 1000 })
    session.save()
    vi.advanceTimersByTime(500)
    expect(stored()).toMatchObject({ version: 1, caretWords: 12, savedAt: 1000 })
    expect(session.load()).toMatchObject({ caretWords: 12, attention: snapshot.attention })
  })

  it("debounces repeated saves into the latest snapshot", async () => {
    vi.useFakeTimers()
    let caretWords = 1
    const session = createSession({ snapshot: () => ({ ...snapshot, caretWords }), now: () => 0 })
    session.save()
    caretWords = 9
    session.save()
    vi.advanceTimersByTime(500)
    expect(stored()?.caretWords).toBe(9)
  })

  it("clear drops the stored session and any pending save", async () => {
    vi.useFakeTimers()
    const session = sessionOf()
    session.save()
    session.clear()
    vi.advanceTimersByTime(1000)
    expect(session.load()).toBeUndefined()
    expect(mem.has("spaceship.session")).toBe(false)
  })
})

describe("load validation", () => {
  const DAY = 24 * 60 * 60 * 1000

  function seed(state: unknown) {
    mem.set("spaceship.session", typeof state === "string" ? state : JSON.stringify(state))
  }

  it("returns undefined when nothing is stored or the JSON is malformed", () => {
    expect(sessionOf().load()).toBeUndefined()
    seed("not json {")
    expect(sessionOf().load()).toBeUndefined()
  })

  it("rejects a version mismatch, a stale session, and a missing field", () => {
    const now = 10 * DAY
    const valid = { version: 1, caretWords: 3, attention: [], future: [], savedAt: now }
    seed({ ...valid, version: 2 })
    expect(sessionOf({ now: () => now }).load()).toBeUndefined()
    seed({ ...valid, savedAt: now - DAY - 1 })
    expect(sessionOf({ now: () => now }).load()).toBeUndefined()
    seed({ ...valid, savedAt: now + 1 })
    expect(sessionOf({ now: () => now }).load()).toBeUndefined()
    seed({ version: 1, caretWords: 3, attention: [], savedAt: now })
    expect(sessionOf({ now: () => now }).load()).toBeUndefined()
    seed(valid)
    expect(sessionOf({ now: () => now }).load()).toMatchObject({ caretWords: 3 })
  })
})
