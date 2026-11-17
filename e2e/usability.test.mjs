import { chromium } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { appOf } from "../scripts/capture/app.mjs"
import { createHand } from "../scripts/capture/hand.mjs"
import { statusOf } from "./helpers.mjs"

/**
 * Covers the usability remediation's new interactions: onboarding, the gesture legend, keyboard control,
 * ghost text and the steering-zone cue, the restore chip, session and sound persistence, the armed mode
 * toggle, reduced motion, and touch input. Same hermetic rules as ux.test.mjs: sim mode only.
 */
const VIEWPORT = { width: 1280, height: 800 }

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
  // A key press counts as engagement: it ends auto-reveal and the idle attract so tests start from a still knob.
  await page.keyboard.press("Shift")
  await page.waitForTimeout(150)
})

afterEach(async () => {
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

describe("first-time discovery", () => {
  test("a fresh page auto-reveals text, shows the hint, and the first drag retires it forever", async () => {
    const fresh = await context.newPage()
    fresh.on("pageerror", (error) => pageErrors.push(error.message))
    await fresh.goto(inject("appUrl"))
    await fresh.waitForFunction(() => document.fonts.status === "loaded")
    const freshApp = appOf(fresh)
    const freshHand = createHand(fresh)
    await freshApp.measure()
    await freshApp.waitForBuffer()

    // No input at all: the knob reveals text by itself.
    await expect.poll(async () => (await statusOf(fresh)).words, { timeout: 15000 }).toBeGreaterThanOrEqual(5)
    await fresh.waitForSelector("#hint[data-show]", { timeout: 15000 })

    await freshHand.moveTo(await freshApp.knobCenter(), { ms: 1 })
    await freshHand.drag(freshApp.textPoint(6, 0.5))
    await expect.poll(() => fresh.evaluate(() => localStorage.getItem("spaceship.hint-dismissed"))).toBe("dismissed")
    await expect(fresh.locator("#hint").evaluate((el) => el.hasAttribute("data-show"))).resolves.toBe(false)
  })
})

describe("gesture legend", () => {
  test("the tray button and h/? keys open the native dialog listing every gesture; Escape closes it", async () => {
    const terms = async () => page.locator("#legend dt").allTextContents()
    const isOpen = () => page.locator("#legend").evaluate((dialog) => dialog.open)

    await page.locator("#legend-toggle").click()
    await expect.poll(isOpen).toBe(true)
    expect(await terms()).toEqual(
      expect.arrayContaining([
        "drag the knob",
        "double-click the knob",
        "⌥-drag a selection",
        "drag an attention box",
        "double-click + hold the knob",
        "carry a future knob out",
        "double-click a future knob",
        "press past the knob + drag",
        "arrow keys",
        "enter",
        "h or ?",
        "tray",
      ]),
    )

    await page.keyboard.press("Escape")
    await expect.poll(isOpen).toBe(false)

    await page.keyboard.press("h")
    await expect.poll(isOpen).toBe(true)
    await page.keyboard.press("Escape")
    await expect.poll(isOpen).toBe(false)

    await page.keyboard.press("?")
    await expect.poll(isOpen).toBe(true)
    await page.locator("#legend button").click()
    await expect.poll(isOpen).toBe(false)
  })
})

describe("keyboard", () => {
  test("arrow keys nudge the knob one word at a time", async () => {
    await page.evaluate(() => document.activeElement?.blur())
    const before = (await statusOf(page)).words
    await page.keyboard.press("ArrowRight")
    await expect.poll(async () => (await statusOf(page)).words).toBe(before + 1)
    await page.keyboard.press("ArrowLeft")
    await expect.poll(async () => (await statusOf(page)).words).toBe(before)
  })

  test("enter expands attention and a second press collapses it", async () => {
    await app.scrubTo(6, 0.6)
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press("Enter")
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 20000 }).toBeGreaterThanOrEqual(1)
    await page.keyboard.press("Enter")
    await expect.poll(async () => (await statusOf(page)).boxes).toBe(0)
  })

  test("enter on a focused tray button activates the button, not attention", async () => {
    await app.scrubTo(6, 0.6)
    await page.locator("#sound-toggle").focus()
    await page.keyboard.press("Enter")
    await expect(page.locator("#sound-toggle").getAttribute("aria-pressed")).resolves.toBe("false")
    // The button kept the key: attention must not have been togged as a side effect.
    await page.waitForTimeout(2500)
    expect((await statusOf(page)).boxes).toBe(0)
  })

  test("keys typed into the legend dialog are left alone", async () => {
    await app.scrubTo(6, 0.6)
    await page.locator("#legend-toggle").click()
    const before = (await statusOf(page)).words
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    expect((await statusOf(page)).words).toBe(before)
    await page.keyboard.press("Escape")
  })
})

describe("steering affordances", () => {
  test("ghost text renders upcoming words and the zone cue marks the press-pull region", async () => {
    await app.scrubTo(6, 0.6)
    const ghost = page.locator("#text .ghost")
    await expect.poll(() => ghost.count()).toBe(1)
    expect((await ghost.textContent())?.trim().length).toBeGreaterThan(0)
    await expect(ghost.getAttribute("aria-hidden")).resolves.toBe("true")

    const metrics = await app.measure()
    await hand.moveTo({ x: metrics.left + metrics.width * 0.5, y: metrics.top + metrics.lineHeight * 20 })
    await page.waitForFunction(() => document.querySelector("#zone-cue")?.hasAttribute("data-show"))
    await hand.moveTo({ x: VIEWPORT.width / 2, y: VIEWPORT.height - 8 })
    await page.waitForFunction(() => !document.querySelector("#zone-cue")?.hasAttribute("data-show"))
  })
})

describe("forgiving interactions", () => {
  test("scrubbing back shows the restore chip, and clicking it brings the text back", async () => {
    await app.scrubTo(10, 0.8)
    await page.waitForTimeout(300)
    const before = (await statusOf(page)).words
    await app.scrubTo(3, 0.5)
    const chip = page.locator("#restore-chip")
    await expect.poll(() => chip.evaluate((el) => !el.hidden), { timeout: 5000 }).toBe(true)
    await chip.click()
    await expect.poll(async () => (await statusOf(page)).words, { timeout: 5000 }).toBe(before)
    await expect.poll(() => chip.evaluate((el) => el.hidden), { timeout: 5000 }).toBe(true)
  })
})

describe("persistence", () => {
  test("session state and the sound preference survive a reload", async () => {
    await app.scrubTo(8, 0.6)
    await page.waitForTimeout(1200)
    const words = (await statusOf(page)).words
    await page.locator("#sound-toggle").click()
    await expect(page.locator("#sound-toggle").getAttribute("aria-pressed")).resolves.toBe("false")

    await page.reload()
    await page.waitForFunction(() => document.fonts.status === "loaded")
    const reloaded = appOf(page)
    await reloaded.measure()
    await reloaded.waitForBuffer()
    await expect.poll(async () => (await statusOf(page)).words, { timeout: 15000 }).toBe(words)
    await expect(page.locator("#sound-toggle").getAttribute("aria-pressed")).resolves.toBe("false")
  })
})

describe("mode toggle", () => {
  test("with keys stored, the first click arms flight? and stands down; no dialog opens", async () => {
    await page.evaluate(() => {
      localStorage.setItem("cerebras-api-key", "test-key")
      localStorage.setItem("gemini-api-key", "test-key")
    })
    await page.locator("#mode-toggle").click()
    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("flight?")
    await expect(page.locator("#live-keys").evaluate((dialog) => dialog.open)).resolves.toBe(false)
    expect(new URL(page.url()).searchParams.get("live")).toBeNull()
    await page.waitForTimeout(2700)
    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("sim")
  })
})

describe("reduced motion", () => {
  test("suppresses decorative transitions while auto-reveal still works", async () => {
    const calm = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" })
    const calmPage = await calm.newPage()
    calmPage.on("pageerror", (error) => pageErrors.push(error.message))
    try {
      await calmPage.goto(inject("appUrl"))
      await calmPage.waitForFunction(() => document.fonts.status === "loaded")
      const transitionOf = (selector) => calmPage.locator(selector).evaluate((el) => getComputedStyle(el).transitionDuration)
      await expect(transitionOf("#pointer")).resolves.toBe("0s")
      await expect(transitionOf("#hint")).resolves.toBe("0s")
      const calmApp = appOf(calmPage)
      await calmApp.measure()
      await calmApp.waitForBuffer()
      await expect.poll(async () => (await statusOf(calmPage)).words, { timeout: 15000 }).toBeGreaterThanOrEqual(1)
    } finally {
      await calm.close()
    }
  })
})

describe("touch pointer parity", () => {
  test("a touch drag scrubs the knob, and press-hold spawns a knob that survives release in the dead zone", async () => {
    const touchContext = await browser.newContext({ viewport: VIEWPORT, hasTouch: true })
    const touchPage = await touchContext.newPage()
    touchPage.on("pageerror", (error) => pageErrors.push(error.message))
    try {
      await touchPage.goto(inject("appUrl"))
      await touchPage.waitForFunction(() => document.fonts.status === "loaded")
      const touchApp = appOf(touchPage)
      await touchApp.measure()
      await touchApp.waitForBuffer()
      // A tap in the empty corner engages onboarding without starting a gesture.
      const cdp = await touchContext.newCDPSession(touchPage)
      const corner = { x: VIEWPORT.width - 24, y: 80 }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: corner.x, y: corner.y, id: 1 }] })
      await touchPage.waitForTimeout(60)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await touchPage.waitForTimeout(300)
      const before = (await statusOf(touchPage)).words

      const knob = await touchApp.knobCenter()
      const target = touchApp.textPoint(8, 0.7)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: knob.x, y: knob.y, id: 2 }] })
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: knob.x + ((target.x - knob.x) * i) / 8, y: knob.y + ((target.y - knob.y) * i) / 8, id: 2 }],
        })
        await touchPage.waitForTimeout(50)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await touchPage.waitForTimeout(400)
      expect((await statusOf(touchPage)).words).toBeGreaterThan(before)

      // A tap engages onboarding; a still hold-and-drag spawns a future knob, and releasing inside the dead zone keeps it.
      const spawnAt = await touchApp.knobCenter()
      const tap = async (id) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: spawnAt.x, y: spawnAt.y, id }] })
        await touchPage.waitForTimeout(60)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      }
      await tap(3)
      await touchPage.waitForTimeout(150)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: spawnAt.x, y: spawnAt.y, id: 4 }] })
      await touchPage.waitForTimeout(800)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: spawnAt.x + 30, y: spawnAt.y + 12, id: 4 }],
      })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await expect.poll(() => touchPage.locator(".future").count(), { timeout: 10000 }).toBe(1)
    } finally {
      await touchContext.close()
    }
  })
})
