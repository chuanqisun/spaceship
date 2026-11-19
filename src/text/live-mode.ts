import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "../llm/cerebras.ts"
import { KEY_STORAGE as GEMINI_KEY_STORAGE } from "../llm/decisions.ts"

/** Each key's field in the dialog's form, by name, and where it is kept for reuse. */
const KEY_FIELDS = { cerebras: CEREBRAS_KEY_STORAGE, gemini: GEMINI_KEY_STORAGE }

type Mode = "sim" | "flight" | "local"

/**
 * Sim plays simulated sources; flight calls the hosted models; local runs a model in this page. The sources are chosen when the page loads, so switching reloads it in the other mode.
 * Leaving flight or local returns to sim. Launching flight asks for both API keys first, prefilled with the ones kept from last time; the dialog's submit button returns "live".
 * A local model needs no keys: the dialog's local section, told when the dialog opens (`onOpen`), launches it.
 */
export function bindModeToggle(toggle: HTMLButtonElement, dialog: HTMLDialogElement, mode: Mode, onOpen: () => void) {
  const form = dialog.querySelector("form")!
  const inputOf = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  toggle.setAttribute("aria-pressed", `${mode !== "sim"}`)
  toggle.querySelector("b")!.textContent = mode

  toggle.addEventListener("click", () => {
    if (mode !== "sim") return reloadAs("sim")
    for (const [name, storageKey] of Object.entries(KEY_FIELDS)) inputOf(name).value = localStorage.getItem(storageKey) ?? ""
    dialog.showModal()
    onOpen()
  })
  dialog.addEventListener("close", () => {
    const choice = dialog.returnValue
    dialog.returnValue = ""
    if (choice !== "live") return
    for (const [name, storageKey] of Object.entries(KEY_FIELDS)) localStorage.setItem(storageKey, inputOf(name).value.trim())
    reloadAs("flight")
  })
}

export function reloadAs(mode: Mode) {
  const url = new URL(location.href)
  url.searchParams.delete("live")
  url.searchParams.delete("local")
  if (mode === "flight") url.searchParams.set("live", "true")
  if (mode === "local") url.searchParams.set("local", "true")
  location.assign(url)
}

export function modeOf(url: URL): Mode {
  if (url.searchParams.get("local") === "true") return "local"
  if (url.searchParams.get("live") === "true") return "flight"
  return "sim"
}
