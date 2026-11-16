import { describe, expect, it } from "vitest"
import { countWords, firstWords } from "./words.ts"

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("the quick brown fox")).toBe(4)
    expect(countWords("  spaced   out\ntext  ")).toBe(3)
  })

  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0)
    expect(countWords("   \n\t ")).toBe(0)
  })
})

describe("firstWords", () => {
  it("returns the first n words including their separators", () => {
    expect(firstWords("the quick  brown fox", 2)).toBe("the quick")
    expect(firstWords("  leading space here", 2)).toBe("  leading space")
  })

  it("returns the whole text when it has fewer than n words", () => {
    expect(firstWords("only one", 3)).toBe("only one")
    expect(firstWords("a b cdef", 5)).toBe("a b cdef")
    expect(firstWords("", 1)).toBe("")
  })

  it("never ends mid-word", () => {
    expect(firstWords("hello world", 1)).toBe("hello")
    expect(firstWords("one two three", 2)).toBe("one two")
  })
})
