/** Publishes the tray's rendered height so the page reserve, steering cue, and touch controls stay above it as content wraps. */
export function observeTrayHeight(element: HTMLElement) {
  const root = document.documentElement
  const sync = () => root.style.setProperty("--tray-occupied", `${element.getBoundingClientRect().height}px`)
  sync()
  new ResizeObserver(sync).observe(element)
}
