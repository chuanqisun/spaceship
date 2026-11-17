import { describe, expect, it } from "vitest"
import type { ModelInfo } from "../llm/provider.ts"
import { filterModels, normalizeManualId, suggestComparable } from "./model-picker.ts"

const info = (id: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  name: id,
  contextLength: undefined,
  pricing: undefined,
  ...extra,
})

describe("filterModels", () => {
  const models = [info("gpt-oss-120b"), info("llama-3.3-70b"), info("qwen/qwen3-32b", { name: "Qwen3 32B" })]

  it("returns every model for an empty or blank query", () => {
    expect(filterModels(models, "")).toEqual(models)
    expect(filterModels(models, "   ")).toEqual(models)
  })

  it("matches id and name case-insensitively", () => {
    expect(filterModels(models, "GPT-OSS").map((m) => m.id)).toEqual(["gpt-oss-120b"])
    expect(filterModels(models, "qwen3").map((m) => m.id)).toEqual(["qwen/qwen3-32b"])
    expect(filterModels(models, "QWEN3 32B").map((m) => m.id)).toEqual(["qwen/qwen3-32b"])
  })

  it("returns an empty list when nothing matches", () => {
    expect(filterModels(models, "nope")).toEqual([])
  })
})

describe("suggestComparable", () => {
  it("ranks an OpenRouter author/slug id matching the Cerebras family and size first", () => {
    const reference = info("gpt-oss-120b", { contextLength: 131072 })
    const candidates = [
      info("meta-llama/llama-3.3-70b", { contextLength: 131072 }),
      info("openai/gpt-oss-120b", { name: "GPT OSS 120B", contextLength: 131072 }),
      info("qwen/qwen3-32b", { contextLength: 131072 }),
    ]

    const suggestions = suggestComparable(reference, candidates)

    expect(suggestions[0].id).toBe("openai/gpt-oss-120b")
    expect(suggestions.map((m) => m.id)).not.toContain("qwen/qwen3-32b")
  })

  it("prefers the same size class within a shared family", () => {
    const reference = info("llama-3.3-70b")
    const candidates = [info("meta-llama/llama-3.3-8b-instruct"), info("meta-llama/llama-3.3-70b-instruct")]

    expect(suggestComparable(reference, candidates).map((m) => m.id)).toEqual(["meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.3-8b-instruct"])
  })

  it("breaks family/size ties by context-length proximity", () => {
    const reference = info("qwen/qwen3-32b", { contextLength: 40000 })
    const candidates = [info("qwen/qwen3-32b-gguf", { contextLength: 131072 }), info("qwen/qwen3-32b-awq", { contextLength: 32768 })]

    expect(suggestComparable(reference, candidates).map((m) => m.id)).toEqual(["qwen/qwen3-32b-awq", "qwen/qwen3-32b-gguf"])
  })

  it("excludes the reference id itself and unrelated models", () => {
    const reference = info("gpt-oss-120b")
    const candidates = [info("gpt-oss-120b"), info("unrelated/model-x")]

    expect(suggestComparable(reference, candidates)).toEqual([])
  })

  it("caps the list at the limit", () => {
    const reference = info("llama-3.3-70b")
    const candidates = Array.from({ length: 10 }, (_, i) => info(`meta-llama/llama-3.3-70b-v${i}`))

    expect(suggestComparable(reference, candidates, 3)).toHaveLength(3)
  })
})

describe("normalizeManualId", () => {
  it("trims a typed model id", () => {
    expect(normalizeManualId("  openai/gpt-oss-120b  ")).toBe("openai/gpt-oss-120b")
  })

  it("rejects blank input", () => {
    expect(normalizeManualId("")).toBeUndefined()
    expect(normalizeManualId("   ")).toBeUndefined()
  })
})
