import { expect } from "vitest"

/** The status line's readings: words shown, words buffered past the knob, boxes, steering and pins. */
export function statusOf(page) {
  return page.evaluate(() => {
    const reading = (name) => document.querySelector(`#status [data-field="${name}"] b`)
    const words = reading("words")
    return {
      words: Number(words.firstChild?.textContent),
      buffer: Number(words.querySelector("small")?.textContent.replace("+", "")),
      boxes: Number(reading("boxes").textContent),
      steering: Number(reading("steering").textContent),
      pinned: Number(reading("pinned").textContent),
    }
  })
}

/**
 * Polls `fn` until a Vitest matcher passes or `timeout` elapses.
 * Drop-in replacement for Playwright's `expect.poll` inside Vitest e2e tests.
 */
export function poll(fn, { timeout = 5000, interval = 50 } = {}) {
  return new PollAssertion(fn, timeout, interval)
}

class PollAssertion {
  constructor(fn, timeout, interval, negate = false) {
    this.fn = fn
    this.timeout = timeout
    this.interval = interval
    this.negate = negate
  }

  get not() {
    return new PollAssertion(this.fn, this.timeout, this.interval, !this.negate)
  }

  toBe(...args) {
    return this.run("toBe", args)
  }

  toEqual(...args) {
    return this.run("toEqual", args)
  }

  toBeGreaterThan(...args) {
    return this.run("toBeGreaterThan", args)
  }

  toBeGreaterThanOrEqual(...args) {
    return this.run("toBeGreaterThanOrEqual", args)
  }

  toBeLessThan(...args) {
    return this.run("toBeLessThan", args)
  }

  toBeLessThanOrEqual(...args) {
    return this.run("toBeLessThanOrEqual", args)
  }

  toContain(...args) {
    return this.run("toContain", args)
  }

  toBeNull(...args) {
    return this.run("toBeNull", args)
  }

  toBeUndefined(...args) {
    return this.run("toBeUndefined", args)
  }

  toBeTruthy(...args) {
    return this.run("toBeTruthy", args)
  }

  toBeFalsy(...args) {
    return this.run("toBeFalsy", args)
  }

  async run(matcher, args) {
    const deadline = Date.now() + this.timeout
    while (Date.now() < deadline) {
      try {
        const value = await this.fn()
        const assertion = this.negate ? expect(value).not : expect(value)
        await assertion[matcher](...args)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, this.interval))
      }
    }
    const value = await this.fn()
    const assertion = this.negate ? expect(value).not : expect(value)
    await assertion[matcher](...args)
  }
}
