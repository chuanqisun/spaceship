import { describe, expect, it } from "vitest"
import { sentenceSpans, wordSpans } from "./segments.ts"

describe("wordSpans", () => {
  it("returns word-like spans only", () => {
    const text = "Hello, space pilot!"
    expect(wordSpans(text).map(({ start, end }) => text.slice(start, end))).toEqual(["Hello", "space", "pilot"])
  })
})

describe("sentenceSpans", () => {
  it("tiles the whole text", () => {
    const text = "First idea. Second idea!  Third?"
    const spans = sentenceSpans(text)
    expect(spans.map(({ start, end }) => text.slice(start, end)).join("")).toBe(text)
    expect(spans).toHaveLength(3)
    expect(spans.every((span, index) => index === 0 || span.start === spans[index - 1].end)).toBe(true)
  })
})
