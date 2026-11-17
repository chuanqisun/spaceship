import "@fontsource-variable/jetbrains-mono/wght.css"
import "../llm/cerebras.ts"
import "../llm/openrouter.ts"
import "../llm/sim.ts"
import { $ } from "../dom.ts"
import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "../llm/cerebras.ts"
import { KEY_STORAGE as OPENROUTER_KEY_STORAGE } from "../llm/openrouter.ts"
import { PROVIDERS, type ProviderId } from "../llm/provider.ts"
import { createArenaOpening } from "./opening.ts"
import { createModelPicker } from "./model-picker.ts"
import { createPane, type Pane } from "./pane.ts"
import { MAX_PANES, createPaneGrid } from "./pane-grid.ts"
import { createSteeringBar } from "./steering-bar.ts"
import { PANES_STORAGE_KEY, loadPaneConfigs, serializePaneConfigs } from "./pane-config.ts"

const CAPACITY_MESSAGE = "Side-by-side comparison needs a larger screen — open on a desktop or a bigger window"

const opening = createArenaOpening()
const panes = new Map<number, Pane>()
let configs = loadPaneConfigs(localStorage.getItem(PANES_STORAGE_KEY))

const template = $<HTMLTemplateElement>("#pane-template")
const grid = createPaneGrid($("#panes"), {
  createSection: () => template.content.firstElementChild!.cloneNode(true) as HTMLElement,
  onCapacityChange: () => syncPanes(),
})
const paneDeps = { providers: PROVIDERS, opening, onRemove: removePane, onFocus: focusPane }

const KEY_FIELDS: [string, string][] = [
  ["cerebras", CEREBRAS_KEY_STORAGE],
  ["openrouter", OPENROUTER_KEY_STORAGE],
]

const keysDialog = $<HTMLDialogElement>("#keys")
$("#keys-open").addEventListener("click", () => {
  for (const [name, storage] of KEY_FIELDS) {
    const input = keysDialog.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    if (input) input.value = localStorage.getItem(storage) ?? ""
  }
  keysDialog.showModal()
})
// Only the save button can submit this form — "done" closes via the dialog command without submitting.
keysDialog.querySelector("form")!.addEventListener("submit", () => {
  for (const [name, storage] of KEY_FIELDS) {
    const input = keysDialog.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    if (!input) continue
    const value = input.value.trim()
    if (value) localStorage.setItem(storage, value)
    else localStorage.removeItem(storage)
  }
})

let pickerSlot: number | "add" | undefined
let focusedSlot: number | undefined
const picker = createModelPicker($<HTMLDialogElement>("#model-picker"), {
  providers: PROVIDERS,
  onSelect: (provider, model) => {
    if (pickerSlot === "add") {
      if (canAdd()) addPane(provider, model)
      return
    }
    const slot = pickerSlot
    const pane = slot === undefined ? undefined : panes.get(slot)
    if (!pane) return
    pane.setModel(provider, model)
    configs = configs.map((config) => (config.slot === slot ? { ...config, provider, model } : config))
    persist()
  },
})

const addButton = $<HTMLButtonElement>("#add-pane")
const capacityNote = $<HTMLElement>("#capacity-note")
addButton.addEventListener("click", () => {
  pickerSlot = "add"
  picker.open({})
})

createSteeringBar($("#steering"), {
  slots: () => [...panes.keys()],
  focusedSlot: () => focusedSlot,
  steer: (slot, steering) => panes.get(slot)?.steer(steering),
})

syncPanes()

function persist() {
  localStorage.setItem(PANES_STORAGE_KEY, serializePaneConfigs(configs))
}

/** Brings the live panes in line with the stored configs and the current viewport capacity: excess panes are hidden, not deleted. */
function syncPanes() {
  const limit = Math.min(MAX_PANES, grid.capacity())
  const visible = configs.slice(0, limit)
  for (const slot of [...panes.keys()]) {
    if (!visible.some((config) => config.slot === slot)) {
      panes.get(slot)!.destroy()
      grid.unmount(slot)
      panes.delete(slot)
    }
  }
  for (const config of visible) {
    if (panes.has(config.slot)) continue
    const section = grid.mount(config.slot)
    panes.set(config.slot, createPane(section, config, paneDeps))
    section.querySelector(".pane-label")?.addEventListener("click", () => openPicker(config.slot))
  }
  if (focusedSlot === undefined || !panes.has(focusedSlot)) focusedSlot = [...panes.keys()][0]
  if (focusedSlot !== undefined) focusPane(focusedSlot)
  updateChrome()
}

function canAdd() {
  return configs.length < Math.min(MAX_PANES, grid.capacity())
}

function addPane(provider: ProviderId = "sim", model = "sim"): boolean {
  if (!canAdd()) return false
  const slot = grid.nextSlot()
  if (slot === undefined) return false
  configs = [...configs, { slot, provider, model }].sort((a, b) => a.slot - b.slot)
  persist()
  syncPanes()
  return true
}

function removePane(slot: number) {
  const pane = panes.get(slot)
  if (!pane) return
  pane.destroy()
  grid.unmount(slot)
  panes.delete(slot)
  if (focusedSlot === slot) focusedSlot = undefined
  configs = configs.filter((config) => config.slot !== slot)
  persist()
  syncPanes()
}

function focusPane(slot: number) {
  focusedSlot = slot
  for (const other of panes.keys()) grid.section(other)?.toggleAttribute("data-focused", other === slot)
}

/** Opens the model picker for a pane; the picker's "suggested comparable" ranking compares against the pane's partner. */
function openPicker(slot: number) {
  const pane = panes.get(slot)
  if (!pane) return
  pickerSlot = slot
  picker.open({ provider: pane.config.provider, reference: referenceFor(slot) })
}

/** The comparison partner used for comparable-model suggestions: another live pane when one exists, else this pane's own config. */
function referenceFor(slot: number) {
  const partner = configs.find((config) => config.slot !== slot && config.provider !== "sim") ?? configs.find((config) => config.slot !== slot)
  const reference = partner ?? configs.find((config) => config.slot === slot)
  return reference ? { provider: reference.provider, model: reference.model } : undefined
}

function updateChrome() {
  const limit = Math.min(MAX_PANES, grid.capacity())
  addButton.disabled = !canAdd()
  addButton.title = addButton.disabled ? (limit === 1 ? CAPACITY_MESSAGE : `this screen fits ${limit} panes`) : ""
  capacityNote.hidden = limit > 1 && !addButton.disabled
  capacityNote.textContent = limit === 1 ? CAPACITY_MESSAGE : `side-by-side fits ${limit} panes on this screen`
}
