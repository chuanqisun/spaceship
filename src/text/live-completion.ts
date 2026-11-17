import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_REQUEST } from "../story/prompt.ts"
import { STEERED_REQUEST, steeredUserMessage, withoutEcho } from "../story/request.ts"
import type { Steering, TextSource } from "./text-stream.ts"
import { countWords } from "./words.ts"

export { STEERED_REQUEST, STEERED_SYSTEM_PROMPT, steeredUserMessage, withoutEcho } from "../story/request.ts"

const MAX_ECHO_WORDS = 6

export const liveSource: TextSource = { expand: expandToStoryStart, complete: completeStory }

/** Picks a random story opening that begins with the same words as `text`. */
function expandToStoryStart(text: string) {
  const words = text.match(/\S+/g) ?? []
  const candidates = STORY_OPENINGS.filter((start) => {
    const startWords = start.split(/\s+/)
    return startWords.length >= words.length && words.every((word, i) => word === startWords[i])
  })
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

async function* completeStory(prefix: string, steering: Steering, signal: AbortSignal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("save an API key first")

  const isSteered = steering.leads.length > 0 || steering.controls.length > 0
  const request = isSteered ? { ...STEERED_REQUEST, user: steeredUserMessage(prefix, steering) } : { ...STORY_REQUEST, user: prefix }
  let head: string | undefined = ""
  for await (const delta of streamCompletion({ ...request, apiKey, signal })) {
    if (head === undefined) {
      yield delta
      continue
    }
    head += delta
    if (countWords(head) <= MAX_ECHO_WORDS) continue
    yield ` ${withoutEcho(prefix, head)}`
    head = undefined
  }
  const rest = head && withoutEcho(prefix, head)
  if (rest) yield ` ${rest}`
}
