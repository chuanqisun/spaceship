import { delay } from "./completion.ts"
import { STORY_DIMENSIONS } from "../story/dimensions.ts"
import type { DimensionSource } from "./dimension.ts"

const MENU_SIZE = 5
const LATENCY_MS = 150
const DIMENSIONS = STORY_DIMENSIONS

export const simulatedDimension: DimensionSource = async function* ({ taken }, signal) {
  await delay(LATENCY_MS, signal)
  const takenNames = new Set(taken.map(({ name }) => name))
  const free = DIMENSIONS.filter(({ name }) => !takenNames.has(name))
  yield* (free.length ? free : DIMENSIONS).slice(0, MENU_SIZE)
}
