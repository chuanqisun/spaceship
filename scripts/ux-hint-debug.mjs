import { chromium } from "playwright-core"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message))
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()))
await page.goto("http://localhost:5280/spaceship/")
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => {
    const h = document.querySelector("#hint")
    return {
      shown: document.querySelector("#status")?.textContent?.match(/¶(\d+)/)?.[1],
      attr: h?.getAttribute("data-show"),
      opacity: h ? getComputedStyle(h).opacity : null,
      engagedGuess: !!document.querySelector("#hint")?.isConnected,
    }
  })
  if (i % 8 === 0 || s.attr !== null || (s.opacity !== "0" && s.opacity !== null)) console.log(`t=${(i * 0.4).toFixed(1)}`, JSON.stringify(s))
  if (s.attr !== null) {
    await page.waitForTimeout(300)
    console.log(
      "still:",
      JSON.stringify(
        await page.evaluate(() => ({
          attr: document.querySelector("#hint")?.getAttribute("data-show"),
          op: getComputedStyle(document.querySelector("#hint")).opacity,
        })),
      ),
    )
    break
  }
  await page.waitForTimeout(400)
}
await browser.close()
