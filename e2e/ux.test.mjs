import { chromium } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { appOf, center, fanOf } from "../scripts/capture/app.mjs"
import { createHand } from "../scripts/capture/hand.mjs"

/**
 * Drives the simulator as a pilot would, with a human-paced pointer, and checks what each gesture leaves on the page.
 * Every model call is played by a simulated source; any request off the dev server fails the test.
 */
const VIEWPORT = { width: 1280, height: 800 }
const SIMULATED_DIMENSIONS = ["tension", "turn", "pace", "voice", "mood", "distance"]
/** Matches `SWING_RADIANS` in `src/text/future-hud.ts`. */
const SWING_RADIANS = Math.PI / 3

let browser
let context
let page
let app
let hand
let pageErrors
let offsiteRequests

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM })
})

afterAll(() => browser?.close())

beforeEach(async () => {
  context = await browser.newContext({ viewport: VIEWPORT })
  const appOrigin = new URL(inject("appUrl")).origin
  pageErrors = []
  offsiteRequests = []
  await context.route(
    (url) => url.origin !== appOrigin,
    (route) => (offsiteRequests.push(route.request().url()), route.abort()),
  )
  page = await context.newPage()
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(inject("appUrl"))
  await page.waitForFunction(() => document.fonts.status === "loaded")
  app = appOf(page)
  hand = createHand(page)
  await app.measure()
  await hand.moveTo({ x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.7 }, { ms: 1 })
  await app.waitForBuffer()
})

afterEach(async () => {
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

describe("simulator", () => {
  test("starts in sim mode with a continuation buffered past the knob", async () => {
    await expect(page.locator("#mode-toggle").getAttribute("aria-pressed")).resolves.toBe("false")
    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("sim")
    expect((await statusOf(page)).buffer).toBeGreaterThanOrEqual(10)
  })

  test("every control has an accessible name", async () => {
    const unnamed = await page.$$eval("button, a", (controls) =>
      controls.filter((control) => !(control.getAttribute("aria-label") || control.textContent?.trim())).map((control) => control.outerHTML),
    )
    expect(unnamed).toEqual([])
  })

  test("flight mode asks for keys in a native dialog, and cancelling stays in sim", async () => {
    await page.locator("#mode-toggle").click()
    await expect(page.locator("#live-keys").evaluate((dialog) => dialog.open)).resolves.toBe(true)
    await page.keyboard.press("Escape")
    await expect(page.locator("#live-keys").evaluate((dialog) => dialog.open)).resolves.toBe(false)
    expect(new URL(page.url()).searchParams.has("live")).toBe(false)
  })

  test("the sound toggle flips its pressed state", async () => {
    const toggle = page.locator("#sound-toggle")
    const before = await toggle.getAttribute("aria-pressed")
    await toggle.click()
    await expect(toggle.getAttribute("aria-pressed")).resolves.toBe(before === "true" ? "false" : "true")
  })
})

describe("scrubbing", () => {
  test("dragging the knob forward reveals buffered words at once", async () => {
    const before = (await statusOf(page)).words
    await app.scrubTo(10, 0.8)
    expect((await statusOf(page)).words).toBeGreaterThan(before + 40)
  })

  test("dragging back and resting discards the continuation, so scrubbing forward again shows new text", async () => {
    await app.scrubTo(10, 0.8)
    const first = await shownText(page)
    await app.scrubTo(3, 0.5)
    expect((await statusOf(page)).words).toBeLessThan(countWords(first))
    await app.waitForBuffer()
    await app.scrubTo(10, 0.8)
    const second = await shownText(page)
    expect(second.slice(0, 40)).toBe(first.slice(0, 40))
    expect(second).not.toBe(first)
  })

  test("pressing and holding ahead of the knob pulls it there word by word", async () => {
    await app.scrubTo(3, 0.5)
    const before = (await statusOf(page)).words
    const target = app.textPoint(9, 0.75)
    await hand.moveTo(target)
    await hand.press()
    await page.waitForFunction(() => document.querySelector("#cursor")?.hasAttribute("data-live"))
    await expect(page.locator("#cursor").getAttribute("data-zone")).resolves.toBe("ahead")
    await app.waitForKnobNear(target)
    await hand.release()
    const knob = await app.knobCenter()
    expect((await statusOf(page)).words).toBeGreaterThan(before)
    expect(Math.hypot(knob.x - target.x, knob.y - target.y)).toBeLessThan(40)
  })
})

describe("pointer", () => {
  test("over shown text it shows an I-beam; past the knob a tether leads to the nearest target", async () => {
    await app.scrubTo(6, 0.5)
    await hand.moveTo(app.textPoint(2, 0.3))
    await page.waitForFunction(() => document.querySelector("#cursor")?.dataset.zone === "text")
    await expect(page.locator("#cursor .ibeam").getAttribute("d")).resolves.toMatch(/\S/)

    await hand.moveTo(app.textPoint(8, 0.5))
    await page.waitForFunction(() => document.querySelector("#cursor")?.dataset.zone === "ahead")
    await page.waitForFunction(() => Number(document.querySelector("#cursor .tether")?.getAttribute("opacity")) > 0)
    await expect(page.locator("#cursor .ibeam").getAttribute("d")).resolves.toBe("")
  })
})

describe("attention boxes", () => {
  test("double clicking the knob expands boxes around keywords, and again collapses them", async () => {
    await app.scrubTo(10, 0.7)
    await app.expandAttention()
    expect((await statusOf(page)).boxes).toBeGreaterThanOrEqual(3)
    await hand.moveTo(await app.knobCenter())
    await hand.doubleClick()
    await page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) === 0)
    expect((await statusOf(page)).boxes).toBe(0)
  })

  test("dragging a box moves its keyword", async () => {
    await app.scrubTo(10, 0.7)
    await app.expandAttention()
    const before = await app.keywordRects()
    const box = center(before[0])
    await hand.moveTo(box)
    await hand.press()
    await hand.moveTo({ x: box.x + 90, y: box.y + (await app.lineHeight()) }, { ms: 800 })
    await hand.release()
    await expect.poll(() => app.keywordRects()).not.toEqual(before)
  })

  test("selecting shown text locks it as a new box", async () => {
    await app.scrubTo(10, 0.7)
    const start = app.textPoint(2, 0.02)
    await hand.moveTo({ x: start.x - 2, y: start.y })
    await hand.press()
    await hand.moveTo(app.textPoint(2, 0.4), { ms: 600 })
    await hand.release()
    await expect.poll(async () => (await statusOf(page)).boxes).toBe(1)
  })
})

describe("future knobs", () => {
  test("double click and hold opens the fan; carrying a knob through the gate tunes a dimension that steers the text", async () => {
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()
    const knob = await pullFutureKnob({ swing: 0.4, reach: 170 })
    await expect.poll(() => page.locator(".future[data-tuned]").count()).toBe(1)
    const label = await page.locator(".future").getAttribute("aria-label")
    expect(SIMULATED_DIMENSIONS).toContain(label.match(/^future knob, (\w+):/)?.[1])
    await expect.poll(async () => (await statusOf(page)).steering).toBe(1)

    await hand.moveTo(knob)
    await hand.doubleClick()
    await expect.poll(() => page.locator(".future").count()).toBe(0)
    expect((await statusOf(page)).steering).toBe(0)
  })

  test("a knob released before the gate is discarded", async () => {
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()
    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(120)
    await hand.press()
    await app.menuOptions()
    await hand.moveTo({ x: knob.x + 20, y: knob.y + 10 }, { ms: 200 })
    await hand.release()
    await expect.poll(() => page.locator(".future").count()).toBe(0)
  })

  /** Pulls a knob out of the main knob through the fan's first option, swings it to `swing` of its range and drops it `reach` px away; returns where it lies. */
  async function pullFutureKnob({ swing, reach }) {
    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(120)
    await hand.press()
    const options = await app.menuOptions()
    expect(options.map(({ label }) => label).every((label) => SIMULATED_DIMENSIONS.includes(label))).toBe(true)
    const fan = fanOf(knob, options)
    const chosenAt = fan.swingOf(options[0])
    await hand.moveTo(fan.at(chosenAt, 60), { ms: 400 })
    await hand.moveTo(fan.at(chosenAt, 140), { ms: 400 })
    const dropAt = fan.at(swing * SWING_RADIANS, reach)
    await hand.moveTo(dropAt, { ms: 500 })
    await hand.release()
    return dropAt
  }
})

/** The status line's readings: words shown, words buffered past the knob, and what steers the text. */
function statusOf(page) {
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

function shownText(page) {
  return page.locator("#text").evaluate((element) => element.textContent ?? "")
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}
