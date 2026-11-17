import { describe, expect, it } from "vitest"
import { createArenaOpening } from "./opening.ts"

describe("createArenaOpening", () => {
  it("gives every pane the same opening for one session", () => {
    const session = createArenaOpening(() => 0.42)
    const paneA = createArenaOpening(() => 0.42)
    expect(session.expand("")).toBe(paneA.expand(""))
    expect(session.expand("")).toBe(session.text)
  })

  it("expands a partial prefix of the opening to the full opening", () => {
    const opening = createArenaOpening(() => 0)
    const firstWord = opening.text.split(/\s+/)[0]
    expect(opening.expand(firstWord)).toBe(opening.text)
  })

  it("leaves text that is not a prefix of the opening unchanged", () => {
    const opening = createArenaOpening(() => 0.5)
    expect(opening.expand("a divergent continuation")).toBe("a divergent continuation")
  })

  it("is fixed for the session: expand never picks a different opening", () => {
    const opening = createArenaOpening(() => 0.9)
    expect(opening.expand("")).toBe(opening.expand(""))
  })
})
