/** Publishes the tray's rendered height so the page reserve, steering cue, and touch controls stay above it as content wraps. Returns a cleanup that stops observing. */
export function observeTrayHeight(element: HTMLElement) {
  const root = document.documentElement
  const sync = () => root.style.setProperty("--tray-occupied", `${element.getBoundingClientRect().height}px`)
  sync()
  const observer = new ResizeObserver(sync)
  observer.observe(element)
  return () => observer.disconnect()
}
