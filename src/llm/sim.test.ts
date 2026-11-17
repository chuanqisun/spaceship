import { describe, expect, it } from "vitest"
import { PROVIDERS } from "./provider.ts"
import { simProvider } from "./sim.ts"

describe("simProvider", () => {
  it("registers itself in PROVIDERS on import", () => {
    expect(PROVIDERS.sim).toBe(simProvider)
  })

  it("needs no API key or endpoints", () => {
    expect(simProvider.id).toBe("sim")
    expect(simProvider.keyStorage).toBeUndefined()
    expect(simProvider.modelsEndpoint).toBeUndefined()
  })

  it("lists a single synthetic model", async () => {
    const models = await simProvider.listModels(undefined, new AbortController().signal)
    expect(models).toHaveLength(1)
    expect(models[0].id).toBe("sim")
  })

  it("chat is a stub that explains panes use simulatedSource instead", async () => {
    const chat = simProvider.chat({
      apiKey: undefined,
      model: "sim",
      system: "",
      user: "",
      temperature: 0,
      maxCompletionTokens: 0,
      signal: new AbortController().signal,
    })
    const iterator = chat[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow(/simulatedSource/)
  })
})
