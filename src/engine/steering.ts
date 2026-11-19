import { CATALOG, gradeIndexOf, optionIndexAt, type Control, type Dimension } from "../text/dimension.ts"
import type { Setting } from "../text/realization.ts"
import { charactersOf } from "./characters.ts"
import { joined, LOCAL_STORY_PROMPT, type Engine } from "./model.ts"

/**
 * Steering vectors by contrastive activation addition: the same story openings are read under instructions for each pole or option, and the mean
 * difference of the layer outputs at the end of the story is the direction.
 */

type Direction = Record<number, Float32Array>

export type Vectors = Awaited<ReturnType<typeof findVectors>>

/** Returns what `make` works out, from where it was kept under `recipe` if it has been worked out before. */
type Keep = (recipe: string, make: () => Promise<Float32Array<ArrayBuffer>>) => Promise<Float32Array>

/**
 * Size of the push at full strength, as a share of the residual stream's typical norm at each steered layer. Tuned by eye
 * until the strongest push still wrote grammatical prose (0.2 does not).
 */
const GAIN = 0.12
const TAIL_TOKENS = 6
const FOCUS_CONTEXT_CHARS = 600
const FOCUS = "focus"
const NARRATOR = "narrator"
/** The third of the five grades a scale position is spoken as (see `gradeIndexOf`). */
const MIDWAY_GRADE = 2
const MENU_BATCH = 8

const OPENINGS = [
  "Mara had locked the kitchen an hour ago. Now",
  "The train pulled into the station and Theo",
  "On the last morning of summer, the lake",
  "The letter arrived on a Tuesday. Ines read it twice and",
  "Nobody had opened the attic in years, so when",
  "The market was crowded with the smell of bread and",
  "Grandpa's old radio crackled to life just as",
  "The ship's lights flickered over the dark water while",
]

/** The catalog's axes that are the same for every story. Its `focus` is made of a story's characters, when the menu offers it. */
export const GENERIC = CATALOG.filter((dimension) => dimension.name !== FOCUS)

export async function findVectors(engine: Engine, keep: Keep) {
  const { steerLayers, hidden } = engine
  const directions = new Map<string, Promise<Record<string, Direction>>>()
  const ends = await tails(OPENINGS, LOCAL_STORY_PROMPT, 1)
  const norms = Object.fromEntries(steerLayers.map((layer) => [layer, mean(ends.map((end) => Math.hypot(...end[layer])))]))

  return { directionsOf, residualAdds, push, targetOf, menu }

  /** A character focus is read against the story as it was when first offered, since its options name the story's people. */
  function directionsOf(dimension: Dimension, story = "") {
    const key = JSON.stringify(dimension)
    if (!directions.has(key))
      directions.set(key, dimension.name === FOCUS && story ? extract(dimension, [story.slice(-FOCUS_CONTEXT_CHARS)]) : keptDirections(dimension))
    return directions.get(key)!
  }

  // Directions found from the fixed openings depend only on what the recipe lists, so they are kept between visits.
  async function keptDirections(dimension: Dimension) {
    const values = dimension.kind === "scale" ? ["high"] : dimension.options
    const poles = dimension.kind === "scale" ? [dimension.high, dimension.low] : dimension.options
    const recipe = JSON.stringify([dimension.kind, poles.map((pole) => instruction(dimension, pole)), OPENINGS, LOCAL_STORY_PROMPT, TAIL_TOKENS, steerLayers])
    const kept = await keep(recipe, async () => {
      const found = await extract(dimension, OPENINGS)
      return joined(values.flatMap((value) => steerLayers.map((layer) => found[value][layer])))
    })
    let at = 0
    return Object.fromEntries(values.map((value) => [value, perLayer(() => kept.subarray(at, (at += hidden)))]))
  }

  async function extract(dimension: Dimension, contexts: string[]): Promise<Record<string, Direction>> {
    if (dimension.kind === "scale") {
      const high = await meanStates(instruction(dimension, dimension.high), contexts)
      const low = await meanStates(instruction(dimension, dimension.low), contexts)
      return { high: perLayer((layer) => unit(high[layer].map((value, i) => value - low[layer][i]))) }
    }
    const states: Direction[] = []
    for (const option of dimension.options) states.push(await meanStates(instruction(dimension, option), contexts))
    const center = perLayer((layer) => meanVector(states.map((state) => state[layer])))
    return Object.fromEntries(
      dimension.options.map((option, index) => [option, perLayer((layer) => unit(states[index][layer].map((value, i) => value - center[layer][i])))]),
    )
  }

  async function meanStates(guidance: string, contexts: string[]) {
    const ends = await tails(contexts, `${LOCAL_STORY_PROMPT} ${guidance}`, TAIL_TOKENS)
    return perLayer((layer) => meanVector(ends.map((end) => end[layer])))
  }

  /** Shorter stories are padded at the end, which the tokens before never see. */
  async function tails(stories: string[], system: string, count: number) {
    const rows = stories.map((story) => engine.storyTokens(story, system).ids)
    const length = Math.max(...rows.map((row) => row.length))
    const { residuals } = await engine.forward(
      rows.map((row) => [...row, ...Array<number>(length - row.length).fill(row.at(-1)!)]),
      { residuals: true },
    )
    return rows.map((row, index) =>
      perLayer((layer) => {
        const end = (index * length + row.length) * hidden
        return meanVector(Array.from({ length: count }, (_, back) => residuals[layer].subarray(end - (back + 1) * hidden, end - back * hidden)))
      }),
    )
  }

  async function residualAdds(controls: Control[], story = "") {
    const adds = perLayer(() => new Float32Array(hidden))
    for (const { dimension, position, strength } of controls) {
      const found = await directionsOf(dimension, story)
      const [value, amount] =
        dimension.kind === "scale" ? ["high", (2 * position - 1) * strength] : [dimension.options[optionIndexAt(dimension.options.length, position)], strength]
      const pushed = push(found[value], amount)
      for (const layer of steerLayers) adds[layer].forEach((_, i) => (adds[layer][i] += pushed[layer][i]))
    }
    return adds
  }

  function push(direction: Direction, amount: number) {
    return perLayer((layer) => direction[layer].map((value) => value * amount * GAIN * norms[layer]))
  }

  /**
   * What a knob set there asks of the text: the direction it is read along, and 1 toward the high pole or the option, -1 toward the low pole,
   * 0 where the knob's label says midway.
   */
  async function targetOf({ dimension, position }: Setting) {
    const found = await directionsOf(dimension)
    if (dimension.kind === "choice") return { direction: found[dimension.options[optionIndexAt(dimension.options.length, position)]], sign: 1 }
    return { direction: found.high, sign: Math.sign(gradeIndexOf(position) - MIDWAY_GRADE) }
  }

  /**
   * Ranked by how far a push either way moves the next-token distribution, averaged over a choice's options so that having more options is not
   * favored.
   */
  async function menu(text: string, taken: Dimension[], size: number, signal?: AbortSignal) {
    const takenNames = new Set(taken.map((dimension) => dimension.name.toLowerCase()))
    const free = GENERIC.filter((dimension) => !takenNames.has(dimension.name))
    const characters = takenNames.has(FOCUS) ? [] : await charactersOf(engine, text, signal)
    if (characters.length) free.push({ name: FOCUS, kind: "choice", options: [...characters, NARRATOR] })
    if (!free.length) return []

    const { ids } = engine.storyTokens(text)
    const tries: { name: string; direction: Direction }[] = []
    for (const dimension of free) {
      for (const direction of Object.values(await directionsOf(dimension, text))) tries.push({ name: dimension.name, direction })
    }
    const read = engine.emptyCache(1)
    const shifts = new Map<string, number[]>()
    try {
      await engine.forward([ids.slice(0, -1)], { cache: read, signal })
      for (let start = 0; start < tries.length; start += MENU_BATCH / 2) {
        const batch = tries.slice(start, start + MENU_BATCH / 2)
        const pushes = batch.flatMap(({ direction }) => [push(direction, 1), push(direction, -1)])
        const forked = await engine.forkCache(read, pushes.length)
        const { logits } = await engine
          .forward(
            pushes.map(() => [ids.at(-1)!]),
            { cache: forked, steer: perLayer((layer) => pushes.map((pushed) => pushed[layer])), signal },
          )
          .finally(() => engine.release(forked))
        batch.forEach(({ name }, index) => shifts.set(name, [...(shifts.get(name) ?? []), divergence(logits[2 * index], logits[2 * index + 1])]))
      }
    } finally {
      engine.release(read)
    }
    return free.sort((a, b) => mean(shifts.get(b.name)!) - mean(shifts.get(a.name)!)).slice(0, size)
  }

  function perLayer<T>(of: (layer: number) => T): Record<number, T> {
    return Object.fromEntries(steerLayers.map((layer) => [layer, of(layer)]))
  }
}

function instruction(dimension: Dimension, value: string) {
  if (dimension.name === FOCUS) return value === NARRATOR ? "Write the next passage from the narrator's view." : `Write the next passage following ${value}.`
  if (dimension.kind === "scale") return `Write the next passage so its ${dimension.name} is extremely ${value}.`
  return `Write the next passage as ${value} (${dimension.name}).`
}

function divergence(from: ArrayLike<number>, to: ArrayLike<number>) {
  const [p, q] = [logSoftmax(from), logSoftmax(to)]
  let sum = 0
  for (let i = 0; i < p.length; i++) sum += Math.exp(p[i]) * (p[i] - q[i])
  return sum
}

function logSoftmax(logits: ArrayLike<number>) {
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i])
  let total = 0
  for (let i = 0; i < logits.length; i++) total += Math.exp(logits[i] - max)
  const offset = max + Math.log(total)
  return Float64Array.from(logits, (value) => value - offset)
}

function unit(vector: Float32Array) {
  const norm = Math.hypot(...vector) + 1e-6
  return vector.map((value) => value / norm)
}

function meanVector(vectors: ArrayLike<number>[]) {
  const sum = new Float32Array(vectors[0].length)
  for (const vector of vectors) for (let i = 0; i < sum.length; i++) sum[i] += vector[i] / vectors.length
  return sum
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
