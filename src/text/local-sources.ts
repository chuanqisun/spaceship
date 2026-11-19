import type { ComparedStep } from "../engine/generation.ts"
import { streamEngine } from "../llm/local-engine.ts"
import { expandToStoryStart } from "../story/openings.ts"
import type { AttentionSource } from "./attention.ts"
import type { DimensionSource } from "./dimension.ts"
import type { InfluenceSource } from "./influence.ts"
import { nonSpaceLength } from "./inside.ts"
import type { RelevanceSource } from "./keyword-relevance.ts"
import type { RealizationSource } from "./realization.ts"
import type { TextSource } from "./text-stream.ts"

const MENU_SIZE = 5
/** Written where the model ended the story itself; nothing more is asked for past it. */
const END_MARK = " ∎"

/** Who follows a completion besides its reader: whether to compare it with the unsteered model, where it starts, and each compared token. Offsets count the story's non-space characters. */
type Watcher = { isOn: () => boolean; onStart: (at: number) => void; onStep: (at: number, length: number, step: ComparedStep) => void }

export function createLocalSource({ isOn, onStart, onStep }: Watcher): TextSource {
  return {
    /** A story that starts over keeps none of the last one's tokens. */
    expand(text) {
      const opening = expandToStoryStart(text)
      if (opening !== text) onStart(0)
      return opening
    },
    async *complete(prefix, steering, signal) {
      if (prefix.endsWith(END_MARK)) return
      let at = nonSpaceLength(prefix)
      onStart(at)
      for await (const { text, step, ended } of streamEngine("complete", { prefix, steering, compare: isOn() }, signal)) {
        if (ended) return yield END_MARK
        if (step) onStep(at, nonSpaceLength(text), step)
        if (!text) continue
        at += nonSpaceLength(text)
        yield text
      }
    },
  }
}

export const localAttention: AttentionSource = (text, signal) => streamEngine("attention", { text }, signal)

export const localInfluence: InfluenceSource = (sentences, focus, signal) => streamEngine("influence", { sentences, focus }, signal)

export const localRelevance: RelevanceSource = (request, signal) => streamEngine("relevance", request, signal)

export const localRealization: RealizationSource = (request, signal) => streamEngine("realization", request, signal)

export const localDimension: DimensionSource = ({ text, taken }, signal) => streamEngine("dimensions", { text, taken, size: MENU_SIZE }, signal)
