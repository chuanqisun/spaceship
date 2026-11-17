/** The status line's readings: words shown, words buffered past the knob, boxes, steering and pins. */
export function statusOf(page) {
  return page.evaluate(() => {
    const reading = (name) => document.querySelector(`#status [data-field="${name}"] b`)
    const words = reading("words")
    return {
      words: Number(words.firstChild?.textContent),
      buffer: Number(words.querySelector("small")?.textContent.replace("+", "")),
      boxes: Number(reading("boxes").textContent),
      steering: Number(reading("steering").textContent),
      pinned: Number(reading("pinned").textContent),
    }
  })
}
