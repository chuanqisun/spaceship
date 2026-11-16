type LegendOptions = {
  dialog: HTMLDialogElement
  toggle: HTMLElement
}

/** The gesture legend: a native dialog opened from the tray or the keyboard, closed by Escape or its button. */
export function createLegend({ dialog, toggle }: LegendOptions) {
  const open = () => dialog.showModal()
  toggle.addEventListener("click", open)
  return {
    open,
    close: () => dialog.close(),
    isOpen: () => dialog.open,
    destroy: () => toggle.removeEventListener("click", open),
  }
}
