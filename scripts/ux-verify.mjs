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
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text()))

// fresh state (cleared by init script)
await page.goto(APP)
await page.waitForTimeout(500)

const state = () =>
  page.evaluate(() => ({
    len: document.querySelector("#text")?.textContent?.length ?? 0,
    tray: document.querySelector("#status")?.textContent?.replace(/\s+/g, " ").trim(),
    hint: document.querySelector("#hint")?.dataset.show !== undefined,
    ghost: document.querySelector("#text .ghost")?.textContent?.slice(0, 60),
    cue: document.querySelector("#zone-cue")?.dataset.show !== undefined,
    chip: !document.querySelector("#restore-chip")?.hidden,
    session: localStorage.getItem("spaceship.session")?.slice(0, 200),
  }))

// 1. auto-reveal: text should appear without input
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000)
  const s = await state()
  console.log(`t=${i + 1}s`, JSON.stringify(s))
  if (s.len > 100) break
}

// 2. legend via button and key
await page.click("#legend-toggle")
await page.waitForTimeout(400)
console.log("legend open:", await page.evaluate(() => document.querySelector("#legend")?.open))
await page.screenshot({ path: "docs-ux/shots/50-legend.png" })
await page.keyboard.press("Escape")
await page.waitForTimeout(300)

// 3. keyboard nudge
const before = await page.evaluate(() => document.querySelector("#status")?.textContent)
await page.keyboard.press("ArrowDown")
await page.waitForTimeout(400)
const after = await page.evaluate(() => document.querySelector("#status")?.textContent)
console.log("kbd:", before?.replace(/\s+/g, " ").trim(), "->", after?.replace(/\s+/g, " ").trim())

// 4. scrub back -> restore chip
const knob = await page.evaluate(() => {
  const k = document.querySelector("#pointer").getBoundingClientRect()
  return { x: k.x + k.width / 2, y: k.y + k.height / 2 }
})
await page.mouse.move(knob.x, knob.y)
await page.mouse.down()
await page.mouse.move(knob.x, knob.y - 300, { steps: 20 })
await page.mouse.up()
await page.waitForTimeout(600)
console.log("after scrub-back:", JSON.stringify(await state()))
await page.screenshot({ path: "docs-ux/shots/51-restore-chip.png" })
// click restore
await page.click("#restore-chip")
await page.waitForTimeout(800)
console.log("after restore:", JSON.stringify(await state()))

// 5. dead-zone release keeps knob
await page.mouse.move(knob.x, knob.y)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()
await page.waitForTimeout(80)
await page.mouse.down()
await page.waitForTimeout(800)
await page.mouse.up() // release without moving = dead zone
await page.waitForTimeout(800)
console.log("deadzone knobs:", await page.evaluate(() => document.querySelectorAll(".future").length))
// clean up: double-click it away
const fk = await page.evaluate(() => {
  const k = document.querySelector(".future")?.getBoundingClientRect()
  return k ? { x: k.x + k.width / 2, y: k.y + k.height / 2 } : null
})
if (fk) {
  await page.mouse.click(fk.x, fk.y, { clickCount: 2 })
  await page.waitForTimeout(400)
}
console.log("after cleanup knobs:", await page.evaluate(() => document.querySelectorAll(".future").length))

// 6. plain selection should NOT box; alt-selection SHOULD
const sel = await page.evaluate(() => {
  const el = document.querySelector("#text")
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = w.nextNode()
  // skip ghost text node? first text node is shown content
  const r = document.createRange()
  const len = node.textContent.length
  r.setStart(node, Math.floor(len * 0.2))
  r.setEnd(node, Math.floor(len * 0.4))
  const rc = r.getBoundingClientRect()
  return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, nodeLen: len }
})
const boxesBefore = await page.evaluate(() => document.querySelector("#status")?.textContent?.match(/box(\d)/)?.[1])
await page.mouse.move(sel.x, sel.y)
await page.mouse.down()
await page.mouse.move(sel.x + 60, sel.y, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(600)
const boxesAfterPlain = await page.evaluate(() => document.querySelector("#status")?.textContent?.match(/box(\d)/)?.[1])
const selStill = await page.evaluate(() => getSelection()?.toString().length ?? 0)
console.log("plain select: boxes", boxesBefore, "->", boxesAfterPlain, "selection len:", selStill)

// alt selection
await page.keyboard.down("Alt")
await page.mouse.move(sel.x, sel.y)
await page.mouse.down()
await page.mouse.move(sel.x + 80, sel.y, { steps: 8 })
await page.mouse.up()
await page.keyboard.up("Alt")
await page.waitForTimeout(800)
console.log("alt select boxes:", await page.evaluate(() => document.querySelector("#status")?.textContent?.match(/box(\d)/)?.[1]))

// 7. zone cue: move pointer to empty right area
await page.mouse.move(900, 400, { steps: 5 })
await page.waitForTimeout(600)
console.log("cue in ahead zone:", await page.evaluate(() => document.querySelector("#zone-cue")?.dataset.show !== undefined))
await page.screenshot({ path: "docs-ux/shots/52-zone-cue.png" })

// 8. session persistence: wait for save then reload
await page.waitForTimeout(2000)
console.log("session saved:", (await state()).session)
await page.reload()
await page.waitForTimeout(4000)
console.log("after reload:", JSON.stringify(await state()))
await page.screenshot({ path: "docs-ux/shots/53-restored.png" })

await browser.close()
console.log("DONE")
