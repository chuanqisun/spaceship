import { describe, expect, it } from "vitest"
import { streamSseContent } from "./sse.ts"

describe("streamSseContent", () => {
  it("yields content deltas across chunk boundaries and stops at [DONE]", async () => {
    const stream = streamOf([
      'data: {"choices":[{"delta":{"content":"Steer"}}]}\n',
      'data: {"choices":[{"delta":{"con',
      'tent":" ideas"}}]}\n\ndata: {"choices":[{"delta":{}}]}\n',
      "data: [DONE]\n",
      'data: {"choices":[{"delta":{"content":"after done"}}]}\n',
    ])

    expect(await collect(streamSseContent(stream))).toEqual(["Steer", " ideas"])
  })

  it("skips malformed JSON, non-data lines, and empty data payloads", async () => {
    const stream = streamOf([": keep-alive\n", "data: {not json}\n", "data:\n", 'data: {"choices":[{"delta":{"content":"ok"}}]}\n', "data: [DONE]\n"])

    expect(await collect(streamSseContent(stream))).toEqual(["ok"])
  })

  it("handles a stream that ends without [DONE]", async () => {
    const stream = streamOf(['data: {"choices":[{"delta":{"content":"tail"}}]}\n'])

    expect(await collect(streamSseContent(stream))).toEqual(["tail"])
  })
})

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
