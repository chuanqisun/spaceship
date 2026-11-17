/**
 * Yields `choices[0].delta.content` strings from an OpenAI-compatible SSE body.
 * Tolerates lines split across chunks and skips blank, non-`data:`, `[DONE]`, and malformed JSON lines.
 */
export async function* streamSseContent(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split("\n")
    buffer = events.pop() ?? ""

    for (const line of events) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : ""
      if (!data) continue
      if (data === "[DONE]") return
      try {
        const content = JSON.parse(data).choices?.[0]?.delta?.content
        if (content) yield content as string
      } catch {
        // malformed JSON lines are ignored
      }
    }
  }
}
