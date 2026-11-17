import { afterEach, describe, expect, it, vi } from "vitest"
import { cerebrasProvider } from "./cerebras.ts"
import { openrouterProvider } from "./openrouter.ts"
import { CATALOG_STALE_MS, isCatalogStale, loadCatalog, searchCatalog, type ModelCatalog } from "./catalog.ts"

afterEach(() => vi.unstubAllGlobals())

function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

function stubFetchJson(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function stubFetchReject() {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const signal = () => new AbortController().signal

describe("loadCatalog", () => {
  it("fetches the Cerebras {data:[{id}]} shape live and writes the cache", async () => {
    stubLocalStorage()
    const fetchMock = stubFetchJson({ data: [{ id: "gpt-oss-120b" }, { id: "llama-3.3-70b" }, { id: "" }] })

    const catalog = await loadCatalog(cerebrasProvider, "test-key", signal())

    expect(catalog.provider).toBe("cerebras")
    expect(catalog.source).toBe("live")
    expect(catalog.models.map((model) => model.id)).toEqual(["gpt-oss-120b", "llama-3.3-70b"])
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.cerebras.ai/v1/models")
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer test-key")

    const cached = JSON.parse(localStorage.getItem("models-catalog-cerebras")!) as ModelCatalog
    expect(cached.fetchedAt).toBe(catalog.fetchedAt)
    expect(cached.models).toHaveLength(2)
  })

  it("fetches the OpenRouter {data:[{id,name,context_length,pricing}]} shape live", async () => {
    stubLocalStorage()
    const fetchMock = stubFetchJson({
      data: [
        {
          id: "openai/gpt-oss-120b",
          name: "GPT OSS 120B",
          context_length: 131072,
          pricing: { prompt: "0.000001", completion: "0.000005" },
        },
        { id: "qwen/qwen3-32b" },
      ],
    })

    const catalog = await loadCatalog(openrouterProvider, undefined, signal())

    expect(catalog.provider).toBe("openrouter")
    expect(catalog.source).toBe("live")
    expect(catalog.models).toEqual([
      {
        id: "openai/gpt-oss-120b",
        name: "GPT OSS 120B",
        contextLength: 131072,
        pricing: { prompt: 0.000001, completion: 0.000005 },
      },
      { id: "qwen/qwen3-32b", name: "qwen/qwen3-32b", contextLength: undefined, pricing: undefined },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models")
  })

  it("serves the cached catalog with source 'cache' when the live fetch fails", async () => {
    const store = stubLocalStorage()
    const stale: ModelCatalog = {
      provider: "cerebras",
      fetchedAt: 1234,
      source: "live",
      models: [{ id: "gpt-oss-120b", name: "gpt-oss-120b", contextLength: undefined, pricing: undefined }],
    }
    store.set("models-catalog-cerebras", JSON.stringify(stale))
    stubFetchReject()

    const catalog = await loadCatalog(cerebrasProvider, "test-key", signal())

    expect(catalog.source).toBe("cache")
    expect(catalog.fetchedAt).toBe(1234)
    expect(catalog.models.map((model) => model.id)).toEqual(["gpt-oss-120b"])
  })

  it("round-trips a live fetch through the cache on the next failure", async () => {
    stubLocalStorage()
    stubFetchJson({ data: [{ id: "gpt-oss-120b" }] })
    const live = await loadCatalog(cerebrasProvider, "test-key", signal())
    expect(live.source).toBe("live")

    stubFetchReject()
    const cached = await loadCatalog(cerebrasProvider, "test-key", signal())
    expect(cached.source).toBe("cache")
    expect(cached.fetchedAt).toBe(live.fetchedAt)
    expect(cached.models).toEqual(live.models)
  })

  it("returns an empty 'manual' catalog when the fetch fails with no cache", async () => {
    stubLocalStorage()
    stubFetchReject()

    const catalog = await loadCatalog(cerebrasProvider, "test-key", signal())

    expect(catalog).toEqual({ provider: "cerebras", fetchedAt: expect.any(Number), source: "manual", models: [] })
  })
})

describe("isCatalogStale", () => {
  const catalog = (fetchedAt: number, source: ModelCatalog["source"] = "live"): ModelCatalog => ({
    provider: "openrouter",
    fetchedAt,
    source,
    models: [],
  })

  it("flags catalogs older than the stale window", () => {
    const now = 1_000_000
    expect(isCatalogStale(catalog(now - CATALOG_STALE_MS - 1), now)).toBe(true)
    expect(isCatalogStale(catalog(now - CATALOG_STALE_MS + 1), now)).toBe(false)
    expect(isCatalogStale(catalog(now), now)).toBe(false)
  })

  it("never flags a manual catalog", () => {
    expect(isCatalogStale(catalog(0, "manual"), 1e15)).toBe(false)
  })
})

describe("searchCatalog", () => {
  it("queries OpenRouter with ?q= and caches per query for the session", async () => {
    stubLocalStorage()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const body = String(input).includes("q=llama") ? { data: [] } : { data: [{ id: "openai/gpt-oss-120b", name: "GPT OSS 120B" }] }
      return Promise.resolve(new Response(JSON.stringify(body)))
    })
    vi.stubGlobal("fetch", fetchMock)

    const first = await searchCatalog(openrouterProvider, undefined, "gpt oss", signal())
    const second = await searchCatalog(openrouterProvider, undefined, "gpt oss", signal())
    const other = await searchCatalog(openrouterProvider, undefined, "llama", signal())

    expect(first.map((model) => model.id)).toEqual(["openai/gpt-oss-120b"])
    expect(second).toEqual(first)
    expect(other).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toBe("https://openrouter.ai/api/v1/models?q=gpt%20oss")
    expect(urls[1]).toBe("https://openrouter.ai/api/v1/models?q=llama")
  })

  it("returns an empty list for providers without server-side search", async () => {
    stubLocalStorage()
    const fetchMock = stubFetchJson({ data: [] })
    expect(await searchCatalog(cerebrasProvider, "test-key", "gpt", signal())).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
