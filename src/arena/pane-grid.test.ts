import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_PANES, MIN_PANE_WIDTH, createPaneGrid, currentPaneCapacity, paneCapacity } from "./pane-grid.ts"

const NARROW = "(max-width: 44rem)"
const COARSE = "(pointer: coarse)"
const SHORT = "(max-height: 30rem)"

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
}

function stubViewport(width: number) {
  vi.stubGlobal("innerWidth", width)
}

/** A grid over fake DOM nodes: only the slot bookkeeping is under test, never real layout. */
function fakeGrid(capacity: number) {
  return createPaneGrid({ append() {} } as unknown as HTMLElement, {
    createSection: () => ({ dataset: {}, remove() {} }) as unknown as HTMLElement,
    capacity: () => capacity,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe("paneCapacity", () => {
  it("is 1 on a narrow layout, however wide the viewport", () => {
    expect(paneCapacity({ width: 2560, narrow: true })).toBe(1)
  })

  it("is 1 on a short coarse-pointer screen", () => {
    expect(paneCapacity({ width: 2560, shortCoarse: true })).toBe(1)
  })

  it("is 1 when the width fits fewer than two minimum panes", () => {
    expect(paneCapacity({ width: 2 * MIN_PANE_WIDTH - 1, narrow: false, shortCoarse: false })).toBe(1)
    expect(paneCapacity({ width: MIN_PANE_WIDTH, narrow: false, shortCoarse: false })).toBe(1)
  })

  it("grows with width up to 4 otherwise", () => {
    expect(paneCapacity({ width: 2 * MIN_PANE_WIDTH, narrow: false, shortCoarse: false })).toBe(2)
    expect(paneCapacity({ width: 3 * MIN_PANE_WIDTH, narrow: false, shortCoarse: false })).toBe(3)
    expect(paneCapacity({ width: 4 * MIN_PANE_WIDTH, narrow: false, shortCoarse: false })).toBe(4)
    expect(paneCapacity({ width: 99 * MIN_PANE_WIDTH, narrow: false, shortCoarse: false })).toBe(MAX_PANES)
  })
})

describe("currentPaneCapacity", () => {
  it("reads the live matchMedia breakpoints and viewport width", () => {
    stubMatchMedia()
    stubViewport(1280)
    expect(currentPaneCapacity()).toBe(4)

    stubMatchMedia([NARROW])
    expect(currentPaneCapacity()).toBe(1)
  })

  it("caps at 1 on a short coarse-pointer matchMedia pair", () => {
    stubMatchMedia([COARSE, SHORT])
    stubViewport(1280)
    expect(currentPaneCapacity()).toBe(1)
  })

  it("does not cap on a coarse pointer alone", () => {
    stubMatchMedia([COARSE])
    stubViewport(1280)
    expect(currentPaneCapacity()).toBe(4)
  })

  it("caps at 1 when the stubbed width fits fewer than two panes", () => {
    stubMatchMedia()
    stubViewport(2 * MIN_PANE_WIDTH - 1)
    expect(currentPaneCapacity()).toBe(1)
    stubViewport(2 * MIN_PANE_WIDTH)
    expect(currentPaneCapacity()).toBe(2)
  })
})

describe("createPaneGrid entry points", () => {
  it("rejects a second pane on a capacity-1 viewport", () => {
    const grid = fakeGrid(1)
    expect(grid.canAdd()).toBe(true)
    expect(grid.nextSlot()).toBe(0)
    grid.mount(0)
    expect(grid.slots()).toEqual([0])
    expect(grid.canAdd()).toBe(false)
    expect(grid.nextSlot()).toBeUndefined()
  })

  it("hands out the lowest free slot up to the capacity", () => {
    const grid = fakeGrid(MAX_PANES)
    grid.mount(0)
    grid.mount(2)
    expect(grid.nextSlot()).toBe(1)
    grid.mount(1)
    expect(grid.nextSlot()).toBe(3)
    grid.mount(3)
    expect(grid.nextSlot()).toBeUndefined()
    expect(grid.canAdd()).toBe(false)
  })

  it("frees the slot on unmount and keeps slots sorted", () => {
    const grid = fakeGrid(4)
    grid.mount(2)
    grid.mount(0)
    expect(grid.slots()).toEqual([0, 2])
    grid.unmount(0)
    expect(grid.slots()).toEqual([2])
    expect(grid.nextSlot()).toBe(0)
  })
})
