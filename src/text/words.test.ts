import { describe, expect, it } from "vitest"
import { countWords, firstWords } from "./words.ts"

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("  steer   your ideas\nin realtime ")).toBe(5)
  })

  it("returns 0 for empty or blank text", () => {
    expect(countWords("")).toBe(0)
    expect(countWords(" \n\t ")).toBe(0)
  })
})

describe("firstWords", () => {
  it("keeps leading whitespace and the first words", () => {
    expect(firstWords("  one two three", 2)).toBe("  one two")
  })

  it("returns the whole text when asked for exactly its word count", () => {
    expect(firstWords("one two", 2)).toBe("one two")
  })

  it("returns an empty string for zero words", () => {
    expect(firstWords("one two", 0)).toBe("")
  })
})
