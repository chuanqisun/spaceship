/** Pointer events per second while the hand moves, near a display's refresh rate. */
const MOVES_PER_SECOND = 60

/**
 * A pointer that moves like a hand: eased in and out along a slight arc, at a speed that suits the distance, so recorded gestures read as human.
 * Every gesture awaits until it is done, so a choreography is plain sequential code.
 */
export function createHand(page) {
  let at = { x: 0, y: 0 }

  return {
    at: () => at,
    moveTo,
    pause: (ms) => page.waitForTimeout(ms),
    async press() {
      await page.mouse.down()
    },
    async release() {
      await page.mouse.up()
    },
    async click() {
      await page.mouse.down()
      await page.waitForTimeout(70)
      await page.mouse.up()
    },
    async doubleClick() {
      await page.mouse.click(at.x, at.y, { clickCount: 1, delay: 50 })
      await page.waitForTimeout(90)
      await page.mouse.click(at.x, at.y, { clickCount: 2, delay: 50 })
    },
    /** Presses, moves to `target` with the button down, then releases. */
    async drag(target, options) {
      await page.mouse.down()
      await moveTo(target, options)
      await page.mouse.up()
    },
  }

  /** Moves along a curve bowed by `arc` (a fraction of the distance) over `ms`, or a duration that grows with the distance. */
  async function moveTo(target, options) {
    for (const point of easedPoints(at, target, options)) {
      at = point
      const startedAt = performance.now()
      await page.mouse.move(at.x, at.y)
      await page.waitForTimeout(Math.max(0, 1000 / MOVES_PER_SECOND - (performance.now() - startedAt)))
    }
    at = target
  }
}

/**
 * The touch sibling of `createHand`: the same eased paths and pacing, dispatched as CDP touch events
 * so the page sees real `pointerType: "touch"` input. `moveTo` without a pressed finger only re-aims —
 * touch has no hover — so `press` always starts where the last `moveTo` ended.
 */
export function createTouchHand(page) {
  let at = { x: 0, y: 0 }
  let isDown = false
  let touchId = 0
  let session

  return {
    at: () => at,
    moveTo,
    pause: (ms) => page.waitForTimeout(ms),
    press,
    release,
    click,
    /** Taps at `(x, y)`: re-aims, then a quick press and release. */
    async tap(x, y) {
      await moveTo({ x, y }, { ms: 1 })
      await click()
    },
    /** Presses at `(x, y)` and holds still for `ms`, then lifts. */
    async longPress(x, y, ms = 600) {
      await moveTo({ x, y }, { ms: 1 })
      await press()
      await page.waitForTimeout(ms)
      await release()
    },
    async doubleClick() {
      await click()
      await page.waitForTimeout(90)
      await click()
    },
    /** Presses, moves to `target` with the finger down, then releases. */
    async drag(target, options) {
      await press()
      await moveTo(target, options)
      await release()
    },
  }

  async function click() {
    await press()
    await page.waitForTimeout(70)
    await release()
  }

  async function press() {
    isDown = true
    touchId += 1
    await dispatch("touchStart", [point()])
  }

  async function release() {
    await dispatch("touchEnd", [])
    isDown = false
  }

  function point() {
    return { x: at.x, y: at.y, id: touchId }
  }

  async function dispatch(type, touchPoints) {
    session ??= page.context().newCDPSession(page)
    await (await session).send("Input.dispatchTouchEvent", { type, touchPoints })
  }

  /** Moves along the same eased curve as the mouse hand; while a finger is down each step is a touchMove. */
  async function moveTo(target, options) {
    for (const next of easedPoints(at, target, options)) {
      at = next
      if (!isDown) continue
      const startedAt = performance.now()
      await dispatch("touchMove", [point()])
      await page.waitForTimeout(Math.max(0, 1000 / MOVES_PER_SECOND - (performance.now() - startedAt)))
    }
    at = target
    if (isDown) await dispatch("touchMove", [point()])
  }
}

/** The eased arc `moveTo` walks, one point per frame-ish step, ending exactly on `target`. */
function easedPoints(from, target, { ms, arc = 0.08, ease = easeInOut } = {}) {
  const length = Math.hypot(target.x - from.x, target.y - from.y)
  const duration = ms ?? 260 + 160 * Math.log2(1 + length / 60)
  const steps = Math.max(1, Math.round((duration / 1000) * MOVES_PER_SECOND))
  const bow = { x: -(target.y - from.y) * arc, y: (target.x - from.x) * arc }
  return Array.from({ length: steps }, (_, i) => {
    const t = ease((i + 1) / steps)
    const lift = 4 * t * (1 - t)
    return { x: from.x + (target.x - from.x) * t + bow.x * lift, y: from.y + (target.y - from.y) * t + bow.y * lift }
  })
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const linear = (t) => t
