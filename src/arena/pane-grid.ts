import { isCoarsePointer, isNarrowLayout } from "../text/breakpoints.ts"

/** The narrowest a pane stays readable: ~28ch of story text plus pane chrome. */
export const MIN_PANE_WIDTH = 240
export const MAX_PANES = 4
/** Short touch screens — phone landscape — can't fit readable panes even when width allows. */
const SHORT_COARSE = "(max-height: 30rem)"

export type PaneCapacityInput = {
  width: number
  narrow?: boolean
  shortCoarse?: boolean
}

/**
 * How many panes fit readably: `min(4, floor(width / MIN_PANE_WIDTH))`, forced to 1 on narrow layouts
 * and on short coarse-pointer screens. A coarse pointer alone does not cap — an iPad or touchscreen
 * laptop that fits readable panes may run up to 4.
 */
export function paneCapacity({ width, narrow, shortCoarse }: PaneCapacityInput) {
  const hasMedia = typeof matchMedia === "function"
  const isNarrow = narrow ?? (hasMedia && isNarrowLayout())
  const isShortCoarse = shortCoarse ?? (hasMedia && isCoarsePointer() && matchMedia(SHORT_COARSE).matches)
  if (isNarrow || isShortCoarse) return 1
  return Math.min(MAX_PANES, Math.max(1, Math.floor(width / MIN_PANE_WIDTH)))
}

export function currentPaneCapacity() {
  return paneCapacity({ width: innerWidth })
}

export type PaneGridDeps = {
  createSection(slot: number): HTMLElement
  capacity?: () => number
  onCapacityChange?: (capacity: number) => void
}

export type PaneGrid = {
  capacity(): number
  canAdd(): boolean
  /** The lowest free slot when another pane fits, `undefined` when the grid is full for this viewport. */
  nextSlot(): number | undefined
  mount(slot: number): HTMLElement
  unmount(slot: number): void
  slots(): number[]
  section(slot: number): HTMLElement | undefined
}

/** Owns the pane `<section>` elements inside the grid container: slot assignment, DOM order, and the live capacity limit. */
export function createPaneGrid(container: HTMLElement, { createSection, capacity = currentPaneCapacity, onCapacityChange }: PaneGridDeps): PaneGrid {
  const sections = new Map<number, HTMLElement>()
  let lastCapacity = capacity()

  const checkCapacity = () => {
    const next = capacity()
    if (next === lastCapacity) return
    lastCapacity = next
    onCapacityChange?.(next)
  }
  if (typeof matchMedia === "function") {
    for (const query of ["(max-width: 44rem)", "(pointer: coarse)", SHORT_COARSE]) {
      matchMedia(query).addEventListener?.("change", checkCapacity)
    }
  }
  globalThis.addEventListener?.("resize", checkCapacity)

  return { capacity, canAdd, nextSlot, mount, unmount, slots, section: (slot) => sections.get(slot) }

  function slots() {
    return [...sections.keys()].sort((a, b) => a - b)
  }

  function canAdd() {
    return slots().length < Math.min(MAX_PANES, capacity())
  }

  function nextSlot() {
    if (!canAdd()) return
    for (let slot = 0; slot < MAX_PANES; slot++) if (!sections.has(slot)) return slot
  }

  function mount(slot: number) {
    let element = sections.get(slot)
    if (!element) {
      element = createSection(slot)
      element.dataset.slot = String(slot)
      sections.set(slot, element)
    }
    render()
    return element
  }

  function unmount(slot: number) {
    sections.get(slot)?.remove()
    sections.delete(slot)
    render()
  }

  /** Re-appends sections in slot order, so the DOM always matches slot order however panes were added or removed. */
  function render() {
    for (const slot of slots()) container.append(sections.get(slot)!)
  }
}
