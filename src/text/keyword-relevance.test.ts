import { afterEach, describe, expect, it, vi } from "vitest"
import type { Lead } from "./attention.ts"
import { createKeywordRelevance } from "./keyword-relevance.ts"
import { storyLayoutOf } from "./story-layout.ts"

const layout = storyLayoutOf(["One."], "One. Two. Three.")
const lead: Lead = { before: "", keyword: "star", after: "" }

afterEach(() => vi.useRealTimers())

describe("createKeywordRelevance", () => {
  it("does not request or measure relevance while disabled", async () => {
    vi.useFakeTimers()
    let enabled = false
    const requests: Lead[][] = []
    const relevance = createKeywordRelevance(
      (request) => {
        requests.push(request.leads)
        return (async function* () {
          yield { index: 0, relevance: 0.7 }
        })()
      },
      () => {},
      () => enabled,
    )

    relevance.update(layout, [lead])
    await vi.advanceTimersByTimeAsync(1000)
    expect(requests).toEqual([])
    expect(relevance.relevanceOf(lead)).toEqual({ isMeasuring: false })

    enabled = true
    relevance.update(layout, [lead])
    await vi.advanceTimersByTimeAsync(300)
    expect(requests).toHaveLength(1)
    expect(relevance.relevanceOf(lead).relevance).toBe(0.7)
  })

  it("hides a cached score once the rail is disabled", async () => {
    vi.useFakeTimers()
    let enabled = true
    const relevance = createKeywordRelevance(
      () =>
        (async function* () {
          yield { index: 0, relevance: 0.7 }
        })(),
      () => {},
      () => enabled,
    )

    relevance.update(layout, [lead])
    await vi.advanceTimersByTimeAsync(300)
    expect(relevance.relevanceOf(lead).relevance).toBe(0.7)

    enabled = false
    relevance.update(layout, [lead])
    expect(relevance.relevanceOf(lead)).toEqual({ isMeasuring: false })
  })
})
