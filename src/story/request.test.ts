import { describe, expect, it } from "vitest"
import type { Control } from "../text/dimension.ts"
import type { Steering } from "../text/text-stream.ts"
import { STORY_MAX_WORDS, STORY_REQUEST } from "./prompt.ts"
import { STEERED_REQUEST, STEERED_SYSTEM_PROMPT, steeredUserMessage, withoutEcho } from "./request.ts"

const steering: Steering = {
  leads: [{ before: "the ", keyword: "phone", after: " rang" }],
  controls: [{ dimension: { name: "tension", kind: "scale", low: "calm", high: "tense" }, position: 1, strength: 0.8 } satisfies Control],
}

describe("steeredUserMessage", () => {
  it("lays out KEY PHRASES, CONTROLS, and STORY SO FAR blocks", () => {
    const message = steeredUserMessage("She reached for it.", steering)
    expect(message).toContain("KEY PHRASES\nthe [phone] rang")
    expect(message).toContain("CONTROLS\ntension: very tense (strong)")
    expect(message).toContain("STORY SO FAR\nShe reached for it.")
  })

  it("omits empty blocks including their headers", () => {
    const message = steeredUserMessage("prefix", { leads: [], controls: [] })
    expect(message).toBe("STORY SO FAR\nprefix")
  })
})

describe("withoutEcho", () => {
  it("drops leading words that repeat the tail of the prefix", () => {
    expect(withoutEcho("the door was still", "still locked, and")).toBe("locked, and")
  })

  it("returns the head unchanged when there is no echo", () => {
    expect(withoutEcho("the door was still", "she ran")).toBe("she ran")
  })
})

describe("request constants", () => {
  it("keeps the steered request on the shared story settings", () => {
    expect(STEERED_REQUEST).toMatchObject({ temperature: STORY_REQUEST.temperature, maxCompletionTokens: STORY_REQUEST.maxCompletionTokens })
    expect(STEERED_REQUEST.system).toBe(STEERED_SYSTEM_PROMPT)
    expect(STEERED_SYSTEM_PROMPT).toContain(String(STORY_MAX_WORDS))
  })
})
