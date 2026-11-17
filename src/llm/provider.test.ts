import { describe, expect, it } from "vitest"
import { PROVIDERS, registerProvider, type Provider } from "./provider.ts"

const stubProvider = (id: Provider["id"]): Provider => ({
  id,
  name: id,
  chatEndpoint: "https://example.com",
  listModels: async () => [],
  chat: async function* () {},
})

describe("PROVIDERS registry", () => {
  it("starts empty until a provider module registers itself", () => {
    expect(PROVIDERS.cerebras).toBeUndefined()
    expect(PROVIDERS.openrouter).toBeUndefined()
    expect(PROVIDERS.sim).toBeUndefined()
  })

  it("registerProvider stores a provider under its id", () => {
    const provider = stubProvider("cerebras")
    registerProvider(provider)
    expect(PROVIDERS.cerebras).toBe(provider)
  })

  it("re-registering an id replaces the previous provider", () => {
    const first = stubProvider("openrouter")
    const second = { ...first, name: "replacement" }
    registerProvider(first)
    registerProvider(second)
    expect(PROVIDERS.openrouter).toBe(second)
  })
})
