import type { Provider } from "../llm/provider.ts"
import { STEERED_REQUEST, steeredUserMessage, withoutEcho } from "../story/request.ts"
import { STORY_REQUEST } from "../story/prompt.ts"
import { simulatedSource } from "../text/completion.ts"
import { countWords } from "../text/words.ts"
import type { Steering, TextSource } from "../text/text-stream.ts"
import type { ArenaOpening } from "./opening.ts"

const MAX_ECHO_WORDS = 6

/** Builds the `TextSource` a pane runs: sim panes stream `simulatedSource`, live panes stream `provider.chat` with the shared story request. */
export function createStorySource(provider: Provider, model: string, opening: ArenaOpening): TextSource {
  if (provider.id === "sim") return { expand: opening.expand, complete: simulatedSource.complete }
  return { expand: opening.expand, complete: (prefix, steering, signal) => completeLive(provider, model, prefix, steering, signal) }
}

async function* completeLive(provider: Provider, model: string, prefix: string, steering: Steering, signal: AbortSignal) {
  const apiKey = provider.keyStorage ? localStorage.getItem(provider.keyStorage)?.trim() : undefined
  const isSteered = steering.leads.length > 0 || steering.controls.length > 0
  const request = isSteered ? { ...STEERED_REQUEST, user: steeredUserMessage(prefix, steering) } : { ...STORY_REQUEST, user: prefix }
  let head: string | undefined = ""
  for await (const delta of provider.chat({ apiKey, model, ...request, signal })) {
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
