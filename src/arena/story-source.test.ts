import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ChatRequest, Provider } from "../llm/provider.ts"
import { simProvider } from "../llm/sim.ts"
import { STEERED_REQUEST, steeredUserMessage } from "../story/request.ts"
import { STORY_REQUEST } from "../story/prompt.ts"
import { simulatedSource } from "../text/completion.ts"
import type { Steering } from "../text/text-stream.ts"
import { createArenaOpening } from "./opening.ts"
import { createStorySource } from "./story-source.ts"

const mem = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mem.get(key) ?? null,
  setItem: (key: string, value: string) => void mem.set(key, String(value)),
  removeItem: (key: string) => void mem.delete(key),
})

const NO_STEERING: Steering = { leads: [], controls: [] }
const PREFIX = "The alarm went off, but it was"

beforeEach(() => mem.clear())

describe("createStorySource", () => {
  it("gives sim panes the simulated source and the shared opening", () => {
    const opening = createArenaOpening(() => 0)
    const source = createStorySource(simProvider, "sim", opening)

    expect(source.complete).toBe(simulatedSource.complete)
    expect(source.expand?.(opening.text.split(/\s+/)[0])).toBe(opening.text)
  })

  it("streams provider.chat deltas with the story request and the stored key", async () => {
    mem.set("test-api-key", "  live-key  ")
    const { provider, calls } = liveProviderOf(["hello ", "world"])
    const source = createStorySource(
      provider,
      "test/model",
      createArenaOpening(() => 0),
    )
    const signal = new AbortController().signal

    const deltas = await collect(source.complete!(PREFIX, NO_STEERING, signal))

    expect(deltas).toEqual([" hello world"])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      apiKey: "live-key",
      model: "test/model",
      system: STORY_REQUEST.system,
      user: PREFIX,
      temperature: STORY_REQUEST.temperature,
      maxCompletionTokens: STORY_REQUEST.maxCompletionTokens,
      signal,
    })
  })

  it("builds the steered request when steering is present", async () => {
    const steering: Steering = { leads: [{ before: "the ", keyword: "phone", after: " rang" }], controls: [] }
    const { provider, calls } = liveProviderOf(["she reached for it"])
    const source = createStorySource(
      provider,
      "m",
      createArenaOpening(() => 0),
    )

    await collect(source.complete!(PREFIX, steering, new AbortController().signal))

    expect(calls[0].system).toBe(STEERED_REQUEST.system)
    expect(calls[0].user).toBe(steeredUserMessage(PREFIX, steering))
    expect(calls[0].user).toContain("KEY PHRASES")
    expect(calls[0].user).toContain("STORY SO FAR")
  })

  it("buffers the head until it passes the echo window, then strips a repeated prefix tail", async () => {
    const { provider } = liveProviderOf(["was not the ", "one on her phone. She lay still."])
    const source = createStorySource(
      provider,
      "m",
      createArenaOpening(() => 0),
    )

    const deltas = await collect(source.complete!(PREFIX, NO_STEERING, new AbortController().signal))

    expect(deltas).toEqual([" not the one on her phone. She lay still."])
  })

  it("passes an undefined key through when none is stored", async () => {
    const { provider, calls } = liveProviderOf(["hi"])
    const source = createStorySource(
      provider,
      "m",
      createArenaOpening(() => 0),
    )

    await collect(source.complete!(PREFIX, NO_STEERING, new AbortController().signal))

    expect(calls[0].apiKey).toBeUndefined()
  })

  it("propagates provider errors", async () => {
    const provider: Provider = {
      id: "cerebras",
      name: "Cerebras",
      keyStorage: "test-api-key",
      chatEndpoint: "https://example.test/chat",
      listModels: async () => [],
      chat: async function* () {
        throw new Error("402 payment required")
      },
    }
    const source = createStorySource(
      provider,
      "m",
      createArenaOpening(() => 0),
    )

    await expect(collect(source.complete!(PREFIX, NO_STEERING, new AbortController().signal))).rejects.toThrow("402 payment required")
  })
})

function liveProviderOf(deltas: string[]) {
  const calls: ChatRequest[] = []
  const provider: Provider = {
    id: "cerebras",
    name: "Cerebras",
    keyStorage: "test-api-key",
    chatEndpoint: "https://example.test/chat",
    listModels: async () => [],
    chat(request) {
      calls.push(request)
      return (async function* () {
        yield* deltas
      })()
    },
  }
  return { provider, calls }
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const items: T[] = []
  for await (const item of iterable) items.push(item)
  return items
}
