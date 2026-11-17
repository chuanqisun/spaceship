import { firstWords } from "./words.ts"

/** Enough upcoming words to fill roughly two column lines at the text measure. */
const GHOST_WORDS = 26

type GhostTextOptions = {
  textElement: HTMLElement
}

/**
 * Shows the generated words waiting past the knob as faint ghost text continuing the shown text's flow.
 * The ghost lives in a trailing `<span>` inside the text element, after every real offset, so word spans,
 * ranges and caret math are unaffected; it is unselectable and aria-hidden.
 */
export function createGhostText({ textElement }: GhostTextOptions) {
  const ghost = document.createElement("span")
  ghost.className = "ghost"
  ghost.ariaHidden = "true"

  return { update }

  /** `upcoming` is the generated text past the shown text, whitespace-collapsed; empty hides the ghost. */
  function update(upcoming: string) {
    const words = firstWords(upcoming.trim(), GHOST_WORDS)
    if (!words) {
      ghost.remove()
      return
    }
    ghost.textContent = ` ${words}`
    if (ghost.parentElement !== textElement || textElement.lastElementChild !== ghost) textElement.append(ghost)
  }
}
