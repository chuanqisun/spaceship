import { chromium } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { appOf, fanOf } from "../scripts/capture/app.mjs"
import { createHand } from "../scripts/capture/hand.mjs"
import { poll, statusOf } from "./helpers.mjs"
import { flushCoverage, startCoverage, stopCoverage } from "./coverage.mjs"

/**
 * Coverage-driven pass over the flows the gesture suites only touch lightly: onboarding's idle attract and
 * hint persistence, sound feedback across a whole gesture vocabulary, and future knobs parking in the
 * margin — including the narrow-viewport fallback — on their way to pinning. Same hermetic rules: sim mode only.
 */
const VIEWPORT = { width: 1280, height: 800 }
const NARROW = { width: 320, height: 700 }
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

afterAll(async () => {
  flushCoverage("coverage")
  await browser?.close()
})

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
  await startCoverage(page)
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(inject("appUrl"))
  await page.waitForFunction(() => document.fonts.status === "loaded")
  app = appOf(page)
  hand = createHand(page)
  await app.measure()
  await hand.moveTo({ x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.7 }, { ms: 1 })
  await app.waitForBuffer()
  // A key press counts as engagement: it ends auto-reveal and the idle attract so tests start from a still knob.
  await page.keyboard.press("Shift")
  await page.waitForTimeout(150)
})

afterEach(async () => {
  await stopCoverage(page)
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

/** A page that has never been touched: no engagement, no saved session, onboarding runs its whole arc. */
async function freshPage() {
  // The harness page may already have saved a session into this context's storage; a returning reader
  // skips the first-run theatre, so clear it before the fresh page loads.
  await page.evaluate(() => localStorage.clear())
  const fresh = await context.newPage()
  fresh.on("pageerror", (error) => pageErrors.push(error.message))
  await fresh.goto(inject("appUrl"))
  await fresh.waitForFunction(() => document.fonts.status === "loaded")
  const freshApp = appOf(fresh)
  await freshApp.measure()
  await freshApp.waitForBuffer()
  return { fresh, freshApp, freshHand: createHand(fresh) }
}

describe("onboarding", () => {
  test("a first visit auto-reveals, hints, demonstrates the idle attract, and the hint fades on its own", async () => {
    const { fresh, freshApp } = await freshPage()

    // No input at all: the knob reveals buffered text by itself, then the hint appears beside it.
    await poll(async () => (await statusOf(fresh)).words, { timeout: 20000 }).toBeGreaterThanOrEqual(5)
    await fresh.waitForSelector("#hint[data-show]", { timeout: 20000 })

    // After a quiet spell the attract loop nudges the knob back and forth: the word count moves both ways.
    const seen = new Set()
    const deadline = Date.now() + 11000
    while (Date.now() < deadline && seen.size < 2) {
      seen.add((await statusOf(fresh)).words)
      await fresh.waitForTimeout(500)
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)

    // The hint lingers about seven seconds, then fades without any input.
    await poll(() => fresh.locator("#hint").evaluate((el) => el.hasAttribute("data-show")), { timeout: 12000 }).toBe(false)
    await freshApp.waitForKnobStill()
  })

  test("the dismissed hint stays dismissed across a reload, even with the session cleared", async () => {
    const { fresh, freshApp, freshHand } = await freshPage()
    await fresh.waitForSelector("#hint[data-show]", { timeout: 25000 })

    // The first real drag retires the hint forever.
    await freshHand.moveTo(await freshApp.knobCenter(), { ms: 1 })
    await freshHand.drag(freshApp.textPoint(6, 0.5))
    await poll(() => fresh.evaluate(() => localStorage.getItem("spaceship.hint-dismissed"))).toBe("dismissed")

    // A saved session would skip onboarding entirely; clearing it isolates the hint's own persistence.
    await fresh.evaluate(() => localStorage.removeItem("spaceship.session"))
    await fresh.reload()
    await fresh.waitForFunction(() => document.fonts.status === "loaded")
    const reloaded = appOf(fresh)
    await reloaded.measure()
    await reloaded.waitForBuffer()
    await poll(async () => (await statusOf(fresh)).words, { timeout: 20000 }).toBeGreaterThanOrEqual(5)

    // The reveal still runs, but the hint never comes back — not now, not after the attract delay.
    await fresh.waitForTimeout(9000)
    expect(await fresh.locator("#hint").evaluate((el) => el.hasAttribute("data-show"))).toBe(false)
    expect(await fresh.evaluate(() => localStorage.getItem("spaceship.hint-dismissed"))).toBe("dismissed")
  })
})

describe("future knobs", () => {
  test("a knob released in the dead zone is kept, and grabbing it again carries it through the gate", async () => {
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()
    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(50)
    await hand.press()
    await app.menuOptions()
    await hand.moveTo({ x: knob.x + 20, y: knob.y + 10 }, { ms: 200 })
    await hand.release()
    await poll(() => page.locator(".future").count()).toBe(1)
    await expect(page.locator(".future").getAttribute("aria-label")).resolves.toContain("choosing")

    // Second try: grab the kept knob and carry it past the gate so it takes a dimension.
    const kept = page.locator(".future").first()
    const box = await kept.boundingBox()
    await hand.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await hand.press()
    const main = await app.knobCenter()
    await hand.moveTo({ x: main.x + 170, y: main.y + 40 }, { ms: 800 })
    await hand.release()
    await poll(() => page.locator(".future[data-tuned]").count(), { timeout: 10000 }).toBe(1)
    const label = await page.locator(".future").getAttribute("aria-label")
    expect(SIMULATED_DIMENSIONS).toContain(label.match(/^future knob, (\w+):/)?.[1])
  })

  test("a tuned knob dropped on the text parks when covered, pins beside its sentence, and is removed when the knob rewinds", async () => {
    await dropTunedKnobOnText()
    await poll(() => page.locator(".future[data-parked]").count(), { timeout: 10000 }).toBe(1)

    // At phone width there is no gutter: the parked knob and its label stack inside the viewport's right edge.
    await page.setViewportSize(NARROW)
    await page.waitForTimeout(600)
    const narrow = await knobAndLabelBoxes()
    expect(narrow.length).toBeGreaterThanOrEqual(1)
    for (const { knob: knobRect, label: labelRect } of narrow) {
      for (const rect of [knobRect, labelRect]) {
        expect(rect.left).toBeGreaterThanOrEqual(-1)
        expect(rect.right).toBeLessThanOrEqual(NARROW.width + 1)
        expect(rect.top).toBeGreaterThanOrEqual(-1)
        expect(rect.bottom).toBeLessThanOrEqual(NARROW.height + 1)
      }
    }
    await page.setViewportSize(VIEWPORT)
    await page.waitForTimeout(400)

    // Reading on, the sentence under the knob delivers the setting surely enough: the knob pins beside it.
    for (const line of [12, 18, 24, 30]) {
      if (await page.locator(".future[data-pinned]").count()) break
      await app.scrubTo(line, 0.5)
      try {
        await poll(() => page.locator(".future[data-pinned]").count(), { timeout: 8000 }).toBe(1)
      } catch {
        // Not this sentence's turn yet; the next scrub moves the caret on.
      }
    }
    await poll(() => page.locator(".future[data-pinned]").count(), { timeout: 10000 }).toBe(1)
    const pinned = await knobAndLabelBoxes()
    for (const { knob: knobRect, label: labelRect } of pinned) {
      for (const rect of [knobRect, labelRect]) {
        expect(rect.left).toBeGreaterThanOrEqual(-1)
        expect(rect.right).toBeLessThanOrEqual(VIEWPORT.width + 1)
        expect(rect.top).toBeGreaterThanOrEqual(-1)
        expect(rect.bottom).toBeLessThanOrEqual(VIEWPORT.height + 1)
      }
    }

    // Rewinding before the pinned sentence discards it and removes the knob.
    await app.scrubTo(2, 0.5)
    await poll(() => page.locator(".future").count(), { timeout: 10000 }).toBe(0)
  })

  /** Spawns a knob, carries it through the fan's gate, and drops it on the shown text so the growing text covers it. */
  async function dropTunedKnobOnText() {
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()
    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(50)
    await hand.press()
    const options = await app.menuOptions()
    expect(options.map(({ label }) => label).every((label) => SIMULATED_DIMENSIONS.includes(label))).toBe(true)
    const fan = fanOf(knob, options)
    const chosenAt = fan.swingOf(options[0])
    await hand.moveTo(fan.at(chosenAt, 60), { ms: 400 })
    await hand.moveTo(fan.at(chosenAt, 160), { ms: 400 })
    // Inside the text column and well clear of the main knob, so the drop keeps it and the text covers it.
    await hand.moveTo(app.textPoint(4, 0.9), { ms: 600 })
    await hand.release()
    await poll(() => page.locator(".future[data-tuned]").count(), { timeout: 10000 }).toBe(1)
  }
})

describe("sound", () => {
  test("the toggle flips and a full pass of gestures runs every cue without errors", async () => {
    const toggle = page.locator("#sound-toggle")
    await toggle.click()
    await expect(toggle.getAttribute("aria-pressed")).resolves.toBe("false")
    await toggle.click()
    await expect(toggle.getAttribute("aria-pressed")).resolves.toBe("true")

    // Scrubbing ticks once per word crossed; grabbing and releasing the knob latch.
    await app.scrubTo(8, 0.7)

    // Expanding attention cascades a note per box; collapsing everything plays the collapse.
    await app.expandAttention()
    await poll(
      async () => {
        const first = (await statusOf(page)).boxes
        await page.waitForTimeout(600)
        const second = (await statusOf(page)).boxes
        return first === second ? first : -1
      },
      { timeout: 30000 },
    ).toBeGreaterThanOrEqual(3)
    const { boxes } = await statusOf(page)
    const [rect] = await app.keywordRects()
    await hand.moveTo({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
    await hand.doubleClick()
    await poll(async () => (await statusOf(page)).boxes, { timeout: 10000 }).toBe(boxes - 1)
    await hand.moveTo(await app.knobCenter(), { ms: 1 })
    await hand.doubleClick()
    await poll(async () => (await statusOf(page)).boxes, { timeout: 10000 }).toBe(0)

    // A future knob's whole life: spawn, menu, candidate ticks, tuning graduations and ruler,
    // the drag bed, hand-off on drop, and removal on double click.
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()
    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(50)
    await hand.press()
    const options = await app.menuOptions()
    const fan = fanOf(knob, options)
    const chosenAt = fan.swingOf(options[0])
    await hand.moveTo(fan.at(chosenAt, 60), { ms: 400 })
    await hand.moveTo(fan.at(chosenAt, 140), { ms: 400 })
    const dropAt = fan.at(0.4 * SWING_RADIANS, 170)
    await hand.moveTo(dropAt, { ms: 500 })
    await hand.release()
    await poll(() => page.locator(".future[data-tuned]").count(), { timeout: 10000 }).toBe(1)

    const future = page.locator(".future").first()
    const at = await future.boundingBox()
    await hand.moveTo({ x: at.x + at.width / 2, y: at.y + at.height / 2 })
    await hand.doubleClick()
    await poll(() => page.locator(".future").count(), { timeout: 10000 }).toBe(0)
  })
})

describe("steering", () => {
  test("pressing ahead of the knob pulls it there while the zone cue marks the region", async () => {
    await app.scrubTo(3, 0.5)
    const before = (await statusOf(page)).words
    const target = app.textPoint(9, 0.75)
    await hand.moveTo(target)
    await hand.press()
    await page.waitForFunction(() => document.querySelector("#zone-cue")?.hasAttribute("data-show"), null, { timeout: 5000 })
    await app.waitForKnobNear(target)
    await hand.release()
    expect((await statusOf(page)).words).toBeGreaterThan(before)
  })
})

/** Viewport boxes of every future knob and its label, for asserting the margin placement keeps them on screen. */
function knobAndLabelBoxes() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".future")].map((element) => {
      const knob = element.getBoundingClientRect().toJSON()
      const label = element.querySelector("span").getBoundingClientRect().toJSON()
      return { knob, label }
    }),
  )
}
