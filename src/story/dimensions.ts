import type { Dimension } from "../text/dimension.ts"

/** The story dimensions a steering bar can tune: generic enough for every provider's continuation prompt. */
export const STORY_DIMENSIONS: Dimension[] = [
  { name: "tension", kind: "scale", low: "calm", high: "tense" },
  { name: "turn", kind: "choice", options: ["resolve", "suspend", "twist"] },
  { name: "pace", kind: "scale", low: "lingering", high: "brisk" },
  { name: "voice", kind: "choice", options: ["action", "dialogue", "thought"] },
  { name: "mood", kind: "scale", low: "dark", high: "light" },
  { name: "distance", kind: "scale", low: "intimate", high: "detached" },
]
