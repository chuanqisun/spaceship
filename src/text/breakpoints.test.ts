import { afterEach, describe, expect, it, vi } from "vitest"
import { isCoarsePointer, isNarrowLayout } from "./breakpoints.ts"

const NARROW = "(max-width: 44rem)"
const COARSE = "(pointer: coarse)"

type StubQuery = { matches: boolean }

/** A `matchMedia` stub: each query string gets one record whose `matches` tests flip by hand. */
function stubMatchMedia(matching: string[] = []) {
  const queries = new Map<string, StubQuery>()
  vi.stubGlobal("matchMedia", (media: string) => {
    let query = queries.get(media)
    if (!query) {
      query = { matches: matching.includes(media) }
      queries.set(media, query)
    }
    return {
      media,
      get matches() {
        return query.matches
      },
    } as MediaQueryList
  })
  return {
    setMatches(media: string, matches: boolean) {
      const query = queries.get(media)
      if (!query) throw new Error(`matchMedia("${media}") was never created`)
      query.matches = matches
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("media queries", () => {
  it("reads the narrow and coarse breakpoints", () => {
    stubMatchMedia([NARROW, COARSE])
    expect(isNarrowLayout()).toBe(true)
    expect(isCoarsePointer()).toBe(true)
  })

  it("reflects the current match of each breakpoint", () => {
    const media = stubMatchMedia()
    expect(isNarrowLayout()).toBe(false)
    expect(isCoarsePointer()).toBe(false)
    media.setMatches(NARROW, true)
    media.setMatches(COARSE, true)
    expect(isNarrowLayout()).toBe(true)
    expect(isCoarsePointer()).toBe(true)
  })
})
