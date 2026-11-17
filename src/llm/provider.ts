export type ChatRequest = {
  apiKey: string | undefined
  model: string
  system: string
  user: string
  temperature: number
  maxCompletionTokens: number
  signal: AbortSignal
}

export type ModelInfo = {
  id: string
  name: string
  contextLength: number | undefined
  pricing: { prompt: number; completion: number } | undefined
}

export type ProviderId = "sim" | "cerebras" | "openrouter"

export type Provider = {
  id: ProviderId
  name: string
  keyStorage?: string
  chatEndpoint: string
  modelsEndpoint?: string
  listModels(apiKey: string | undefined, signal: AbortSignal): Promise<ModelInfo[]>
  chat(request: ChatRequest): AsyncIterable<string>
}

const providers: Partial<Record<ProviderId, Provider>> = {}

export const PROVIDERS: Readonly<Partial<Record<ProviderId, Provider>>> = providers

export function registerProvider(provider: Provider): void {
  providers[provider.id] = provider
}
