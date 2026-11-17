import { strengthLevelOf, valueOf, type Control } from "../text/dimension.ts"
import type { Steering } from "../text/text-stream.ts"
import { STORY_DIMENSIONS } from "../story/dimensions.ts"

/** `"all"` broadcasts to every pane; `"focused"` hits only the pane `focusedSlot()` reports. */
export type SteeringMode = "all" | "focused"

/** A resolved steering edit: `"all"` or one pane's slot, carrying the full replacement `Steering`. */
export type SteeringAction = { target: "all" | number; steering: Steering }

export type SteeringDraftDeps = {
  /** Slots of the live panes, for "all" fan-out and for checking the focused slot is still mounted. */
  slots(): number[]
  /** The slot receiving focused-mode edits, `undefined` when no pane is focused. */
  focusedSlot(): number | undefined
  /** Applies `steering` to one pane. Called synchronously per target; each pane's regeneration stays async inside it. */
  steer(slot: number, steering: Steering): void
}

export type SteeringDraft = {
  phrase(): string
  controls(): Control[]
  mode(): SteeringMode
  setPhrase(phrase: string): void
  setMode(mode: SteeringMode): void
  addControl(control: Control): void
  updateControl(index: number, change: { position?: number; strength?: number }): void
  removeControl(index: number): void
  steering(): Steering
  /** The pane slots an apply would steer right now. */
  targets(): number[]
  /** The action an apply would send, `undefined` in focused mode with no focused pane. */
  action(): SteeringAction | undefined
  /** Synchronous fan-out: every target gets `steer` in the same tick. */
  apply(): void
}

/**
 * The DOM-free core of the shared steering bar: the phrase and dimension controls being edited,
 * the all-vs-focused target, and the apply fan-out. Edits stay local until `apply()`.
 */
export function createSteeringDraft({ slots, focusedSlot, steer }: SteeringDraftDeps): SteeringDraft {
  let phrase = ""
  let controls: Control[] = []
  let mode: SteeringMode = "all"

  return {
    phrase: () => phrase,
    controls: () => controls,
    mode: () => mode,
    setPhrase,
    setMode,
    addControl,
    updateControl,
    removeControl,
    steering,
    targets,
    action,
    apply,
  }

  function setPhrase(next: string) {
    phrase = next
  }

  function setMode(next: SteeringMode) {
    mode = next
  }

  function addControl(control: Control) {
    controls = [...controls, control]
  }

  function updateControl(index: number, change: { position?: number; strength?: number }) {
    controls = controls.map((control, at) => (at === index ? { ...control, ...change } : control))
  }

  function removeControl(index: number) {
    controls = controls.filter((_, at) => at !== index)
  }

  /** A non-empty phrase steers as one lead whose whole text is the bracketed keyword. */
  function steering(): Steering {
    const keyword = phrase.trim()
    return { leads: keyword ? [{ before: "", keyword, after: "" }] : [], controls: [...controls] }
  }

  function action(): SteeringAction | undefined {
    if (mode === "all") return { target: "all", steering: steering() }
    const slot = focusedSlot()
    return slot === undefined ? undefined : { target: slot, steering: steering() }
  }

  function targets(): number[] {
    const current = action()
    if (!current) return []
    if (current.target === "all") return slots()
    return slots().includes(current.target) ? [current.target] : []
  }

  function apply() {
    const current = action()
    if (!current) return
    for (const slot of targets()) steer(slot, current.steering)
  }
}

/**
 * Wires the shared bar in `arena.html`'s `footer#steering`: the key-phrase input, one `.dim-row`
 * editor per dimension control inside `[data-dimensions]`, a select that appends a control, the
 * all/focused target toggle and the apply button. Everything stays local until apply, which fans
 * out synchronously through the draft.
 */
export function createSteeringBar(root: HTMLElement, deps: SteeringDraftDeps): SteeringDraft {
  const draft = createSteeringDraft(deps)
  const phraseInput = root.querySelector<HTMLInputElement>("#steer-phrase")!
  const targetButton = root.querySelector<HTMLButtonElement>("#steer-target")!
  const applyButton = root.querySelector<HTMLButtonElement>("#steer-apply")!
  const box = root.querySelector<HTMLElement>("[data-dimensions]")!

  phraseInput.addEventListener("input", () => draft.setPhrase(phraseInput.value))
  phraseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") draft.apply()
  })
  applyButton.addEventListener("click", () => draft.apply())
  targetButton.addEventListener("click", () => {
    draft.setMode(draft.mode() === "all" ? "focused" : "all")
    syncTargetButton()
  })

  syncTargetButton()
  renderControls()
  return draft

  function syncTargetButton() {
    const focused = draft.mode() === "focused"
    targetButton.textContent = focused ? "focused pane" : "all panes"
    targetButton.setAttribute("aria-pressed", String(!focused))
    targetButton.title = focused ? "steer only the focused pane — click a pane to change which" : "steer every pane"
  }

  function renderControls() {
    const taken = new Set(draft.controls().map(({ dimension }) => dimension.name))
    const rows = document.createElement("span")
    rows.className = "dim-rows"
    rows.append(...draft.controls().map((_, index) => controlEditor(index)))
    box.replaceChildren(rows, dimensionSelect(taken))
  }

  function describe(control: Control) {
    return `${control.dimension.name}: ${valueOf(control)} · ${strengthLevelOf(control.strength)}`
  }

  /** One control's editor: its value readout, position and strength sliders, and a remove button. */
  function controlEditor(index: number): HTMLElement {
    const control = draft.controls()[index]
    const row = document.createElement("span")
    row.className = "dim-row"
    const readout = document.createElement("output")
    readout.textContent = describe(control)
    const inputs = (["position", "strength"] as const).map((key) => {
      const input = document.createElement("input")
      input.type = "range"
      input.min = "0"
      input.max = "1"
      input.step = "0.01"
      input.value = String(control[key])
      input.setAttribute("aria-label", `${control.dimension.name} ${key}`)
      input.addEventListener("input", () => {
        draft.updateControl(index, key === "position" ? { position: Number(input.value) } : { strength: Number(input.value) })
        readout.textContent = describe(draft.controls()[index])
      })
      return input
    })
    const remove = document.createElement("button")
    remove.type = "button"
    remove.textContent = "×"
    remove.setAttribute("aria-label", `remove ${control.dimension.name} control`)
    remove.addEventListener("click", () => {
      draft.removeControl(index)
      renderControls()
    })
    row.append(readout, ...inputs, remove)
    return row
  }

  /** The add-control select: picking a dimension appends it at mid settings and returns to the placeholder. */
  function dimensionSelect(taken: Set<string>): HTMLSelectElement {
    const select = document.createElement("select")
    select.setAttribute("aria-label", "add a steering dimension")
    const placeholder = document.createElement("option")
    placeholder.textContent = "+ dimension"
    placeholder.value = ""
    placeholder.disabled = true
    placeholder.selected = true
    select.append(placeholder)
    for (const dimension of STORY_DIMENSIONS.filter(({ name }) => !taken.has(name))) {
      const option = document.createElement("option")
      option.value = dimension.name
      option.textContent = dimensionLabel(dimension)
      select.append(option)
    }
    select.addEventListener("change", () => {
      const dimension = STORY_DIMENSIONS.find(({ name }) => name === select.value)
      if (!dimension) return
      draft.addControl({ dimension, position: 0.5, strength: 0.5 })
      renderControls()
    })
    return select
  }

  function dimensionLabel(dimension: (typeof STORY_DIMENSIONS)[number]) {
    return dimension.kind === "scale" ? `${dimension.name} (${dimension.low}–${dimension.high})` : `${dimension.name} (${dimension.options.join("/")})`
  }
}
