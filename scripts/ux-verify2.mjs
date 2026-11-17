import { chromium } from "playwright-core"

const APP = "http://localhost:5280/spaceship/"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await context.addInitScript(() => {
  if (!sessionStorage.getItem("keep")) localStorage.clear()
  sessionStorage.setItem("keep", "1")
})
const page = await context.newPage()
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message))

await page.goto(APP)
await page.waitForTimeout(500)

const shown = () => page.evaluate(() => document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1])
const knobs = () => page.evaluate(() => document.querySelectorAll(".future").length)
const hint = () => page.evaluate(() => document.querySelector("#hint")?.dataset.show !== undefined)

// 1. hint appears after auto-reveal, before any interaction
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1000)
  const h = await hint()
  const s = await shown()
  console.log(`t=${i + 1}s shown=${s} hint=${h}`)
  if (h) break
}

// 2. dead-zone release keeps the knob now
const kbox = await page.evaluate(() => {
  const k = document.querySelector("#pointer").getBoundingClientRect()
  return { x: k.x + k.width / 2, y: k.y + k.height / 2 }
})
await page.mouse.move(kbox.x, kbox.y)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up() // first click
await page.mouse.down()
await page.waitForTimeout(900)
await page.mouse.up() // hold -> spawn, release in place
await page.waitForTimeout(1000)
console.log("knobs after dead-zone release:", await knobs())
await page.screenshot({ path: "docs-ux/shots/54-deadzone-kept.png" })

// 3. alt-select creates a box; plain select does not (with shown text present)
const sel = await page.evaluate(() => {
  const el = document.querySelector("#text")
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node
  while ((node = w.nextNode())) {
    if (node.parentElement?.classList.contains("ghost")) continue
    if (node.textContent.length > 200) break
  }
  const r = document.createRange()
  r.setStart(node, 40)
  r.setEnd(node, 120)
  const rc = r.getBoundingClientRect()
  return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 }
})
const boxCount = () => page.evaluate(() => document.querySelector("#status")?.textContent?.match(/box(\d)/)?.[1] ?? "0")
console.log("boxes before:", await boxCount())
await page.mouse.move(sel.x, sel.y)
await page.mouse.down()
await page.mouse.move(sel.x + 50, sel.y + 4, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(500)
console.log("boxes after plain select:", await boxCount())
await page.keyboard.down("Alt")
await page.mouse.move(sel.x - 30, sel.y)
await page.mouse.down()
await page.mouse.move(sel.x + 90, sel.y + 4, { steps: 8 })
await page.mouse.up()
await page.keyboard.up("Alt")
await page.waitForTimeout(800)
console.log("boxes after alt select:", await boxCount())
await page.screenshot({ path: "docs-ux/shots/55-alt-box.png" })

// 4. restore chip returns caret
await page.waitForTimeout(1500) // let it rest
const before = await shown()
await page.mouse.move(kbox.x, kbox.y)
await page.mouse.down()
await page.mouse.move(kbox.x, kbox.y - 400, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(700)
const afterScrub = await shown()
const chipVisible = await page.evaluate(() => !document.querySelector("#restore-chip")?.hidden)
console.log(`scrub: shown ${before} -> ${afterScrub}, chip=${chipVisible}`)
await page.click("#restore-chip")
await page.waitForTimeout(1200)
console.log("shown after restore:", await shown())
await page.screenshot({ path: "docs-ux/shots/56-restored-caret.png" })

await browser.close()
console.log("DONE")
