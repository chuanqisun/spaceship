import { chromium, devices } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { appOf, fanOf } from "../scripts/capture/app.mjs"
import { createHand, createTouchHand } from "../scripts/capture/hand.mjs"
import { statusOf } from "./helpers.mjs"

/**
 * Drives the simulator on a phone-sized touch viewport, with every gesture sent as real touch input.
 * Every model call is played by a simulated source; any request off the dev server fails the test.
 */
const IPHONE_16 = {
  userAgent: devices["iPhone 16"].userAgent,
  viewport: devices["iPhone 16"].viewport,
  screen: devices["iPhone 16"].screen,
  deviceScaleFactor: devices["iPhone 16"].deviceScaleFactor,
  isMobile: devices["iPhone 16"].isMobile,
  hasTouch: devices["iPhone 16"].hasTouch,
}
const VIEWPORT = IPHONE_16.viewport
const LANDSCAPE = devices["iPhone 16 landscape"].viewport
/** Matches `SWING_RADIANS` in `src/text/future-hud.ts`. */
const SWING_RADIANS = Math.PI / 3
const SIMULATED_DIMENSIONS = ["tension", "turn", "pace", "voice", "mood", "distance"]

/** Selects the first words of the shown text programmatically — native touch selection is unreliable to script. */
function selectFirstWords(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector("#text"), NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode)
    const range = document.createRange()
    range.setStart(nodes[0], 0)
    range.setEnd(nodes[Math.min(1, nodes.length - 1)], Math.min(24, nodes[Math.min(1, nodes.length - 1)].textContent.length))
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

let browser
let context
let page
let app
let touch
let pageErrors
let offsiteRequests

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM })
})

afterAll(() => browser?.close())

beforeEach(async () => {
  context = await browser.newContext(IPHONE_16)
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
  touch = await createTouchHand(page)
  await app.measure()
  await app.waitForBuffer()
  // Any key press engages onboarding, so auto-reveal and the idle attract stop and word counts stay put.
  await page.keyboard.press("Shift")
  await page.waitForTimeout(150)
})

afterEach(async () => {
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

describe("layout", () => {
  test("lays out at device width: readable column, tray inside the viewport, no horizontal overflow", async () => {
    const layout = await page.evaluate(() => {
      const text = document.querySelector("#text").getBoundingClientRect()
      const tray = document.querySelector("#tray").getBoundingClientRect()
      const touch = document.querySelector("#touch-controls").getBoundingClientRect()
      const knob = document.querySelector("#pointer").getBoundingClientRect()
      return {
        inner: innerWidth,
        scroll: document.documentElement.scrollWidth,
        textWidth: text.width,
        trayLeft: tray.left,
        trayRight: tray.right,
        trayTop: tray.top,
        trayHeight: tray.height,
        bodyPaddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
        touchBottom: touch.bottom,
        knobLeft: knob.left,
        knobRight: knob.right,
        userAgent: navigator.userAgent,
        devicePixelRatio,
        screenWidth: screen.width,
        touchPoints: navigator.maxTouchPoints,
        coarse: matchMedia("(pointer: coarse)").matches,
      }
    })
    expect(layout.userAgent).toContain("iPhone")
    expect(layout.devicePixelRatio).toBe(3)
    expect(layout.screenWidth).toBe(393)
    expect(layout.touchPoints).toBeGreaterThan(0)
    expect(layout.coarse).toBe(true)
    expect(layout.inner).toBeLessThanOrEqual(430)
    expect(layout.scroll).toBeLessThanOrEqual(layout.inner + 1)
    expect(layout.textWidth).toBeGreaterThan(layout.inner * 0.6)
    expect(layout.trayLeft).toBeGreaterThanOrEqual(-1)
    expect(layout.trayRight).toBeLessThanOrEqual(layout.inner + 1)
    expect(layout.knobLeft).toBeGreaterThanOrEqual(-1)
    expect(layout.knobRight).toBeLessThanOrEqual(layout.inner + 1)
    expect(layout.bodyPaddingBottom).toBeGreaterThanOrEqual(layout.trayHeight - 1)
    expect(layout.touchBottom).toBeLessThanOrEqual(layout.trayTop + 1)
  })

  test("rotating to landscape reflows the text, keeps the caret, and stays inside the viewport", async () => {
    const words = (await statusOf(page)).words
    await page.setViewportSize(LANDSCAPE)
    await page.waitForTimeout(400)
    const layout = await page.evaluate(() => ({
      inner: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(layout.inner).toBeGreaterThan(700)
    expect(layout.inner).toBeLessThanOrEqual(900)
    expect(layout.scroll).toBeLessThanOrEqual(layout.inner + 1)
    expect((await statusOf(page)).words).toBe(words)
    const knob = await app.knobCenter()
    expect(knob.x).toBeGreaterThanOrEqual(0)
    expect(knob.x).toBeLessThanOrEqual(LANDSCAPE.width)
    expect(knob.y).toBeGreaterThanOrEqual(0)
    expect(knob.y).toBeLessThanOrEqual(LANDSCAPE.height)
  })

  test("the legend and launch dialogs fit the iPhone 16 viewport", async () => {
    const inside = (selector) =>
      page.locator(selector).evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect()
        return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
      })

    await page.locator("#legend-toggle").click()
    await expect.poll(() => page.locator("#legend").evaluate((dialog) => dialog.open)).toBe(true)
    await expect.poll(() => inside("#legend")).toBe(true)
    await page.keyboard.press("Escape")

    await page.locator("#mode-toggle").click()
    await expect.poll(() => page.locator("#live-keys").evaluate((dialog) => dialog.open)).toBe(true)
    await expect.poll(() => inside("#live-keys")).toBe(true)
    await page.keyboard.press("Escape")
  })

  test("the legend and launch dialogs fit inside a 320px viewport", async () => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.waitForTimeout(300)
    const inside = (selector) =>
      page.locator(selector).evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect()
        return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
      })

    await page.locator("#legend-toggle").click()
    await expect.poll(() => page.locator("#legend").evaluate((dialog) => dialog.open)).toBe(true)
    await expect.poll(() => inside("#legend")).toBe(true)
    await page.keyboard.press("Escape")

    await page.locator("#mode-toggle").click()
    await expect.poll(() => page.locator("#live-keys").evaluate((dialog) => dialog.open)).toBe(true)
    await expect.poll(() => inside("#live-keys")).toBe(true)
    await page.keyboard.press("Escape")
    await page.setViewportSize(VIEWPORT)
  })
})

describe("session restore", () => {
  test("a session saved at desktop width restores caret, boxes and a future knob inside the narrow viewport", async () => {
    // Build real session state at desktop width: scrub, then let the debounced save land.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(600) // let the reading-position scroll settle before aiming
    await app.measure()
    await app.scrubTo(8, 0.6)
    await page.waitForTimeout(1200)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("spaceship.session") ?? "null"))
    expect(saved?.caretWords).toBeGreaterThan(0)

    // The stream's text is random per load, so restored boxes only survive on keywords likely to reappear;
    // pad the session with common dictionary words and one deterministic future knob.
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("spaceship.session"))
      state.future = [{ dimension: "tension", position: 0.5, strength: 0.5 }]
      state.attention = [...(state.attention ?? []), ...["in", "et", "ut", "sed", "eu", "ex", "ad", "sit"].map((keyword) => ({ keyword, before: 1, after: 1 }))]
      localStorage.setItem("spaceship.session", JSON.stringify(state))
    })

    await page.setViewportSize(VIEWPORT)
    await page.reload()
    await page.waitForFunction(() => document.fonts.status === "loaded")
    const restored = appOf(page)
    await restored.measure()
    await restored.waitForBuffer()
    await expect.poll(async () => (await statusOf(page)).words, { timeout: 30000 }).toBe(saved.caretWords)
    await expect.poll(() => page.locator(".future").count(), { timeout: 15000 }).toBe(1)

    const onScreen = await page.evaluate(() => {
      const inside = (element) => {
        const rect = element.getBoundingClientRect()
        return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
      }
      return {
        caretKnob: inside(document.querySelector("#pointer")),
        futureKnobs: [...document.querySelectorAll(".future")].map(inside),
        tray: inside(document.querySelector("#tray")),
        boxes: document.querySelectorAll(".future").length >= 0 ? (CSS.highlights.get("attention-word")?.size ?? 0) : -1,
      }
    })
    expect(onScreen.caretKnob).toBe(true)
    expect(onScreen.futureKnobs).toEqual([true])
    expect(onScreen.tray).toBe(true)
    expect(onScreen.boxes).toBeGreaterThanOrEqual(1)
  })
})

describe("scrubbing", () => {
  test("a touch drag on the knob reveals buffered words", async () => {
    const before = (await statusOf(page)).words
    await app.scrubToTouch(10, 0.8, touch)
    expect((await statusOf(page)).words).toBeGreaterThan(before + 20)
  })

  test("pressing and holding in the ahead region pulls the knob there, with the zone cue showing", async () => {
    await app.scrubToTouch(3, 0.5, touch)
    const before = (await statusOf(page)).words
    const target = app.textPoint(9, 0.75)
    await touch.moveTo(target, { ms: 1 })
    await touch.press()
    await page.waitForFunction(() => document.querySelector("#zone-cue")?.hasAttribute("data-show"), null, { timeout: 5000 })
    await app.waitForKnobNear(target)
    await touch.release()
    expect((await statusOf(page)).words).toBeGreaterThan(before)
  })
})

describe("attention", () => {
  test("a tap on the knob expands attention highlights, and another tap collapses them", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    const knob = await app.knobCenter()
    await touch.tap(knob.x, knob.y)
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(3)

    const again = await app.knobCenter()
    await touch.tap(again.x, again.y)
    await page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) === 0)
    expect((await statusOf(page)).boxes).toBe(0)
  })

  test("a touch selection offers a box action that locks the words as an attention box", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    // The box action only appears for selections made while the last pointer on the text was a finger;
    // native touch text selection is unreliable to script, so a real tap marks the modality and the
    // selection itself is set programmatically.
    const spot = app.textPoint(2, 0.5)
    await touch.tap(spot.x, spot.y)
    await selectFirstWords(page)
    const boxAction = page.locator("#box-action")
    await boxAction.waitFor({ state: "visible", timeout: 5000 })
    const at = await boxAction.boundingBox()
    await touch.tap(at.x + at.width / 2, at.y + at.height / 2)
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(1)
  })

  test("the ⊞ touch control commits a selection into an attention box and disables without one", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    const boxButton = page.locator("#touch-box")
    await boxButton.waitFor({ state: "visible", timeout: 5000 })
    await expect.poll(() => boxButton.isDisabled()).toBe(true)

    const spot = app.textPoint(2, 0.5)
    await touch.tap(spot.x, spot.y)
    await selectFirstWords(page)
    await expect.poll(() => boxButton.isDisabled(), { timeout: 5000 }).toBe(false)
    const at = await boxButton.boundingBox()
    await touch.tap(at.x + at.width / 2, at.y + at.width / 2)
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(() => boxButton.isDisabled(), { timeout: 5000 }).toBe(true)
  })

  test("a still press on an attention box deletes it, and a tap reports its keyword", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    await page.locator("#touch-controls [data-expand]").tap()
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(3)
    // Expansion keeps adding boxes after the first few; wait until the count holds still before comparing.
    await expect
      .poll(
        async () => {
          const first = (await statusOf(page)).boxes
          await page.waitForTimeout(600)
          const second = (await statusOf(page)).boxes
          return first === second ? first : -1
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(3)

    const [rect] = await app.keywordRects()
    expect(rect).toBeTruthy()
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const before = (await statusOf(page)).boxes

    // A quick tap names the box's keyword in the status line instead of deleting.
    await touch.tap(x, y)
    await expect.poll(() => page.locator("#status").textContent(), { timeout: 5000 }).toContain("box:")
    expect((await statusOf(page)).boxes).toBe(before)

    await touch.longPress(x, y, 800)
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 5000 }).toBe(before - 1)
  })
})

describe("future knobs", () => {
  test("a long press on the knob spawns a future knob without a double tap", async () => {
    await app.scrubToTouch(7, 0.55, touch)
    const knob = await app.knobCenter()
    await touch.longPress(knob.x, knob.y, 700)
    await expect.poll(() => page.locator(".future").count(), { timeout: 10000 }).toBeGreaterThanOrEqual(1)
  })

  test("a spawned knob tunes through the fan by touch, and a tap deletes it", async () => {
    await app.scrubToTouch(7, 0.55, touch)
    const knob = await app.knobCenter()
    await touch.moveTo({ x: knob.x, y: knob.y }, { ms: 1 })
    await touch.press()
    const options = await app.menuOptions()
    expect(options.map(({ label }) => label).every((label) => SIMULATED_DIMENSIONS.includes(label))).toBe(true)
    const fan = fanOf(knob, options)
    const chosenAt = fan.swingOf(options[0])
    await touch.moveTo(fan.at(chosenAt, 60), { ms: 400 })
    await touch.moveTo(fan.at(chosenAt, 160), { ms: 400 })
    const dropAt = fan.at(0.4 * SWING_RADIANS, 170)
    await touch.moveTo(dropAt, { ms: 500 })
    await touch.release()
    await expect.poll(() => page.locator(".future[data-tuned]").count(), { timeout: 10000 }).toBe(1)

    const future = page.locator(".future").first()
    const at = await future.boundingBox()
    const knobAt = { x: at.x + at.width / 2, y: at.y + at.height / 2 }
    // A tap with no drag pins the HUD readout the way hover does for a mouse.
    await touch.tap(knobAt.x, knobAt.y)
    await expect.poll(() => page.locator("#future-hud").evaluate((hud) => hud.childElementCount), { timeout: 5000 }).toBeGreaterThan(0)
    // A still ~500 ms press deletes where a mouse double clicks.
    await touch.longPress(knobAt.x, knobAt.y, 800)
    await expect.poll(() => page.locator(".future").count(), { timeout: 5000 }).toBe(0)
  })
})

describe("touch controls", () => {
  test("the on-screen nudge buttons move the caret a word at a time", async () => {
    const next = page.locator('#touch-controls [data-nudge="1"]')
    const back = page.locator('#touch-controls [data-nudge="-1"]')
    await next.waitFor({ state: "visible", timeout: 5000 })
    const before = (await statusOf(page)).words
    let at = await next.boundingBox()
    await touch.tap(at.x + at.width / 2, at.y + at.height / 2)
    await expect.poll(async () => (await statusOf(page)).words).toBeGreaterThan(before)
    const forward = (await statusOf(page)).words
    at = await back.boundingBox()
    await touch.tap(at.x + at.width / 2, at.y + at.height / 2)
    await expect.poll(async () => (await statusOf(page)).words).toBeLessThan(forward)
  })

  test("pressing and holding a nudge button repeats the nudge continuously", async () => {
    const next = page.locator('#touch-controls [data-nudge="1"]')
    await next.waitFor({ state: "visible", timeout: 5000 })
    const at = await next.boundingBox()
    const before = (await statusOf(page)).words
    await touch.moveTo({ x: at.x + at.width / 2, y: at.y + at.height / 2 }, { ms: 1 })
    await touch.press()
    await expect.poll(() => next.getAttribute("data-holding"), { timeout: 5000 }).not.toBeNull()
    await page.waitForTimeout(1200)
    await touch.release()
    await expect.poll(() => next.getAttribute("data-holding"), { timeout: 5000 }).toBeNull()
    // A hold repeats well past the single word a quick tap nudges.
    await expect.poll(async () => (await statusOf(page)).words - before, { timeout: 5000 }).toBeGreaterThan(2)
  })

  test("dragging up while holding speeds the nudge and dragging down slows it", async () => {
    const next = page.locator('#touch-controls [data-nudge="1"]')
    await next.waitFor({ state: "visible", timeout: 5000 })
    const at = await next.boundingBox()
    const pressPoint = { x: at.x + at.width / 2, y: at.y + at.height / 2 }
    const fillOf = () => next.evaluate((el) => parseFloat(el.style.getPropertyValue("--fill")))
    await touch.moveTo(pressPoint, { ms: 1 })
    await touch.press()
    await expect.poll(() => next.getAttribute("data-holding"), { timeout: 5000 }).not.toBeNull()
    // Let the repeat arm before reading the speed gauge.
    await page.waitForTimeout(500)
    const armed = await fillOf()

    await touch.moveTo({ x: pressPoint.x, y: pressPoint.y - 120 }, { ms: 300 })
    await expect.poll(fillOf, { timeout: 5000 }).toBeGreaterThan(armed)

    await touch.moveTo({ x: pressPoint.x, y: pressPoint.y + 60 }, { ms: 300 })
    await expect.poll(fillOf, { timeout: 5000 }).toBeLessThan(armed)

    await touch.release()
    await expect.poll(() => next.getAttribute("data-holding"), { timeout: 5000 }).toBeNull()
    await expect.poll(() => next.evaluate((el) => el.style.getPropertyValue("--fill")), { timeout: 5000 }).toBe("")
  })

  test("the on-screen expand button toggles attention", async () => {
    const expand = page.locator("#touch-controls [data-expand]")
    await expand.waitFor({ state: "visible", timeout: 5000 })
    await app.scrubToTouch(10, 0.7, touch)
    const at = await expand.boundingBox()
    await touch.tap(at.x + at.width / 2, at.y + at.height / 2)
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(3)
    await touch.tap(at.x + at.width / 2, at.y + at.height / 2)
    await page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) === 0)
    expect((await statusOf(page)).boxes).toBe(0)
  })
})

describe("native gesture harmony", () => {
  test("a vertical pan over the text scrolls the page instead of steering", async () => {
    // Enough text must be showing for the page to scroll at all.
    await app.scrubToTouch(28, 0.95, touch)
    const scrollable = await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight + 60)
    expect(scrollable).toBe(true)

    const before = await page.evaluate(() => scrollY)
    const spot = app.textPoint(2, 0.5)
    await touch.moveTo(spot, { ms: 1 })
    await touch.press()
    // Finger moves up: the page follows, scrolling down.
    await touch.moveTo({ x: spot.x, y: spot.y - 320 }, { ms: 500 })
    await touch.release()
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBeGreaterThan(before + 30)
  })

  test("a vertical pan in the ahead zone still scrolls rather than pulling", async () => {
    await app.scrubToTouch(28, 0.95, touch)
    const scrollable = await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight + 60)
    expect(scrollable).toBe(true)

    // Below the last shown line is the empty ahead zone: a press there shows the zone cue, but a
    // vertical drag must still scroll natively instead of steering the knob.
    const spot = { x: app.textPoint(0, 0.5).x, y: VIEWPORT.height - 140 }
    const before = await page.evaluate(() => scrollY)
    await touch.moveTo(spot, { ms: 1 })
    await touch.press()
    await touch.moveTo({ x: spot.x, y: spot.y - 320 }, { ms: 500 })
    await touch.release()
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBeGreaterThan(before + 30)
  })

  test("gesture chrome suppresses the native callout and context menu, and the text stays selectable", async () => {
    // Headless Chromium fires no contextmenu for synthetic touches, so the prevention wiring is
    // checked directly: dispatchEvent returns false when a listener canceled the event.
    // -webkit-touch-callout is WebKit-only: Chromium drops it when parsing, so check the raw stylesheet text.
    const suppressed = await page.evaluate(() => {
      const css = [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n")
      const callout = css.split("}").filter((block) => block.includes("-webkit-touch-callout"))
      const menu = (selector, pointerType) =>
        !document.querySelector(selector).dispatchEvent(new PointerEvent("contextmenu", { bubbles: true, cancelable: true, pointerType }))
      const chrome = ["#pointer", "#tray", "#legend", "#box-action"]
      return {
        callout,
        menu: Object.fromEntries(chrome.map((selector) => [selector, menu(selector, "touch")])).valueOf(),
        text: menu("#text", "touch"),
        // A mouse right-click or a keyboard-invoked menu (no pointer type) keeps its native menu everywhere.
        mouse: Object.fromEntries([...chrome, "#text"].map((selector) => [selector, menu(selector, "mouse")])).valueOf(),
        key: Object.fromEntries([...chrome, "#text"].map((selector) => [selector, menu(selector, "")])).valueOf(),
      }
    })
    expect(suppressed.callout.some((rule) => rule.includes(".knob") && rule.includes("none"))).toBe(true)
    expect(suppressed.callout.some((rule) => rule.includes("#tray") && rule.includes("none"))).toBe(true)
    expect(suppressed.callout.some((rule) => rule.includes("dialog") && rule.includes("none"))).toBe(true)
    expect(suppressed.menu).toEqual({ "#pointer": true, "#tray": true, "#legend": true, "#box-action": true })
    expect(suppressed.text).toBe(false)
    expect(Object.values(suppressed.mouse)).toEqual([false, false, false, false, false])
    expect(Object.values(suppressed.key)).toEqual([false, false, false, false, false])

    // A long press on the knob still spawns its future knob — the gesture is not eaten by the guards.
    const knob = await app.knobCenter()
    await touch.longPress(knob.x, knob.y, 800)
    await expect.poll(() => page.locator(".future").count(), { timeout: 10000 }).toBeGreaterThanOrEqual(1)

    // #text keeps native selection: a programmatic range still selects.
    await selectFirstWords(page)
    const selected = await page.evaluate(() => {
      const selection = getSelection()
      return selection.rangeCount === 1 && !selection.isCollapsed
    })
    expect(selected).toBe(true)
    await page.evaluate(() => getSelection().removeAllRanges())
  })
})

describe("desktop regression", () => {
  test("a mouse context still gets the custom cursor and the desktop gestures", async () => {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const desktopPage = await desktop.newPage()
    desktopPage.on("pageerror", (error) => pageErrors.push(error.message))
    try {
      const appOrigin = new URL(inject("appUrl")).origin
      await desktop.route(
        (url) => url.origin !== appOrigin,
        (route) => (offsiteRequests.push(route.request().url()), route.abort()),
      )
      await desktopPage.goto(inject("appUrl"))
      await desktopPage.waitForFunction(() => document.fonts.status === "loaded")
      const desktopApp = appOf(desktopPage)
      await desktopApp.measure()
      await desktopApp.waitForBuffer()
      await desktopPage.keyboard.press("Shift")
      await desktopPage.waitForTimeout(150)

      await desktopPage.mouse.move(500, 400)
      await desktopPage.waitForTimeout(300)
      expect(await desktopPage.evaluate(() => document.documentElement.dataset.cursor)).toBe("custom")

      // Desktop expand is a double click on the knob; no touch controls should appear.
      expect(await desktopPage.locator("#touch-controls").isVisible()).toBe(false)
      await desktopApp.scrubTo(10, 0.7)
      const hand = createHand(desktopPage)
      await hand.moveTo(await desktopApp.knobCenter(), { ms: 1 })
      await hand.doubleClick()
      await desktopApp.waitForBoxes()
      expect((await statusOf(desktopPage)).boxes).toBeGreaterThanOrEqual(3)
    } finally {
      await desktop.close()
    }
  })
})

describe("gesture legend", () => {
  test("the touch gesture rows are listed and visible on a coarse pointer", async () => {
    await page.locator("#legend-toggle").click()
    await expect.poll(() => page.locator("#legend").evaluate((dialog) => dialog.open)).toBe(true)
    const rows = page.locator("#legend .touch-only")
    expect(await rows.count()).toBeGreaterThan(0)
    expect(await rows.first().isVisible()).toBe(true)
    expect(await rows.first().textContent()).toContain("touch:")
  })
})

describe("remediated areas", () => {
  test("pinch-zoom stays allowed on the text column", async () => {
    const touchAction = await page.locator("#text").evaluate((element) => getComputedStyle(element).touchAction)
    expect(touchAction).toContain("pan-y")
    expect(touchAction).toContain("pinch-zoom")
  })

  test("the touch controls clear the wrapped tray", async () => {
    const layout = await page.evaluate(() => {
      const controls = document.querySelector("#touch-controls")
      const tray = document.querySelector("#tray").getBoundingClientRect()
      const rect = controls.getBoundingClientRect()
      return { display: getComputedStyle(controls).display, bottom: rect.bottom, trayTop: tray.top }
    })
    expect(layout.display).not.toBe("none")
    expect(layout.bottom).toBeLessThanOrEqual(layout.trayTop + 1)
  })

  test("a non-empty caret keeps its word count across a rotation resize", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    const before = (await statusOf(page)).words
    expect(before).toBeGreaterThan(0)
    await page.setViewportSize(LANDSCAPE)
    await page.waitForTimeout(500)
    expect((await statusOf(page)).words).toBe(before)
    await page.setViewportSize(VIEWPORT)
    await page.waitForTimeout(400)
    expect((await statusOf(page)).words).toBe(before)
  })

  test("a touch drag moves an attention box vertically without scrolling the page", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    await page.locator("#touch-controls [data-expand]").tap()
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(3)
    await expect
      .poll(
        async () => {
          const first = (await statusOf(page)).boxes
          await page.waitForTimeout(600)
          const second = (await statusOf(page)).boxes
          return first === second ? first : -1
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(3)

    const before = await app.keywordRects()
    expect(before.length).toBeGreaterThan(0)
    const rect = before[0]
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const dropY = y + 2 * (await app.lineHeight())
    const scrollBefore = await page.evaluate(() => scrollY)

    await touch.moveTo({ x, y }, { ms: 1 })
    await touch.press()
    await touch.moveTo({ x, y: dropY }, { ms: 400 })
    await touch.release()
    await page.waitForTimeout(300)

    expect(await app.keywordRects()).not.toEqual(before)
    expect(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore)).toBeLessThan(30)
  })

  test("a hold that leaves the box before completing does not delete it", async () => {
    await app.scrubToTouch(10, 0.7, touch)
    await page.locator("#touch-controls [data-expand]").tap()
    await expect.poll(async () => (await statusOf(page)).boxes, { timeout: 30000 }).toBeGreaterThanOrEqual(3)
    await expect
      .poll(
        async () => {
          const first = (await statusOf(page)).boxes
          await page.waitForTimeout(600)
          const second = (await statusOf(page)).boxes
          return first === second ? first : -1
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(3)

    const [rect] = await app.keywordRects()
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const before = (await statusOf(page)).boxes

    // The sweep is running by ~400 ms; leaving the box's region before it completes must cancel the delete.
    const lineHeight = await app.lineHeight()
    await touch.moveTo({ x, y }, { ms: 1 })
    await touch.press()
    await page.waitForTimeout(400)
    await touch.moveTo({ x: x + 160, y: y + 6 * lineHeight }, { ms: 300 })
    await page.waitForTimeout(200)
    await touch.release()
    await page.waitForTimeout(300)
    expect((await statusOf(page)).boxes).toBe(before)
  })
})
