import { registerProvider, type ChatRequest, type ModelInfo, type Provider } from "./provider.ts"
import { streamSseContent } from "./sse.ts"

export const API_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODELS_URL = "https://openrouter.ai/api/v1/models"
const MODELS_USER_URL = "https://openrouter.ai/api/v1/models/user"

export const KEY_STORAGE = "openrouter-api-key"

async function* chat({ apiKey, model, system, user, temperature, maxCompletionTokens, signal }: ChatRequest): AsyncIterable<string> {
  if (!apiKey) throw new Error("save an API key first")
  const response = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      temperature,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })

  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  if (!response.body) throw new Error("no response body")

  yield* streamSseContent(response.body)
}

async function listModels(apiKey: string | undefined, signal: AbortSignal): Promise<ModelInfo[]> {
  const response = await fetch(apiKey ? MODELS_USER_URL : MODELS_URL, {
    signal,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  const { data } = (await response.json()) as {
    data?: { id?: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[]
  }
  return (data ?? [])
    .filter((model): model is typeof model & { id: string } => typeof model.id === "string" && model.id.length > 0)
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length,
      pricing:
        model.pricing?.prompt !== undefined && model.pricing?.completion !== undefined
          ? { prompt: Number(model.pricing.prompt), completion: Number(model.pricing.completion) }
          : undefined,
    }))
}

export const openrouterProvider: Provider = {
  id: "openrouter",
  name: "OpenRouter",
  keyStorage: KEY_STORAGE,
  chatEndpoint: API_URL,
  modelsEndpoint: MODELS_URL,
  listModels,
  chat,
}

registerProvider(openrouterProvider)
