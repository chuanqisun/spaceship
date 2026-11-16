import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"

const OUT = resolve(import.meta.dirname, "../docs-ux/shots")
mkdirSync(OUT, { recursive: true })
const APP = "http://localhost:5280/spaceship/"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message))
page.on("console", (m) => m.text().startsWith("generation") && console.log("  [gen]", m.text()))
await page.goto(APP)
await page.waitForTimeout(3000) // let buffer fill

const state = () =>
  page.evaluate(() => ({
    len: document.querySelector("#text")?.textContent?.length ?? 0,
    tray: document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim(),
    knob: (() => {
      const k = document.querySelector("#pointer").getBoundingClientRect()
      return { x: k.x + k.width / 2, y: k.y + k.height / 2 }
    })(),
    futures: document.querySelectorAll(".future").length,
  }))

// 1. Scrub: drag knob down the column to reveal text
let s = await state()
console.log("initial:", JSON.stringify(s))
await page.mouse.move(s.knob.x, s.knob.y)
await page.mouse.down()
for (let y = s.knob.y; y < 700; y += 40) {
  await page.mouse.move(s.knob.x + Math.sin(y / 90) * 8, y, { steps: 4 })
  await page.waitForTimeout(60)
}
await page.mouse.up()
await page.waitForTimeout(1500)
s = await state()
console.log("after scrub:", JSON.stringify(s))
await page.screenshot({ path: `${OUT}/30-scrubbed.png` })

// 2. Scrub back up (regeneration path)
await page.mouse.move(s.knob.x, s.knob.y)
await page.mouse.down()
await page.mouse.move(s.knob.x, 200, { steps: 30 })
await page.waitForTimeout(300)
await page.mouse.move(s.knob.x, s.knob.y - 200, { steps: 30 })
await page.mouse.up()
await page.waitForTimeout(2000)
s = await state()
console.log("after scrub-back:", JSON.stringify(s))
await page.screenshot({ path: `${OUT}/31-scrub-back.png` })

// 3. Double-click: expand attention boxes
await page.mouse.click(s.knob.x, s.knob.y, { clickCount: 2 })
await page.waitForTimeout(2500)
s = await state()
console.log("after dblclick expand:", JSON.stringify(s))
await page.screenshot({ path: `${OUT}/32-attention.png` })

// 4. Double-click again: collapse
await page.mouse.click(s.knob.x, s.knob.y, { clickCount: 2 })
await page.waitForTimeout(1200)
s = await state()
console.log("after dblclick collapse:", JSON.stringify(s))

// 5. Spawn future knob: press, release, press-and-hold
await page.mouse.move(s.knob.x, s.knob.y)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()
await page.waitForTimeout(80)
await page.mouse.down()
await page.waitForTimeout(800) // hold sweep 400ms + margin
let f = await state()
console.log("after hold (still pressing):", JSON.stringify(f))
await page.screenshot({ path: `${OUT}/33-fan-open.png` })
// carry knob out through the gate to pick a dimension
await page.mouse.move(s.knob.x + 200, s.knob.y - 100, { steps: 30 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/34-fan-chosen.png` })
console.log("during choose:", await page.evaluate(() => document.querySelector("#tray")?.textContent?.replace(/\s+/g, " ").trim()))
// swing + distance to tune
await page.mouse.move(s.knob.x + 240, s.knob.y + 60, { steps: 25 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/35-tuning.png` })
await page.mouse.up()
await page.waitForTimeout(3000)
s = await state()
console.log("after drop:", JSON.stringify(s))
await page.screenshot({ path: `${OUT}/36-dropped.png` })

// 6. Let it track / pin
await page.waitForTimeout(5000)
console.log("after settle:", await page.evaluate(() => document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim()))
await page.screenshot({ path: `${OUT}/37-settled.png` })

// 7. Press-and-pull steering in empty area right of text
const geo = await page.evaluate(() => {
  const t = document.querySelector("#text").getBoundingClientRect()
  return { right: t.right + scrollX, midY: t.top + scrollY + t.height / 2 }
})
await page.mouse.move(geo.right + 80, geo.midY, { steps: 8 })
await page.mouse.down()
await page.mouse.move(geo.right + 240, geo.midY - 80, { steps: 25 })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/38-pull.png` })
await page.mouse.up()
await page.waitForTimeout(1500)
console.log("after pull:", await page.evaluate(() => document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim()))

// 8. Selection -> attention box
const sel = await page.evaluate(() => {
  const el = document.querySelector("#text")
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const node = w.nextNode()
  const r = document.createRange()
  const len = node.textContent.length
  r.setStart(node, Math.floor(len * 0.2))
  r.setEnd(node, Math.floor(len * 0.5))
  const s = getSelection()
  s.removeAllRanges()
  s.addRange(r)
  const b = r.getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})
await page.mouse.move(sel.x, sel.y)
await page.waitForTimeout(400)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()
await page.waitForTimeout(1000)
console.log("after select:", await page.evaluate(() => document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim()))
await page.screenshot({ path: `${OUT}/39-select-box.png` })

// 9. Drag an attention box: hover text to find shaded region - try dragging from middle of a shaded area
// Instead: dblclick a box deletes it. Try dblclick on text center.
await page.mouse.click(sel.x, sel.y, { clickCount: 2 })
await page.waitForTimeout(800)
console.log("after box dblclick:", await page.evaluate(() => document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim()))

// 10. Mode dialog
await page.click("#mode-toggle")
await page.waitForTimeout(500)
console.log("dialog:", await page.evaluate(() => ({ open: document.querySelector("#live-keys").open })))
await page.screenshot({ path: `${OUT}/40-live-dialog.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(300)
await page.click("#sound-toggle")
await page.waitForTimeout(200)
console.log("sound now:", await page.evaluate(() => document.querySelector("#sound-toggle")?.textContent?.trim()))

// 11. Narrow viewport
await page.setViewportSize({ width: 480, height: 800 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/41-narrow.png` })
console.log(
  "narrow:",
  await page.evaluate(() => ({
    w: document.querySelector("#text")?.getBoundingClientRect().width,
    tray: document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim(),
  })),
)

await browser.close()
console.log("DONE")
