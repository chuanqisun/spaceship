import { registerProvider, type ChatRequest, type ModelInfo, type Provider } from "./provider.ts"
import { streamSseContent } from "./sse.ts"

export const API_URL = "https://api.cerebras.ai/v1/chat/completions"
const MODELS_URL = "https://api.cerebras.ai/v1/models"
const MODEL = "gpt-oss-120b"

export const KEY_STORAGE = "cerebras-api-key"

export const storedApiKey = () => localStorage.getItem(KEY_STORAGE)?.trim()

export type CompletionRequest = {
  apiKey: string
  system: string
  user: string
  temperature: number
  maxCompletionTokens: number
  signal: AbortSignal
}

export async function* streamCompletion({ apiKey, system, user, temperature, maxCompletionTokens, signal }: CompletionRequest) {
  yield* cerebrasProvider.chat({ apiKey, model: MODEL, system, user, temperature, maxCompletionTokens, signal })
}

async function* chat({ apiKey, model, system, user, temperature, maxCompletionTokens, signal }: ChatRequest): AsyncIterable<string> {
  if (!apiKey) throw new Error("save an API key first")
  const response = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      reasoning_effort: "low",
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
  if (!apiKey) throw new Error("save an API key first")
  const response = await fetch(MODELS_URL, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  const { data } = (await response.json()) as { data?: { id?: string }[] }
  return (data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({ id, name: id, contextLength: undefined, pricing: undefined }))
}

export const cerebrasProvider: Provider = {
  id: "cerebras",
  name: "Cerebras",
  keyStorage: KEY_STORAGE,
  chatEndpoint: API_URL,
  modelsEndpoint: MODELS_URL,
  listModels,
  chat,
}

registerProvider(cerebrasProvider)
