import { afterEach, describe, expect, it, vi } from "vitest"
import { streamCompletion, type CompletionRequest } from "./cerebras.ts"

afterEach(() => vi.unstubAllGlobals())

describe("streamCompletion", () => {
  it("yields content deltas across chunk boundaries and stops at [DONE]", async () => {
    const fetchMock = stubFetch(
      new Response(
        streamOf([
          'data: {"choices":[{"delta":{"content":"Steer"}}]}\n',
          'data: {"choices":[{"delta":{"con',
          'tent":" ideas"}}]}\n\ndata: {"choices":[{"delta":{}}]}\n',
          "data: [DONE]\n",
        ]),
      ),
    )

    expect(await collect(streamCompletion(requestOf()))).toEqual(["Steer", " ideas"])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.cerebras.ai/v1/chat/completions")
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key")
    expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, max_completion_tokens: 32 })
  })

  it("throws with the status when the provider rejects the request", async () => {
    stubFetch(new Response("invalid key", { status: 401 }))
    await expect(collect(streamCompletion(requestOf()))).rejects.toThrow("401 invalid key")
  })

  it("passes the abort signal to fetch", async () => {
    const fetchMock = stubFetch(new Response(streamOf([])))
    const request = requestOf()
    await collect(streamCompletion(request))
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(request.signal)
  })
})

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function requestOf(): CompletionRequest {
  return { apiKey: "test-key", system: "system", user: "user", temperature: 0, maxCompletionTokens: 32, signal: new AbortController().signal }
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
