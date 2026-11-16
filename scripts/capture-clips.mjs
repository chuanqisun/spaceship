import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { PLACEHOLDER_KEY, routeModelCalls } from "./capture/api-proxy.mjs"
import { createHand, linear } from "./capture/hand.mjs"
import { encodeGif, startRecording } from "./capture/recorder.mjs"

/**
 * Records README clips of the app in flight mode, one per idea: `node scripts/capture-clips.mjs [name…]` with the dev server running (`npm run dev -- --port 5280`).
 * Model calls go through `capture/api-proxy.mjs` with the keys from `.env`. GIFs are written to `extra/clips/`.
 */
const APP_URL = process.env.APP_URL ?? "http://localhost:5280/spaceshipUI/?live=true"
const CHROMIUM = process.env.CHROMIUM ?? "/snap/bin/chromium"
const OUTPUT_DIR = resolve(import.meta.dirname, "../extra/clips")
const VIEWPORT = { width: 1280, height: 800 }
const SCALE = 2
const GIF_WIDTH = 960
const MAX_TAKES = 3
/** Matches `SWING_RADIANS` in `src/text/future-hud.ts`: a tuned knob's value spans this far each side of the fan's axis. */
const SWING_RADIANS = Math.PI / 3
/** Swinging a knob around the fan is drawn as this many straight moves, close enough to an arc. */
const ORBIT_STEPS = 12

/** Dimensions the model reliably delivers within a few sentences, so their knobs pin on camera; vaguer ones (fortune, resolution) often never do. */
const CONCRETE_DIMENSIONS = ["tone", "mode", "focus", "tension", "pace", "distance"]

const clips = {
  "focus-monitor": focusMonitor,
  "attention-lock": attentionLock,
  "future-steering": futureSteering,
  "realtime-regeneration": realtimeRegeneration,
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(clips)
mkdirSync(OUTPUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROMIUM })
try {
  for (const name of names) await captureUntilAccepted(name, clips[name])
} finally {
  await browser.close()
}

/** Live text differs every take, so a clip that can miss its point (a knob that never pins) is recorded again, up to `MAX_TAKES` times, keeping the last take. */
async function captureUntilAccepted(name, choreography) {
  for (let take = 1; take <= MAX_TAKES; take++) {
    if (await capture(name, choreography)) return
    console.log(`${name}: take ${take} missed, ${take < MAX_TAKES ? "recording again" : "keeping it"}`)
  }
}

async function capture(name, choreography) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  await routeModelCalls(context)
  await context.addInitScript((key) => {
    localStorage.setItem("cerebras-api-key", key)
    localStorage.setItem("gemini-api-key", key)
  }, PLACEHOLDER_KEY)
  const page = await context.newPage()
  page.on("pageerror", (error) => console.error(`${name}: ${error.message}`))
  await page.goto(APP_URL)
  await page.waitForFunction(() => document.fonts.status === "loaded")
  const app = appOf(page)
  const hand = createHand(page)
  await hand.moveTo({ x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.7 }, { ms: 1 })
  await app.waitForBuffer()

  console.log(`${name}: setting up`)
  const { crop, act, accept = async () => true } = await choreography({ page, app, hand })
  console.log(`${name}: recording`)
  const region = crop()
  const recording = await startRecording(page, name, region, SCALE)
  const acting = await act().then(
    () => undefined,
    (error) => error,
  )
  const frames = await recording.stop()
  if (acting) throw acting
  const isAccepted = await accept()
  console.log(`${name}: encoding ${frames.frames.length} frames`)
  encodeGif(frames, { output: resolve(OUTPUT_DIR, `${name}.gif`), width: Math.min(GIF_WIDTH, region.width * SCALE) })
  await context.close()
  return isAccepted
}

/** The rail lights the lines that lead to the sentence at the knob; hovering an attention box swings the rail to what connects to that phrase. */
async function focusMonitor({ app, hand }) {
  await app.scrubTo(15, 0.55, { ms: 1 })
  await app.waitForRail()
  await app.expandAttention()
  await hand.moveTo(app.textPoint(19, 1.1), { ms: 1 })
  return {
    crop: () => app.region({ lines: 18, rail: true }),
    async act() {
      await hand.pause(1400)
      const boxes = await app.keywordRects()
      for (const box of boxes.slice(0, 4)) {
        await hand.moveTo(center(box))
        await app.waitForRail()
        await hand.pause(1500)
      }
      await hand.moveTo(app.textPoint(19, 1.1))
      await app.waitForRail()
      await hand.pause(1800)
    },
  }
}

/** Expanding sprouts attention boxes around keywords, each wired to the knob; dragging a box moves its keyword, and a selection locks a new phrase. */
async function attentionLock({ app, hand }) {
  await app.scrubTo(13, 0.7, { ms: 1 })
  await hand.moveTo(app.textPoint(17, 1.1), { ms: 1 })
  return {
    crop: () => app.region({ lines: 18, rail: true }),
    async act() {
      await hand.pause(700)
      await hand.moveTo(await app.knobCenter())
      await hand.pause(300)
      await hand.doubleClick()
      await app.waitForBoxes()
      await hand.pause(1800)
      const [box] = await app.keywordRects()
      await hand.moveTo(center(box))
      await hand.pause(500)
      await hand.press()
      await hand.moveTo({ x: center(box).x + 90, y: center(box).y + (await app.lineHeight()) }, { ms: 1200 })
      await hand.release()
      await hand.pause(900)
      const start = app.textPoint(2, 0.02)
      await hand.moveTo({ x: start.x - 2, y: start.y })
      await hand.press()
      await hand.moveTo(app.textPoint(2, 0.4), { ms: 900 })
      await hand.release()
      await hand.pause(1600)
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      await hand.moveTo(app.textPoint(16, 0.75), { ms: 2400, arc: 0.02 })
      await hand.release()
      await hand.moveTo(app.textPoint(18, 1.1))
      await hand.pause(1800)
    },
  }
}

/**
 * Three future knobs, each pulled out of the main knob in turn: double click and hold opens the fan of dimensions, carrying the knob through the gate picks one,
 * and its swing and reach set the value and strength. Each steers the text on its own; scrubbing on, the text fulfills them and they pin one by one.
 */
async function futureSteering({ page, app, hand }) {
  await app.scrubTo(7, 0.55, { ms: 1 })
  await hand.moveTo(app.textPoint(9, 0.3), { ms: 1 })
  await app.waitForMenu()
  return {
    crop: () => app.region({ lines: 22, rail: true, below: 40, right: 300 }),
    async act() {
      await hand.pause(500)
      for (const { swing, reach } of [
        { swing: -0.55, reach: 190 },
        { swing: 0.55, reach: 180 },
        { swing: 0.1, reach: 150 },
      ]) {
        const knob = await app.knobCenter()
        await hand.moveTo(knob)
        await hand.pause(200)
        await hand.click()
        await hand.pause(120)
        await hand.press()
        const options = await app.menuOptions()
        await hand.pause(250)
        const choice = options.find(({ label }) => CONCRETE_DIMENSIONS.includes(label)) ?? options[0]
        const fan = fanOf(knob, options)
        const chosenAt = fan.swingOf(choice)
        await hand.moveTo(fan.at(chosenAt, 60), { ms: 550 })
        await hand.pause(300)
        await hand.moveTo(fan.at(chosenAt, 140), { ms: 550 })
        await hand.pause(250)
        const target = swing * SWING_RADIANS
        for (let step = 1; step <= ORBIT_STEPS; step++) {
          const along = step / ORBIT_STEPS
          await hand.moveTo(fan.at(chosenAt + (target - chosenAt) * along, 140 + 10 * along), { ms: 800 / ORBIT_STEPS, ease: linear, arc: 0 })
        }
        await hand.pause(250)
        await hand.moveTo(fan.at(target, reach), { ms: 450 })
        await hand.pause(300)
        await hand.release()
        await hand.pause(700)
      }
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      for (let line = 8; line <= 20; line++) {
        await hand.moveTo(app.textPoint(line, 1.05), { ms: 560, ease: linear, arc: 0 })
        if ((await app.pinnedCount()) >= 3) break
      }
      await hand.release()
      await hand.moveTo({ x: hand.at().x + 40, y: hand.at().y + 60 })
      await hand.pause(2400)
    },
    accept: async () => (await app.pinnedCount()) >= 3,
  }
}

/**
 * Two ways to move through time. Dragging the knob scrubs: forward reveals the buffered future at once, and dragging back and resting there discards it,
 * so a new continuation streams in. Pressing and holding a point ahead of the knob pulls the knob there, fast while it is far and slowing as it catches up.
 */
async function realtimeRegeneration({ app, hand }) {
  await app.scrubTo(3, 0.5, { ms: 1 })
  await hand.moveTo(app.textPoint(5, 0.3), { ms: 1 })
  return {
    crop: () => app.region({ lines: 17, rail: false }),
    async act() {
      await hand.pause(500)
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      await hand.moveTo(app.textPoint(9, 0.8), { ms: 1300, arc: 0.04 })
      await hand.pause(400)
      await hand.moveTo(app.textPoint(5, 0.4), { ms: 900 })
      await hand.pause(1000)
      await hand.release()
      await hand.pause(300)
      await holdUntilCaughtUp(app.textPoint(12, 0.75))
      await hand.pause(500)
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      await hand.moveTo(app.textPoint(8, 0.3), { ms: 1000 })
      await hand.pause(1000)
      await hand.release()
      await hand.pause(300)
      await holdUntilCaughtUp(app.textPoint(15, 0.9))
      await hand.moveTo({ x: hand.at().x + 40, y: hand.at().y + 50 })
      await hand.pause(1200)
    },
  }

  async function holdUntilCaughtUp(point) {
    await hand.moveTo(point)
    await hand.pause(250)
    await hand.press()
    await app.waitForKnobNear(point)
    await hand.pause(400)
    await hand.release()
  }
}

/** Reads and drives the page's layout, so choreographies aim at lines, words and knobs rather than fixed pixels. */
function appOf(page) {
  let metrics

  return {
    lineHeight: async () => (await measure()).lineHeight,
    textPoint: (line, fraction) => ({ x: metrics.left + metrics.width * fraction, y: metrics.top + metrics.lineHeight * (line + 0.5) }),
    knobCenter: () => page.locator("#pointer").evaluate((knob) => ((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(knob.getBoundingClientRect())),
    async scrubTo(line, fraction, options) {
      await measure()
      const hand = createHand(page)
      await hand.moveTo(await this.knobCenter(), { ms: 1 })
      await hand.drag(this.textPoint(line, fraction), options)
      await page.waitForTimeout(400)
    },
    waitForBuffer: () => page.waitForFunction(() => /\+\d{2,}/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 30000 }),
    waitForRail: () => page.waitForTimeout(2200),
    async expandAttention() {
      const hand = createHand(page)
      await hand.moveTo(await this.knobCenter(), { ms: 1 })
      await hand.doubleClick()
      await this.waitForBoxes()
    },
    waitForBoxes: () =>
      page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) >= 3, null, { timeout: 30000 }).then(() => page.waitForTimeout(1200)),
    waitForMenu: () => page.waitForTimeout(4000),
    pinnedCount: () => page.evaluate(() => document.querySelectorAll(".future[data-pinned]").length),
    /** Waits while a held press pulls the knob, until it rests near `point` or stops short of it. */
    waitForKnobNear: async (point, timeout = 8000) => {
      const startedAt = Date.now()
      let last
      let stillSince = Date.now()
      while (Date.now() - startedAt < timeout) {
        const knob = await appOf(page).knobCenter()
        if (Math.hypot(knob.x - point.x, knob.y - point.y) < 24) return
        if (!last || Math.hypot(knob.x - last.x, knob.y - last.y) > 0.5) stillSince = Date.now()
        else if (Date.now() - stillSince > 1200) return
        last = knob
        await page.waitForTimeout(80)
      }
    },
    keywordRects: () =>
      page.evaluate(() =>
        [...(CSS.highlights.get("attention-word") ?? [])].map((range) => range.getBoundingClientRect().toJSON()).sort((a, b) => a.y - b.y || a.x - b.x),
      ),
    /** The dimensions the fan offers, once its menu has arrived. */
    menuOptions: () =>
      page
        .waitForFunction(
          () => {
            const options = [...document.querySelectorAll("#future-hud text")]
              .filter((text) => /[a-z]{3}/.test(text.textContent ?? ""))
              .map((text) => ((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, label: text.textContent }))(text.getBoundingClientRect()))
            return options.length >= 3 && options
          },
          null,
          { timeout: 15000 },
        )
        .then((handle) => handle.jsonValue()),
    /** A frame around the rail (if `rail`) and the text column, `lines` tall, with `below` px under them and `right` px beside them for pinned knobs. */
    region: ({ lines, rail, below = 24, right = 140 }) => {
      const left = rail ? metrics.railLeft - 24 : metrics.left - 140
      const edge = metrics.left + metrics.width + right
      const top = Math.max(0, metrics.top - 28)
      return { x: Math.round(left), y: Math.round(top), width: Math.round(edge - left), height: Math.round(metrics.lineHeight * lines + 28 + below) }
    },
  }

  async function measure() {
    metrics = await page.evaluate(() => {
      const text = document.querySelector("#text")
      const style = getComputedStyle(text)
      const { left, top, width } = text.getBoundingClientRect()
      return {
        left,
        width,
        top: top + parseFloat(style.paddingTop),
        lineHeight: parseFloat(style.lineHeight),
        railLeft: document.querySelector("#rail").getBoundingClientRect().left,
      }
    })
    return metrics
  }
}

function center({ x, y, width, height }) {
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * The fan around the main knob at `center`, measured as the app does: a swing is an angle from the axis, x by its sine and y by its cosine.
 * The menu's options sit symmetrically about the axis, so their mean gives its direction.
 */
function fanOf(center, options) {
  const mean = { x: options.reduce((sum, { x }) => sum + x, 0) / options.length, y: options.reduce((sum, { y }) => sum + y, 0) / options.length }
  const axis = Math.atan2(mean.x - center.x, mean.y - center.y)
  return {
    swingOf: ({ x, y }) => Math.atan2(x - center.x, y - center.y) - axis,
    at: (swing, radius) => ({ x: center.x + Math.sin(axis + swing) * radius, y: center.y + Math.cos(axis + swing) * radius }),
  }
}
