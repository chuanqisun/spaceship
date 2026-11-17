import { describe, expect, it } from "vitest"
import type { Control, Dimension } from "../text/dimension.ts"
import type { Steering } from "../text/text-stream.ts"
import { createSteeringDraft } from "./steering-bar.ts"

const tension: Dimension = { name: "tension", kind: "scale", low: "calm", high: "tense" }
const turn: Dimension = { name: "turn", kind: "choice", options: ["resolve", "suspend"] }

const control = (dimension: Dimension, position = 0.5, strength = 0.5): Control => ({ dimension, position, strength })

/** A draft over fixed slots with a steer spy; `focusedSlot` is read lazily like the real wiring. */
function draftWith(slots: number[], focusedSlot?: number) {
  const steered: { slot: number; steering: Steering }[] = []
  const draft = createSteeringDraft({
    slots: () => slots,
    focusedSlot: () => focusedSlot,
    steer: (slot, steering) => steered.push({ slot, steering }),
  })
  return { draft, steered }
}

describe("createSteeringDraft steering shape", () => {
  it("turns a non-empty phrase into one bracketed lead and passes controls through", () => {
    const { draft } = draftWith([0])
    const tuned = control(tension, 1, 0.8)

    draft.setPhrase("  the signal  ")
    draft.addControl(tuned)

    expect(draft.steering()).toEqual({ leads: [{ before: "", keyword: "the signal", after: "" }], controls: [tuned] })
  })

  it("produces empty leads for a blank phrase and no controls before edits", () => {
    const { draft } = draftWith([0])
    draft.setPhrase("   ")

    expect(draft.steering()).toEqual({ leads: [], controls: [] })
  })

  it("updates a control's position and strength and drops it on remove", () => {
    const { draft } = draftWith([0])
    draft.addControl(control(tension))
    draft.addControl(control(turn))

    draft.updateControl(0, { position: 0.9, strength: 0.2 })
    expect(draft.controls()[0]).toEqual(control(tension, 0.9, 0.2))

    draft.removeControl(0)
    expect(draft.controls()).toEqual([control(turn)])
    expect(draft.steering().controls).toEqual([control(turn)])
  })
})

describe("createSteeringDraft target resolution", () => {
  it("all mode fans the same steering out to every slot in one synchronous apply", () => {
    const { draft, steered } = draftWith([0, 1, 2, 3])
    draft.setPhrase("a bell")
    draft.addControl(control(tension, 1, 1))

    draft.apply()

    expect(steered.map(({ slot }) => slot)).toEqual([0, 1, 2, 3])
    for (const { steering } of steered) expect(steering).toEqual(draft.steering())
    expect(draft.action()).toEqual({ target: "all", steering: draft.steering() })
    expect(draft.targets()).toEqual([0, 1, 2, 3])
  })

  it("focused mode steers only the focused slot and leaves siblings untouched", () => {
    const { draft, steered } = draftWith([0, 1, 2], 1)
    draft.setMode("focused")
    draft.setPhrase("a bell")

    draft.apply()

    expect(steered).toEqual([{ slot: 1, steering: draft.steering() }])
    expect(draft.targets()).toEqual([1])
    expect(draft.action()).toEqual({ target: 1, steering: draft.steering() })
  })

  it("focused mode with no focused pane applies nothing", () => {
    const { draft, steered } = draftWith([0, 1])
    draft.setMode("focused")
    draft.setPhrase("a bell")

    expect(draft.targets()).toEqual([])
    expect(draft.action()).toBeUndefined()
    draft.apply()
    expect(steered).toEqual([])
  })

  it("ignores a focused slot that is no longer mounted", () => {
    const { draft, steered } = draftWith([0, 2], 1)
    draft.setMode("focused")

    draft.apply()

    expect(draft.targets()).toEqual([])
    expect(steered).toEqual([])
  })

  it("keeps edits local until apply: changing the phrase does not steer", () => {
    const { draft, steered } = draftWith([0, 1])

    draft.setPhrase("first")
    draft.addControl(control(tension))
    draft.updateControl(0, { position: 0 })

    expect(steered).toEqual([])
    expect(draft.action()?.steering).toEqual({ leads: [{ before: "", keyword: "first", after: "" }], controls: [control(tension, 0, 0.5)] })
  })
})
