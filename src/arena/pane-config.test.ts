import { describe, expect, it } from "vitest"
import "../llm/cerebras.ts"
import "../llm/openrouter.ts"
import "../llm/sim.ts"
import { defaultPaneConfigs, loadPaneConfigs, serializePaneConfigs } from "./pane-config.ts"

describe("loadPaneConfigs", () => {
  it("defaults to two sim panes on missing or invalid storage", () => {
    expect(loadPaneConfigs(null)).toEqual(defaultPaneConfigs())
    expect(loadPaneConfigs("not json")).toEqual(defaultPaneConfigs())
    expect(loadPaneConfigs('{"a":1}')).toEqual(defaultPaneConfigs())
    expect(loadPaneConfigs("[]")).toEqual(defaultPaneConfigs())
  })

  it("round-trips provider, model, slot order, and focus", () => {
    const configs = [
      { slot: 2, provider: "cerebras", model: "gpt-oss-120b" },
      { slot: 0, provider: "sim", model: "sim", focused: true },
    ] as const
    const loaded = loadPaneConfigs(serializePaneConfigs([...configs]))
    expect(loaded).toEqual([
      { slot: 0, provider: "sim", model: "sim", focused: true },
      { slot: 2, provider: "cerebras", model: "gpt-oss-120b" },
    ])
  })

  it("falls back to sim for unknown providers and blank models", () => {
    const loaded = loadPaneConfigs(JSON.stringify([{ slot: 0, provider: "bogus", model: "" }]))
    expect(loaded).toEqual([{ slot: 0, provider: "sim", model: "sim" }])
  })

  it("drops slots past the maximum and reassigns duplicates to free slots", () => {
    const loaded = loadPaneConfigs(
      JSON.stringify([
        { slot: 1, provider: "sim", model: "sim" },
        { slot: 1, provider: "sim", model: "sim" },
        { slot: 9, provider: "sim", model: "sim" },
      ]),
    )
    expect(loaded.map(({ slot }) => slot).sort((a, b) => a - b)).toEqual([0, 1, 2])
  })
})
