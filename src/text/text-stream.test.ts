import { describe, expect, it } from "vitest"
import { createTextStream, type GenerationOutcome, type Steering, type TextSource } from "./text-stream.ts"

const STEERING: Steering = { leads: [], controls: [] }

function sourceOf(chunks: string[]): TextSource {
  return {
    complete: async function* () {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** Yields one chunk, then waits for the abort signal before finishing. */
function hangingSource(): TextSource {
  return {
    complete: async function* (_prefix, _steering, signal) {
      yield "one "
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      yield "two "
    },
  }
}

describe("generate", () => {
  it("appends the source's chunks and reports done", async () => {
    const stream = createTextStream(sourceOf(["one ", "two ", "three "]), () => {})
    await expect(stream.generate("buffer low", STEERING)).resolves.toBe("done" satisfies GenerationOutcome)
    expect(stream.text).toBe("one two three ")
  })

  it("returns busy while a generation is running", async () => {
    const stream = createTextStream(hangingSource(), () => {})
    const first = stream.generate("buffer low", STEERING)
    await expect(stream.generate("buffer low", STEERING)).resolves.toBe("busy")
    stream.truncate(0)
    await expect(first).resolves.toBe("aborted")
  })
})

describe("truncate and restore", () => {
  it("restore re-appends the discarded tail after the kept words", async () => {
    const stream = createTextStream(sourceOf(["one two three four five "]), () => {})
    await stream.generate("buffer low", STEERING)
    stream.truncate(2)
    expect(stream.text).toBe("one two")
    expect(stream.restore({ words: 2, text: " three four five " })).toBe(true)
    expect(stream.text).toBe("one two three four five ")
  })

  it("restore refuses when the stream holds fewer words than the tail's cut point", () => {
    const stream = createTextStream(sourceOf([]), () => {})
    expect(stream.restore({ words: 5, text: "six " })).toBe(false)
    expect(stream.text).toBe("")
  })

  it("restore aborts a running generation and replaces the text", async () => {
    const stream = createTextStream(hangingSource(), () => {})
    const generating = stream.generate("buffer low", STEERING)
    expect(stream.restore({ words: 0, text: "kept " })).toBe(true)
    await expect(generating).resolves.toBe("aborted")
    expect(stream.text).toBe("kept ")
  })
})

describe("truncate with an expanded opening", () => {
  it("ignores a cut inside the opening unless the count is zero", async () => {
    const stream = createTextStream(
      {
        expand: (text) => (text ? text : "the known opening "),
        complete: async function* () {
          yield "continues "
        },
      },
      () => {},
    )
    await stream.generate("buffer low", STEERING)
    expect(stream.text).toBe("the known opening continues ")
    stream.truncate(1)
    expect(stream.text).toBe("the known opening continues ")
    stream.truncate(0)
    expect(stream.text).toBe("")
  })
})
