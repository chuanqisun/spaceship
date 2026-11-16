import { KEY_STORAGE as CEREBRAS_KEY_STORAGE, storedApiKey } from "../llm/cerebras.ts"
import { KEY_STORAGE as GEMINI_KEY_STORAGE } from "../llm/decisions.ts"
import { stored } from "./storage.ts"

/** Each key's field in the dialog's form, by name, and where it is kept for reuse. */
const KEY_FIELDS = { cerebras: CEREBRAS_KEY_STORAGE, gemini: GEMINI_KEY_STORAGE }
/** How long the toggle stays armed before it stands down. */
const ARM_MS = 2500

/**
 * Sim plays simulated sources; flight calls the models. The sources are chosen when the page loads, so switching reloads it in the other mode.
 * Launching asks for both API keys first when none are kept; with keys stored, the toggle arms for a moment (`flight?`) and a second click launches.
 */
export function bindModeToggle(toggle: HTMLButtonElement, dialog: HTMLDialogElement, isLive: boolean) {
  const form = dialog.querySelector("form")!
  const inputOf = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const label = toggle.querySelector("b")!
  toggle.setAttribute("aria-pressed", `${isLive}`)
  label.textContent = isLive ? "flight" : "sim"

  let armTimer: number | undefined
  const disarm = () => {
    clearTimeout(armTimer)
    armTimer = undefined
    label.textContent = isLive ? "flight" : "sim"
  }

  toggle.addEventListener("click", () => {
    if (isLive) return reloadAs(false)
    if (armTimer !== undefined) {
      disarm()
      return reloadAs(true)
    }
    const hasKeys = Object.values(KEY_FIELDS).every((key) => stored(key)?.trim())
    if (!hasKeys || !storedApiKey()) return openDialog()
    label.textContent = "flight?"
    armTimer = setTimeout(disarm, ARM_MS)
  })

  function openDialog() {
    for (const [name, storageKey] of Object.entries(KEY_FIELDS)) inputOf(name).value = stored(storageKey) ?? ""
    dialog.showModal()
  }

  function launch() {
    for (const [name, storageKey] of Object.entries(KEY_FIELDS)) {
      const value = inputOf(name).value.trim()
      if (value) localStorage.setItem(storageKey, value)
    }
    reloadAs(true)
  }

  dialog.addEventListener("close", () => {
    const choice = dialog.returnValue
    dialog.returnValue = ""
    if (choice !== "live") return
    launch()
  })
}

function reloadAs(isLive: boolean) {
  const url = new URL(location.href)
  if (isLive) url.searchParams.set("live", "true")
  else url.searchParams.delete("live")
  location.assign(url)
}
