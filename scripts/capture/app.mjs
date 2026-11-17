import { createHand } from "./hand.mjs"

/** Reads and drives the page's layout, so choreographies aim at lines, words and knobs rather than fixed pixels. */
export function appOf(page) {
  let metrics

  return {
    measure,
    lineHeight: async () => (await measure()).lineHeight,
    textPoint: (line, fraction) => ({ x: metrics.left + metrics.width * fraction, y: metrics.top + metrics.lineHeight * (line + 0.5) }),
    knobCenter: () => page.locator("#pointer").evaluate((knob) => ((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(knob.getBoundingClientRect())),
    async scrubTo(line, fraction, options) {
      await measure()
      const hand = createHand(page)
      await hand.moveTo(await this.knobCenter(), { ms: 1 })
      await hand.drag(this.textPoint(line, fraction), options)
      await page.waitForTimeout(400)
      await measure()
    },
    /** Scrubs with a touch drag, the mobile counterpart of `scrubTo`; `touch` is a `createTouchHand`. */
    async scrubToTouch(line, fraction, touch, options) {
      await measure()
      const target = this.textPoint(line, fraction)
      const knob = await this.knobCenter()
      await touch.moveTo({ x: knob.x, y: knob.y }, { ms: 1 })
      await touch.drag(target, options)
      await page.waitForTimeout(400)
      await measure()
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
    /** Waits until the knob's center stops drifting, so a tap or press aims at where it rests. */
    waitForKnobStill: async (timeout = 10000) => {
      const deadline = Date.now() + timeout
      const app = appOf(page)
      let last
      while (Date.now() < deadline) {
        const knob = await app.knobCenter()
        if (last && Math.hypot(knob.x - last.x, knob.y - last.y) < 0.5) return
        last = knob
        await page.waitForTimeout(120)
      }
    },
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

export function center({ x, y, width, height }) {
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * The fan around the main knob at `center`, measured as the app does: a swing is an angle from the axis, x by its sine and y by its cosine.
 * The menu's options sit symmetrically about the axis, so their mean gives its direction.
 */
export function fanOf(center, options) {
  const mean = { x: options.reduce((sum, { x }) => sum + x, 0) / options.length, y: options.reduce((sum, { y }) => sum + y, 0) / options.length }
  const axis = Math.atan2(mean.x - center.x, mean.y - center.y)
  return {
    swingOf: ({ x, y }) => Math.atan2(x - center.x, y - center.y) - axis,
    at: (swing, radius) => ({ x: center.x + Math.sin(axis + swing) * radius, y: center.y + Math.cos(axis + swing) * radius }),
  }
}
