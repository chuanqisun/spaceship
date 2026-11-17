# Contract: LLM Providers & Model Catalogs

## Provider interface (`src/llm/provider.ts`)

```ts
type ChatRequest = {
  apiKey: string | undefined
  model: string
  system: string
  user: string
  temperature: number
  maxCompletionTokens: number
  signal: AbortSignal
}

type Provider = {
  id: "sim" | "cerebras" | "openrouter"
  name: string
  keyStorage?: string
  chatEndpoint: string // module constant, HTTPS, allowlisted
  modelsEndpoint?: string
  listModels(apiKey: string | undefined, signal: AbortSignal): Promise<ModelInfo[]>
  chat(request: ChatRequest): AsyncIterable<string>
}
```

Rules:

- `chat` MUST yield text deltas and MUST terminate (return or throw) when `signal` aborts. Errors propagate as thrown `Error`s with `status` + body excerpt, matching `cerebras.ts` today.
- SSE parsing (`data:` lines, `[DONE]`, `choices[0].delta.content`) is shared; OpenRouter and Cerebras both conform.
- `apiKey` lives on `ChatRequest` (first field, mirroring `CompletionRequest`); it is `undefined` only for `sim`; keyed providers throw a clear "save an API key" error when missing (existing behaviour).

## Endpoints (allowlist additions)

| Provider   | Chat                                                 | Models                                                                     |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| cerebras   | `POST https://api.cerebras.ai/v1/chat/completions`   | `GET https://api.cerebras.ai/v1/models`                                    |
| openrouter | `POST https://openrouter.ai/api/v1/chat/completions` | `GET https://openrouter.ai/api/v1/models/user` (keyed) or `/api/v1/models` |

Both added to the connect-src allowlist; OpenRouter requires an ADR per constitution VII.

## Model catalog contract (`src/llm/catalog.ts`)

```ts
type ModelCatalog = {
  provider: Provider["id"]
  fetchedAt: number
  source: "live" | "cache" | "manual"
  models: ModelInfo[]
}
```

- `Provider.listModels(apiKey, signal)` is the uncached per-provider fetch returning `ModelInfo[]`; `catalog.loadCatalog(provider, apiKey, signal)` is the cached wrapper returning `ModelCatalog` (with `fetchedAt`/`source`). On failure `loadCatalog` returns the cached catalog with `source: "cache"`, or an empty `ModelCatalog` with `source: "manual"` so the picker shows manual entry.
- Cache key: `models-catalog-<provider>`; entries older than the provider's typical refresh are still usable but flagged stale in the picker.
- OpenRouter list supports `?q=<term>` server-side search; the picker debounces input ≥150 ms and caches per query only for the session (no persistent query cache).
- Cerebras catalog is small (<20 models); OpenRouter is large (hundreds) — picker MUST virtualize or paginate/filter client-side and default `output_modalities=text`.

## Auth

- Keys read from `localStorage` via each provider's `keyStorage`; sent only as `Authorization: Bearer` to that provider's endpoints. Never logged, never in URLs, never cross-origin.
