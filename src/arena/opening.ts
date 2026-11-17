import { STORY_OPENINGS } from "../story/openings.ts"

export type ArenaOpening = {
  /** The one opening every pane in this arena session expands to. */
  readonly text: string
  /** Expands `text` to the session opening when it is a prefix of it; otherwise returns `text` unchanged. */
  expand(text: string): string
}

/** Picks one story opening for the whole arena session so every pane starts from the same prefix. */
export function createArenaOpening(random: () => number = Math.random): ArenaOpening {
  const text = STORY_OPENINGS[Math.floor(random() * STORY_OPENINGS.length)]
  const openingWords = text.split(/\s+/)
  return {
    text,
    expand(candidate: string) {
      const words = candidate.match(/\S+/g) ?? []
      const isPrefix = openingWords.length >= words.length && words.every((word, i) => word === openingWords[i])
      return isPrefix ? text : candidate
    },
  }
}
