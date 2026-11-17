import { chromium } from "playwright-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest"
import { appOf, fanOf } from "../scripts/capture/app.mjs"
import { createHand } from "../scripts/capture/hand.mjs"
import { poll, statusOf } from "./helpers.mjs"
import { flushCoverage, startCoverage, stopCoverage } from "./coverage.mjs"

/**
 * Drives flight (live LLM) mode with both model endpoints mocked by route interception: Cerebras streams
 * story/attention/dimension text as SSE, the decisions endpoint answers score/noul/choice questions as JSON.
 * Nothing leaves the dev server; any other offsite request still fails the test.
 */
const VIEWPORT = { width: 1280, height: 800 }
/** Matches `SWING_RADIANS` in `src/text/future-hud.ts`. */
const SWING_RADIANS = Math.PI / 3
/** The catalog axes `liveDimension` can offer (focus has no generic options and is never in the free menu). */
const LIVE_DIMENSIONS = ["tension", "resolution", "pace", "mode", "tone", "distance", "fortune", "surprise"]

const CEREBRAS_KEY = "test-cerebras-key"
const GEMINI_KEY = "test-gemini-key"

/** ~190 words of story prose; distinctive early words ("floorboards", "meridian") double as stream-content markers. */
const STORY =
  "Beneath the floorboards, Mara counted the slow creak of the settling house and waited for the rain to reach the windows. " +
  "The letter in her pocket had arrived at dawn, sealed with her brother's crest and no return address, and every mile of the night had made its paper heavier. " +
  "When the stair gave its first warning note she was already moving, barefoot on cold boards, toward the kitchen where the lamp still burned low. " +
  "Outside, the garden gate hung open though she had locked it herself, and beyond the fence the orchard disappeared into a wall of fog that had not been there at dusk. " +
  "Mara did not call out. Instead she took the letter from her pocket, folded it once along its crease, and set it on the table beside the lamp where the light could keep it honest. " +
  "The meridian line of morning found her still standing there when the second drawer opened below the stairs, slow and deliberate, like something remembering a habit."

/** The dimension menu the mock offers; every line must parse against `live-dimension.ts`'s CATALOG. */
const DIMENSION_LINES = [
  "tension: relaxed | strained",
  "pace: compressed | expanded",
  "mode: dialogue | action | description",
  "tone: wry | tender | somber | wondrous",
  "distance: outside view | inside mind",
]

let browser
let context
let page
let app
let hand
let pageErrors
let offsiteRequests
let cerebrasCalls
let decisionsCalls

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM })
})

afterAll(async () => {
  flushCoverage("live")
  await browser?.close()
})

beforeEach(async () => {
  context = await browser.newContext({ viewport: VIEWPORT })
  const appOrigin = new URL(inject("appUrl")).origin
  pageErrors = []
  offsiteRequests = []
  cerebrasCalls = { story: 0, attention: 0, dimension: 0 }
  decisionsCalls = 0
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
})

afterEach(async () => {
  await stopCoverage(page)
  await context.close()
  expect(pageErrors).toEqual([])
  expect(offsiteRequests).toEqual([])
})

describe("flight mode", () => {
  test("?live=true shows flight on the toggle and streams a story from the mocked Cerebras endpoint", async () => {
    await launchLive()

    await expect(page.locator("#mode-toggle").getAttribute("aria-pressed")).resolves.toBe("true")
    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("flight")

    // The caret starts at the top; scrubbing forward reveals words the stream generated.
    await app.scrubTo(5, 0.6)
    const first = (await statusOf(page)).words
    await app.scrubTo(12, 0.7)
    expect((await statusOf(page)).words).toBeGreaterThan(first)

    // Mocked story prose reached the page (shown text plus the ghost preview of the buffer).
    const text = await page.locator("#text").evaluate((element) => element.textContent ?? "")
    expect(text).toContain("floorboards")
    expect(cerebrasCalls.story).toBeGreaterThan(0)
  })

  test("expanding attention streams key phrases from Cerebras and draws boxes around words in the shown text", async () => {
    await launchLive()
    await app.scrubTo(8, 0.7)

    const knob = await app.knobCenter()
    await hand.moveTo(knob, { ms: 1 })
    await hand.doubleClick()
    await poll(async () => (await statusOf(page)).boxes, { timeout: 20000 }).toBeGreaterThanOrEqual(1)
    expect(cerebrasCalls.attention).toBeGreaterThan(0)

    // A second expand collapses the boxes again.
    await hand.moveTo(await app.knobCenter(), { ms: 1 })
    await hand.doubleClick()
    await page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) === 0, null, { timeout: 10000 })
    expect((await statusOf(page)).boxes).toBe(0)
  })

  test("a spawned future knob offers the mocked dimension menu and tunes into a steering control", async () => {
    await launchLive()
    await app.scrubTo(7, 0.55)
    await app.waitForMenu()

    const knob = await app.knobCenter()
    await hand.moveTo(knob)
    await hand.click()
    await page.waitForTimeout(50)
    await hand.press()
    const options = await app.menuOptions()
    const labels = options.map(({ label }) => label)
    expect(labels.length).toBeGreaterThanOrEqual(3)
    expect(labels.every((label) => LIVE_DIMENSIONS.includes(label))).toBe(true)
    expect(labels).toContain("tension")

    const fan = fanOf(knob, options)
    const chosenAt = fan.swingOf(options[0])
    await hand.moveTo(fan.at(chosenAt, 60), { ms: 400 })
    await hand.moveTo(fan.at(chosenAt, 140), { ms: 400 })
    const dropAt = fan.at(0.4 * SWING_RADIANS, 170)
    await hand.moveTo(dropAt, { ms: 500 })
    await hand.release()
    await poll(() => page.locator(".future[data-tuned]").count(), { timeout: 15000 }).toBe(1)
    await poll(async () => (await statusOf(page)).steering, { timeout: 15000 }).toBe(1)
    expect(cerebrasCalls.dimension).toBeGreaterThan(0)
    // Tuning steers the next continuation and starts realization tracking against the decisions endpoint.
    await poll(() => decisionsCalls, { timeout: 15000 }).toBeGreaterThan(0)
  })

  test("the mode toggle arms, launches through the keys dialog, and reloads into flight", async () => {
    await mockApis()
    // No keys stored yet: the first click opens the dialog rather than arming.
    await page.locator("#mode-toggle").click()
    await poll(() => page.locator("#live-keys").evaluate((dialog) => dialog.open)).toBe(true)
    await page.locator('#live-keys input[name="cerebras"]').fill(CEREBRAS_KEY)
    await page.locator('#live-keys input[name="gemini"]').fill(GEMINI_KEY)
    await page.locator('#live-keys button[value="live"]').click()

    await page.waitForURL(/live=true/)
    await page.waitForFunction(() => document.fonts.status === "loaded")
    app = appOf(page)
    await app.measure()
    await app.waitForBuffer()

    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("flight")
    const stored = await page.evaluate(() => [localStorage.getItem("cerebras-api-key"), localStorage.getItem("gemini-api-key")])
    expect(stored).toEqual([CEREBRAS_KEY, GEMINI_KEY])
    expect(cerebrasCalls.story).toBeGreaterThan(0)
  })

  test("a failing endpoint retries with backoff and never crashes the page", async () => {
    await context.route("**/api.cerebras.ai/**", (route) => route.fulfill({ status: 500, body: "mock failure" }))
    await context.route("**/generativelanguage.googleapis.com/**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "mock failure" } }) }),
    )
    await page.evaluate(
      ([cerebras, gemini]) => {
        localStorage.setItem("cerebras-api-key", cerebras)
        localStorage.setItem("gemini-api-key", gemini)
      },
      [CEREBRAS_KEY, GEMINI_KEY],
    )
    await page.goto(`${inject("appUrl")}?live=true`)
    await page.waitForFunction(() => document.fonts.status === "loaded")
    await page.waitForTimeout(3000)

    await expect(page.locator("#mode-toggle b").textContent()).resolves.toBe("flight")
    expect(pageErrors).toEqual([])
    expect(offsiteRequests).toEqual([])
  })
})

/** Registers the mocked Cerebras and decisions endpoints; call inside a test so they take precedence over the offsite-abort route. */
async function mockApis() {
  await context.route("**/api.cerebras.ai/**", async (route) => {
    let body
    try {
      body = route.request().postDataJSON()
    } catch {}
    const system = body?.messages?.[0]?.content ?? ""
    const user = body?.messages?.[1]?.content ?? ""
    const kind = system.includes("Continue the story") ? "story" : system.includes("axes") ? "dimension" : "attention"
    cerebrasCalls[kind] += 1
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sseOf(kind, user) }).catch(() => {})
  })
  await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
    decisionsCalls += 1
    let questions = {}
    try {
      questions = route.request().postDataJSON()?.questions ?? {}
    } catch {}
    const answers = Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, answerOf(question)]))
    const body = {
      answers,
      usage: {
        total_input_tokens: 120,
        input_tokens_by_modality: [{ modality: "text", tokens: 120 }],
        total_output_tokens: 24,
        total_tokens: 144,
      },
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
  })
}

/** An SSE body for one Cerebras call, chunked into several `data:` events like the real stream. */
function sseOf(kind, user) {
  const chunks = kind === "story" ? storyChunks() : kind === "dimension" ? dimensionChunks() : attentionChunks(user)
  return chunks.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n"
}

/** The first chunk feeds the echo stripper (which adds the leading space); later chunks stream raw, so each carries its own. */
function storyChunks() {
  const words = STORY.split(" ")
  const size = 14
  const chunks = []
  for (let at = 0; at < words.length; at += size) chunks.push(words.slice(at, at + size).join(" "))
  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`))
}

function dimensionChunks() {
  return [`${DIMENSION_LINES.slice(0, 3).join("\n")}\n`, `${DIMENSION_LINES.slice(3).join("\n")}\n`]
}

/**
 * Key-phrase lines built from the shown text itself, so every phrase is an exact run of consecutive words.
 * Phrases are 2–8 words with the middle word bracketed, one per line, as `live-attention.ts` parses them.
 */
function attentionChunks(user) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })
  const words = [...segmenter.segment(user.replaceAll("’", "'"))].filter(({ isWordLike }) => isWordLike).map(({ segment }) => segment)
  if (words.length < 12) return words.length >= 4 ? [phraseLine(words, 0)] : []
  const width = 5
  const starts = [...new Set([2, Math.floor(words.length / 2) - 2, words.length - width - 2].filter((at) => at >= 0 && at + width <= words.length))]
  const lines = starts.slice(0, 3).map((at) => phraseLine(words, at, width))
  const joined = `${lines.join("\n")}\n`
  const mid = Math.floor(joined.length / 2)
  return [joined.slice(0, mid), joined.slice(mid)]
}

function phraseLine(words, at, width = 4) {
  const phrase = words.slice(at, at + width)
  const middle = Math.floor(phrase.length / 2)
  return [...phrase.slice(0, middle), `[${phrase[middle]}]`, ...phrase.slice(middle + 1)].join(" ")
}

/** Answers every question in a decisions request with a plausible value of its own type. */
function answerOf(question = {}) {
  if (question.type === "score") {
    const criteria = question.criteria ?? []
    return {
      type: "score",
      score: 2,
      probabilities: Object.fromEntries(criteria.map((_, i) => [String(i), i === 2 ? 0.7 : 0.3 / Math.max(1, criteria.length - 1)])),
      legend: Object.fromEntries(criteria.map((label, i) => [String(i), label])),
      confidence: 0.9,
    }
  }
  if (question.type === "noul") return { type: "noul", noul: 0.9, confidence: 0.9 }
  const options = Object.keys(question.criteria ?? {})
  return {
    type: "choice",
    choice: options[0] ?? "",
    probabilities: Object.fromEntries(options.map((option, i) => [option, i === 0 ? 0.8 : 0.2 / Math.max(1, options.length - 1)])),
    confidence: 0.9,
  }
}

/** Stores both API keys and reloads the page in flight mode, standing in for what the launch dialog does. */
async function launchLive() {
  await mockApis()
  await page.evaluate(
    ([cerebras, gemini]) => {
      localStorage.setItem("cerebras-api-key", cerebras)
      localStorage.setItem("gemini-api-key", gemini)
    },
    [CEREBRAS_KEY, GEMINI_KEY],
  )
  await page.goto(`${inject("appUrl")}?live=true`)
  await page.waitForFunction(() => document.fonts.status === "loaded")
  app = appOf(page)
  hand = createHand(page)
  await app.measure()
  await hand.moveTo({ x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.7 }, { ms: 1 })
  await app.waitForBuffer()
}
