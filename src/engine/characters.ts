import { wordSpans } from "../text/segments.ts"
import { argmax } from "./analysis.ts"
import type { Engine } from "./model.ts"

const MAX_NAMES = 3
const MAX_WORDS_PER_NAME = 3
/** Names taken from the model's list to be checked, so that one it gets wrong does not cost a place. */
const MAX_LISTED = 5
const MAX_ANSWER_TOKENS = 40

/** The reply is started with the opening bracket, which keeps a small model to the list. */
const LIST_PROMPT = `The user message is the start of a story. Name who is in it: the people and animals that act, speak or are spoken of, most important first, at most 3. Use each one's name, or at most 3 words from the story when it has no name. Things, places, days and feelings are never listed. Answer with the list in square brackets, separated by " | ", and nothing else. When nobody is in the story yet, answer [].

EXAMPLE
User: The kettle screamed, but nobody came. Lena stood at the window with the lamp. Down the hall her uncle was shouting into the telephone, and the neighbour's cat sat on the radio watching him.
Assistant: [Lena | her uncle | the neighbour's cat]

EXAMPLE
User: High above the clouds, the wind combed the snow off the ridge and the valley filled slowly with light. A door banged somewhere in the empty hut.
Assistant: []`

const KIND_PROMPT = "Answer with one word: person, animal or thing."
const KINDS = { person: [" person", "person", "Person"], animal: [" animal", "animal", "Animal"], thing: [" thing", "thing", "Thing"] }

/**
 * Who is in a story, as the model names them. It is asked for a list, and a name is kept when it is made of the story's own words and the
 * model, asked again, calls it a person or an animal. Models this small still miss a character or name a thing now and then.
 */
export async function charactersOf(engine: Engine, story: string, signal?: AbortSignal) {
  const names: string[] = []
  for (const name of listed(await answer(engine, engine.chatTokens(LIST_PROMPT, story, "["), signal), story)) {
    if (names.length < MAX_NAMES && (await isCharacter(engine, story, name, signal))) names.push(name)
  }
  return names
}

async function answer(engine: Engine, prompt: number[], signal?: AbortSignal) {
  const cache = engine.emptyCache(1)
  const written: number[] = []
  let text = ""
  try {
    await engine.forward([prompt.slice(0, -1)], { cache, signal })
    let token = prompt.at(-1)!
    while (written.length < MAX_ANSWER_TOKENS && !/[\]\n]/.test(text)) {
      token = argmax((await engine.forward([[token]], { cache, signal })).logits[0])
      if (engine.stopIds.has(token)) break
      written.push(token)
      text = engine.decode(written)
    }
  } finally {
    engine.release(cache)
  }
  return text
}

function listed(answer: string, story: string) {
  const inStory = new Set(wordsOf(story))
  const names = new Map<string, string>()
  for (const name of answer.split("]")[0].split("|")) {
    const words = wordsOf(name)
    const isFromStory = words.length > 0 && words.length <= MAX_WORDS_PER_NAME && words.every((word) => inStory.has(word))
    // "Wren" and "Wren's grandmother" are two; "the dog" twice is one.
    if (isFromStory && !names.has(words.at(-1)!)) names.set(words.at(-1)!, name.trim())
  }
  return [...names.values()].slice(0, MAX_LISTED)
}

async function isCharacter(engine: Engine, story: string, name: string, signal?: AbortSignal) {
  const question = `${story}\n\nIn the story above, what is "${name}": a person, an animal or a thing?`
  const { logits } = await engine.forward([engine.chatTokens(KIND_PROMPT, question)], { signal })
  const likelihood = (words: string[]) => Math.max(...words.map((word) => logits[0][engine.encode(word)[0]]))
  return Math.max(likelihood(KINDS.person), likelihood(KINDS.animal)) > likelihood(KINDS.thing)
}

/** A possessive counts as the word it is made from: "the harbour-master" is in a story that only has "the harbour-master's lamp". */
function wordsOf(text: string) {
  return wordSpans(text).map(({ start, end }) =>
    text
      .slice(start, end)
      .toLowerCase()
      .replace(/['’]s$/, ""),
  )
}
