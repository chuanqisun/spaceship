import type { ModelInfo, Provider, ProviderId } from "./provider.ts"

export type ModelCatalog = {
  provider: ProviderId
  fetchedAt: number
  source: "live" | "cache" | "manual"
  models: ModelInfo[]
}

/** Catalogs older than this still serve from cache but are flagged stale in the picker. */
export const CATALOG_STALE_MS = 60 * 60 * 1000

const SEARCH_CACHE_LIMIT = 200
const searchCache = new Map<string, Promise<ModelInfo[]>>()

export function catalogCacheKey(provider: ProviderId) {
  return `models-catalog-${provider}`
}

export function isCatalogStale(catalog: ModelCatalog, now = Date.now()) {
  return catalog.source !== "manual" && now - catalog.fetchedAt > CATALOG_STALE_MS
}

export function readCatalogCache(provider: ProviderId): ModelCatalog | undefined {
  try {
    const raw = localStorage.getItem(catalogCacheKey(provider))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<ModelCatalog>
    if (parsed.provider !== provider || !Array.isArray(parsed.models) || typeof parsed.fetchedAt !== "number") return undefined
    return { provider, fetchedAt: parsed.fetchedAt, source: "cache", models: parsed.models as ModelInfo[] }
  } catch {
    return undefined
  }
}

function writeCatalogCache(catalog: ModelCatalog) {
  try {
    localStorage.setItem(
      catalogCacheKey(catalog.provider),
      JSON.stringify({ provider: catalog.provider, fetchedAt: catalog.fetchedAt, models: catalog.models }),
    )
  } catch {
    // storage full or unavailable — the live catalog still serves this session
  }
}

function sortModels(models: ModelInfo[]) {
  return [...models].sort((a, b) => a.id.localeCompare(b.id))
}

/** Live-fetches `provider.listModels`, caches the result, and falls back to the cached or an empty manual catalog on failure. */
export async function loadCatalog(provider: Provider, apiKey: string | undefined, signal: AbortSignal): Promise<ModelCatalog> {
  try {
    const catalog: ModelCatalog = {
      provider: provider.id,
      fetchedAt: Date.now(),
      source: "live",
      models: sortModels(await provider.listModels(apiKey, signal)),
    }
    writeCatalogCache(catalog)
    return catalog
  } catch {
    return readCatalogCache(provider.id) ?? { provider: provider.id, fetchedAt: Date.now(), source: "manual", models: [] }
  }
}

/**
 * Server-side model search for providers that support `?q=` (OpenRouter). Results are cached per query
 * for the page session only — nothing persists. Returns `[]` for providers without search support,
 * where callers should filter the loaded catalog client-side instead.
 */
export function searchCatalog(provider: Provider, apiKey: string | undefined, query: string, signal: AbortSignal): Promise<ModelInfo[]> {
  const q = query.trim()
  if (!q || provider.id !== "openrouter" || !provider.modelsEndpoint) return Promise.resolve([])
  const key = `${apiKey ?? ""} ${q.toLowerCase()}`
  const cached = searchCache.get(key)
  if (cached) return cached
  const pending = fetchModelSearch(provider.modelsEndpoint, apiKey, q, signal).then(sortModels)
  searchCache.set(key, pending)
  pending.catch(() => {
    if (searchCache.get(key) === pending) searchCache.delete(key)
  })
  if (searchCache.size > SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value!)
  return pending
}

async function fetchModelSearch(modelsEndpoint: string, apiKey: string | undefined, query: string, signal: AbortSignal): Promise<ModelInfo[]> {
  const separator = modelsEndpoint.includes("?") ? "&" : "?"
  const response = await fetch(`${modelsEndpoint}${separator}q=${encodeURIComponent(query)}`, {
    signal,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return parseModelList(await response.json())
}

/** Parses the OpenRouter `{data:[{id,name,context_length,pricing}]}` payload into `ModelInfo`. */
function parseModelList(payload: unknown): ModelInfo[] {
  const data = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  return data.flatMap((entry): ModelInfo[] => {
    const model = entry as { id?: unknown; name?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown } } | null
    if (typeof model?.id !== "string" || model.id.length === 0) return []
    const prompt = Number(model.pricing?.prompt)
    const completion = Number(model.pricing?.completion)
    return [
      {
        id: model.id,
        name: typeof model.name === "string" && model.name ? model.name : model.id,
        contextLength: typeof model.context_length === "number" ? model.context_length : undefined,
        pricing: model.pricing && Number.isFinite(prompt) && Number.isFinite(completion) ? { prompt, completion } : undefined,
      },
    ]
  })
}
