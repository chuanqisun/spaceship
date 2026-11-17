import { afterEach, describe, expect, it, vi } from "vitest"
import { openrouterProvider } from "./openrouter.ts"

afterEach(() => vi.unstubAllGlobals())

describe("openrouterProvider.chat", () => {
  it("posts an OpenAI-compatible streaming request with Bearer auth", async () => {
    const fetchMock = stubFetch(new Response(streamOf(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n'])))

    const deltas = await collect(
      openrouterProvider.chat({
        apiKey: "or-key",
        model: "openai/gpt-oss-120b",
        system: "sys",
        user: "usr",
        temperature: 0.5,
        maxCompletionTokens: 64,
        signal: new AbortController().signal,
      }),
    )

    expect(deltas).toEqual(["hi"])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer or-key")
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "openai/gpt-oss-120b", stream: true })
  })

  it("rejects when no API key is stored", async () => {
    await expect(
      collect(
        openrouterProvider.chat({
          apiKey: undefined,
          model: "m",
          system: "",
          user: "",
          temperature: 0,
          maxCompletionTokens: 1,
          signal: new AbortController().signal,
        }),
      ),
    ).rejects.toThrow(/api key/i)
  })

  it("throws with the status when the provider rejects the request", async () => {
    stubFetch(new Response("payment required", { status: 402 }))
    await expect(collect(openrouterProvider.chat(requestOf()))).rejects.toThrow("402 payment required")
  })
})

describe("openrouterProvider.listModels", () => {
  it("parses the OpenRouter catalog shape including pricing and context length", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "openai/gpt-oss-120b",
              name: "GPT OSS 120B",
              context_length: 131072,
              pricing: { prompt: "0.000001", completion: "0.000005" },
            },
            { id: "meta-llama/llama-3.3-70b", name: "Llama 3.3 70B" },
          ],
        }),
      ),
    )

    const models = await openrouterProvider.listModels("or-key", new AbortController().signal)

    expect(models).toEqual([
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", contextLength: 131072, pricing: { prompt: 0.000001, completion: 0.000005 } },
      { id: "meta-llama/llama-3.3-70b", name: "Llama 3.3 70B", contextLength: undefined, pricing: undefined },
    ])
  })

  it("uses the keyed models/user endpoint when a key is present", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ data: [] })))
    await openrouterProvider.listModels("or-key", new AbortController().signal)
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models/user")
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer or-key")
  })

  it("uses the public models endpoint without a key", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ data: [] })))
    await openrouterProvider.listModels(undefined, new AbortController().signal)
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models")
  })
})

function requestOf() {
  return {
    apiKey: "or-key" as string | undefined,
    model: "m",
    system: "",
    user: "",
    temperature: 0,
    maxCompletionTokens: 1,
    signal: new AbortController().signal,
  }
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const items: T[] = []
  for await (const item of iterable) items.push(item)
  return items
}
