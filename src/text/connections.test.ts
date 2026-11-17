import { afterEach, describe, expect, it, vi } from "vitest"
import { createConnections } from "./connections.ts"
import { storyLayoutOf } from "./story-layout.ts"

const story = storyLayoutOf(["One."], "One. Two. Three.")

afterEach(() => vi.useRealTimers())

describe("createConnections", () => {
  it("pauses rail-only scoring while disabled and resumes when re-enabled", async () => {
    vi.useFakeTimers()
    let enabled = false
    const questions: string[] = []
    const connections = createConnections({
      source: (_sentences, focus) => {
        questions.push(focus.text)
        return (async function* () {
          yield { index: 0, strength: 0.5 }
        })()
      },
      onChange: () => {},
      isEnabled: () => enabled,
    })

    connections.update(story)
    await vi.advanceTimersByTimeAsync(1000)
    expect(questions).toEqual([])

    enabled = true
    connections.update(story)
    await vi.advanceTimersByTimeAsync(400)
    expect(questions).toHaveLength(1)
  })
})
