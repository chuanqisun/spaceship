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
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()))

await page.goto(APP)
await page.waitForTimeout(500)

// poll hint + internals every 500ms for 15s
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(() => ({
    hint: document.querySelector("#hint")?.dataset.show !== undefined,
    hintExists: !!document.querySelector("#hint"),
    shown: document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1],
    keys: Object.keys(localStorage).join(","),
  }))
  if (i % 4 === 0 || s.hint) console.log(`t=${(i * 0.5).toFixed(1)}s`, JSON.stringify(s))
  if (s.hint) break
  await page.waitForTimeout(500)
}

// restore chip: fresh scrub with freshly-read knob pos
const knobPos = () =>
  page.evaluate(() => {
    const k = document.querySelector("#pointer").getBoundingClientRect()
    return { x: k.x + k.width / 2, y: k.y + k.height / 2 }
  })
await page.waitForTimeout(2500) // let it rest so restCount settles
const k1 = await knobPos()
const before = await page.evaluate(() => document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1])
await page.mouse.move(k1.x, k1.y)
await page.mouse.down()
await page.mouse.move(k1.x, k1.y - 500, { steps: 30 })
await page.mouse.up()
await page.waitForTimeout(800)
const mid = await page.evaluate(() => ({
  shown: document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1],
  chip: !document.querySelector("#restore-chip")?.hidden,
  chipText: document.querySelector("#restore-chip")?.textContent,
}))
console.log(`scrub ${before} ->`, JSON.stringify(mid))
if (mid.chip) {
  await page.click("#restore-chip")
  await page.waitForTimeout(1500)
  console.log("after restore:", await page.evaluate(() => document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1]))
}
await page.screenshot({ path: "docs-ux/shots/57-restore2.png" })
await browser.close()
console.log("DONE")
