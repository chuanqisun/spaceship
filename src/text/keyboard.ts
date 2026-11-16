type KeyboardOptions = {
  /** Moves the knob `delta` words along the reading order (negative rewinds). */
  nudge: (delta: number) => void
  /** Expands attention boxes or collapses them and future knobs. */
  toggleAttention: () => void
  openLegend: () => void
  /** True while focus is in a field or dialog where keys belong to it. */
  isEditing: () => boolean
}

/**
 * The instrument's keyboard path: arrows nudge the knob a word at a time, Enter toggles attention,
 * h (or ?) opens the gesture legend. Keys typed into fields, dialogs and modifiers are left alone.
 */
export function createKeyboard({ nudge, toggleAttention, openLegend, isEditing }: KeyboardOptions) {
  const onKey = (event: KeyboardEvent) => {
    if (isEditing() || event.metaKey || event.ctrlKey || event.altKey) return
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        return (nudge(1), void event.preventDefault())
      case "ArrowUp":
      case "ArrowLeft":
        return (nudge(-1), void event.preventDefault())
      case "Enter":
        return (toggleAttention(), void event.preventDefault())
      case "h":
      case "?":
        return (openLegend(), void event.preventDefault())
    }
  }
  addEventListener("keydown", onKey)
  return { destroy: () => removeEventListener("keydown", onKey) }
}
