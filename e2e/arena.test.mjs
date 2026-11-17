import { chromium, devices } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { poll } from "./helpers.mjs"
import { flushCoverage, startCoverage, stopCoverage } from "./coverage.mjs"

/**
 * Drives the arena comparison page in sim mode: every model call is played by a simulated source,
 * so four panes stream hermetically with no keys or network. Any request off the dev server fails the test.
 */
const VIEWPORT = { width: 1280, height: 800 }
const IPHONE_16 = {
  userAgent: devices["iPhone 16"].userAgent,
  viewport: devices["iPhone 16"].viewport,
  screen: devices["iPhone 16"].screen,
  deviceScaleFactor: devices["iPhone 16"].deviceScaleFactor,
  isMobile: devices["iPhone 16"].isMobile,
  hasTouch: devices["iPhone 16"].hasTouch,
}
const FOUR_PANES = [0, 1, 2, 3].map((slot) => ({ slot, provider: "sim", model: "sim" }))

let browser
let context
let page
let pageErrors
let offsiteRequests

const arenaUrl = () => `${inject("appUrl")}arena.html`
const paneCount = (target = page) => target.locator(".pane").count()
const wordCounts = (target = page) => target.locator(".pane-text").evaluateAll((elements) => elements.map((el) => (el.textContent.match(/\S+/g) ?? []).length))
const paneTexts = (target = page) => target.locator(".pane-text").evaluateAll((elements) => elements.map((el) => el.textContent))
const generatingCount = () => page.locator(".pane-status[data-generating]").count()

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM })
})

afterAll(async () => {
  flushCoverage("arena")
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
  await context.addInitScript((configs) => localStorage.setItem("arena-panes", JSON.stringify(configs)), FOUR_PANES)
  page = await context.newPage()
  await startCoverage(page)
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(arenaUrl())
  await page.waitForFunction(() => document.fonts.status === "loaded")
})

afterEach(async () => {
  await stopCoverage(page)
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

describe("sim comparison", () => {
  test("renders 4 panes whose word counts grow, and a knob scrub regenerates only that pane", async () => {
    await poll(() => paneCount()).toBe(4)

    // Every pane streams its own continuation of the shared opening: counts climb together.
    const early = await wordCounts()
    expect(early.every((count) => count >= 0)).toBe(true)
    await poll(async () => (await wordCounts()).every((count) => count > 100), { timeout: 20000 }).toBe(true)
    await poll(generatingCount, { timeout: 20000 }).toBe(0)

    const before = await paneTexts()
    expect(new Set(before).size).toBe(4)

    // Scrub pane 0's caret knob back into the middle of its text and release: only it regenerates.
    const pane = page.locator(".pane").first()
    const knob = await pane.locator(".knob").boundingBox()
    const text = await pane.locator(".pane-text").boundingBox()
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2)
    await page.mouse.down()
    await page.mouse.move(text.x + text.width / 2, text.y + text.height * 0.35, { steps: 12 })
    await page.mouse.up()

    await poll(() => pane.locator(".pane-text").textContent(), { timeout: 20000 }).not.toBe(before[0])
    await poll(generatingCount, { timeout: 20000 }).toBe(0)

    const after = await paneTexts()
    expect(after[0]).not.toBe(before[0])
    expect(after.slice(1)).toEqual(before.slice(1))
  })
})

describe("shared steering", () => {
  test("steer-all regenerates every pane; focused mode leaves siblings untouched", async () => {
    await poll(() => paneCount()).toBe(4)
    await poll(() => paneTexts().then((texts) => texts.every((text) => (text.match(/\S+/g) ?? []).length > 100)), { timeout: 20000 }).toBe(true)
    await poll(generatingCount, { timeout: 20000 }).toBe(0)

    // "all" mode is the default: one apply fans the same steering out to every pane.
    await page.locator("#steer-phrase").fill("zephyr")
    await page.locator("#steer-apply").click()
    await poll(async () => (await paneTexts()).every((text) => text.includes("zephyr")), { timeout: 20000 }).toBe(true)
    await poll(generatingCount, { timeout: 20000 }).toBe(0)

    // Focused mode: only the clicked pane receives the next steering.
    await page.locator("#steer-target").click()
    expect(await page.locator("#steer-target").textContent()).toBe("focused pane")
    const beforeTexts = await paneTexts()
    const siblingsBefore = [beforeTexts[0], beforeTexts[2], beforeTexts[3]]
    await page.locator(".pane").nth(1).locator(".pane-text").click()
    await page.locator("#steer-phrase").fill("quokka")
    await page.locator("#steer-apply").click()

    await poll(async () => (await paneTexts())[1], { timeout: 20000 }).toContain("quokka")
    await poll(generatingCount, { timeout: 20000 }).toBe(0)

    const after = await paneTexts()
    expect(after[1]).toContain("quokka")
    for (const text of after.filter((_, index) => index !== 1)) expect(text).not.toContain("quokka")
    expect(after.slice(0, 1).concat(after.slice(2))).toEqual(siblingsBefore)
  })
})

describe("pane lifecycle", () => {
  test("remove a pane mid-run, add one through the picker, and reload restores the layout", async () => {
    await poll(() => paneCount()).toBe(4)
    await poll(() => paneTexts().then((texts) => texts.every((text) => text.length > 50)), { timeout: 20000 }).toBe(true)

    // Removing frees the slot without touching siblings.
    await page.locator(".pane").last().locator(".pane-remove").click()
    await poll(() => paneCount()).toBe(3)
    const survivors = await paneTexts()
    expect(survivors.every((text) => text.length > 50)).toBe(true)

    // Adding goes through the model picker and joins the shared opening.
    await page.locator("#add-pane").click()
    await poll(() => page.locator("#model-picker").evaluate((el) => el.open)).toBe(true)
    await page.locator("#picker-list button[data-model]").first().click()
    await poll(() => paneCount()).toBe(4)
    await poll(() => paneTexts().then((texts) => texts.every((text) => text.length > 20)), { timeout: 20000 }).toBe(true)

    // Reload restores the persisted pane count and providers.
    await page.reload()
    await page.waitForFunction(() => document.fonts.status === "loaded")
    await poll(() => paneCount(), { timeout: 10000 }).toBe(4)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("arena-panes")))
    expect(stored).toHaveLength(4)
    expect(stored.every((config) => config.provider === "sim")).toBe(true)
  })
})

describe("viewport capacity", () => {
  test("an iPhone-16 touch viewport shows one pane and a visible explanation; desktop still shows four", async () => {
    const phone = await browser.newContext(IPHONE_16)
    const phoneErrors = []
    const phoneOrigin = new URL(inject("appUrl")).origin
    await phone.route(
      (url) => url.origin !== phoneOrigin,
      (route) => route.abort(),
    )
    await phone.addInitScript((configs) => localStorage.setItem("arena-panes", JSON.stringify(configs)), FOUR_PANES)
    const phonePage = await phone.newPage()
    phonePage.on("pageerror", (error) => phoneErrors.push(error.message))
    try {
      await phonePage.goto(arenaUrl())
      await phonePage.waitForFunction(() => document.fonts.status === "loaded")

      await poll(() => phonePage.locator(".pane").count(), { timeout: 10000 }).toBe(1)
      const note = phonePage.locator("#capacity-note")
      await poll(() => note.evaluate((el) => !el.hidden), { timeout: 5000 }).toBe(true)
      expect(await note.textContent()).toContain("larger screen")
      expect(await phonePage.locator("#add-pane").isDisabled()).toBe(true)
      expect(await phonePage.locator("#add-pane").getAttribute("title")).toContain("larger screen")
      expect(phoneErrors).toEqual([])
    } finally {
      await phone.close()
    }

    // The desktop context from beforeEach kept its four panes.
    await poll(() => paneCount(), { timeout: 10000 }).toBe(4)
  })
})
