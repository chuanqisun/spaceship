import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { encodeGif } from "./capture/recorder.mjs"

/**
 * Renders `extra/illustrations.html` to GIFs frame by frame: `node scripts/capture-illustrations.mjs [name…]` with the dev server running (`npm run dev -- --port 5280`).
 * The page is loaded frozen and each frame is drawn at an exact time, so the loops are perfectly smooth whatever the machine. GIFs are written to `extra/clips/`.
 */
const PAGE_URL = process.env.PAGE_URL ?? "http://localhost:5280/spaceshipUI/extra/illustrations.html?frozen"
const CHROMIUM = process.env.CHROMIUM ?? "/snap/bin/chromium"
const OUTPUT_DIR = resolve(import.meta.dirname, "../extra/clips")
const WORK_DIR = resolve(import.meta.dirname, "../.capture")
const FPS = 25
const SCALE = 2
const GIF_WIDTH = 960

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: SCALE })
await page.goto(PAGE_URL)
await page.waitForFunction(() => window.illustrations)
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : await page.$$eval("figure[data-scene]", (figures) => figures.map((figure) => figure.dataset.scene))
const session = await page.context().newCDPSession(page)
mkdirSync(OUTPUT_DIR, { recursive: true })

for (const name of names) {
  const dir = resolve(WORK_DIR, `illustration-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const svg = page.locator(`figure[data-scene="${name}"] svg`)
  await svg.scrollIntoViewIfNeeded()
  const { x, y, width, height } = await svg.boundingBox()
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  /** The screenshot clip is in page coordinates, the bounding box in the viewport's. */
  const box = { x: x + scroll.x, y: y + scroll.y, width, height }
  const duration = await page.evaluate((name) => window.illustrations.durationOf(name), name)
  const frames = []
  for (let i = 0; i < Math.round(duration * FPS); i++) {
    await page.evaluate(([name, t]) => window.illustrations.renderAt(name, t), [name, i / FPS])
    const { data } = await session.send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: SCALE } })
    const file = resolve(dir, `${String(i).padStart(5, "0")}.png`)
    writeFileSync(file, Buffer.from(data, "base64"))
    frames.push({ file, seconds: 1 / FPS })
  }
  console.log(`${name}: encoding ${frames.length} frames`)
  encodeGif({ dir, frames }, { output: resolve(OUTPUT_DIR, `illustration-${name}.gif`), fps: FPS, width: GIF_WIDTH, fade: 0 })
}
await browser.close()
