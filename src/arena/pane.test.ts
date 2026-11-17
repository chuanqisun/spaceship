import { describe, expect, it } from "vitest"
import type { TextSource } from "../text/text-stream.ts"
import { createPaneSession } from "./pane.ts"

function waitFor(condition: () => boolean, timeout = 4000) {
  const deadline = Date.now() + timeout
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      if (condition()) return resolve()
      if (Date.now() > deadline) return reject(new Error("waitFor timed out"))
      setTimeout(check, 10)
    }
    check()
  })
}

/** A source that fails every call, like a provider whose `chat` rejects. */
const failingSource: TextSource = {
  complete: async function* () {
    throw new Error("provider down")
  },
}

/** A source that streams a fixed continuation word by word. */
function wordSource(words: number, chunk = 10): TextSource {
  return {
    complete: async function* (_prefix, _steering, signal) {
      for (let sent = 0; sent < words; sent += chunk) {
        signal.throwIfAborted()
        yield ` ${Array.from({ length: Math.min(chunk, words - sent) }, (_, i) => `w${sent + i}`).join(" ")}`
      }
    },
  }
}

describe("createPaneSession", () => {
  it("keeps a sibling's stream untouched when one pane's chat rejects", async () => {
    const errors: unknown[] = []
    const failing = createPaneSession(failingSource, { onError: (error) => errors.push(error) })
    const healthy = createPaneSession(wordSource(120))

    await waitFor(() => healthy.wordCount() >= 120)
    await waitFor(() => errors.length > 0)

    expect(errors[0]).toBeInstanceOf(Error)
    expect(String(errors[0])).toContain("provider down")
    expect(failing.wordCount()).toBe(0)
    // The healthy pane finished its whole continuation while the failing one kept erroring.
    expect(healthy.text()).toContain("w119")
    expect(healthy.activity().isGenerating).toBe(false)

    healthy.destroy()
    failing.destroy()
  })

  it("aborts only its own stream on destroy", async () => {
    const hanging: TextSource = {
      complete: async function* (_prefix, _steering, signal) {
        yield " partial"
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
          setTimeout(resolve, 30)
        })
        signal.throwIfAborted()
        yield " tail"
      },
    }
    const first = createPaneSession(hanging)
    const second = createPaneSession(wordSource(50))

    await waitFor(() => first.wordCount() > 0)
    first.destroy()
    await waitFor(() => second.wordCount() >= 50)

    expect(first.wordCount()).toBe(0)
    expect(second.text()).toContain("w49")
    second.destroy()
  })

  it("reports the error in the pane and clears it on the next successful generate", async () => {
    let calls = 0
    let lastError: unknown = "unset"
    const flaky: TextSource = {
      complete: async function* () {
        calls++
        if (calls === 1) throw new Error("first attempt fails")
        yield " recovered words"
      },
    }
    const session = createPaneSession(flaky, { onError: (error) => (lastError = error) })

    await waitFor(() => lastError instanceof Error)
    expect(String(lastError)).toContain("first attempt fails")

    // The backoff retry lands on its own; the second attempt succeeds and clears the slot.
    await waitFor(() => session.wordCount() > 0 && lastError === undefined, 8000)
    expect(session.text()).toContain("recovered")
    session.destroy()
  })

  it("regenerates from the caret on steer and keeps the shared prefix", async () => {
    const session = createPaneSession(wordSource(200))
    await waitFor(() => session.wordCount() >= 200)
    const caret = session.caret()
    expect(caret).toBeGreaterThan(0)
    expect(caret).toBeLessThan(session.wordCount())

    session.steer({ leads: [{ before: "", keyword: "steered", after: "" }], controls: [] })
    await waitFor(() => session.activity().isGenerating)
    await waitFor(() => !session.activity().isGenerating && session.wordCount() > caret, 8000)

    expect(session.wordCount()).toBeGreaterThan(caret)
    session.destroy()
  })
})
