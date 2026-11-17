import type { ModelInfo, Provider, ProviderId } from "../llm/provider.ts"
import { loadCatalog, searchCatalog, type ModelCatalog } from "../llm/catalog.ts"

export const SEARCH_DEBOUNCE_MS = 150
export const SUGGESTION_LIMIT = 5
/** Unfiltered catalogs larger than this render a prefix plus a "keep typing" note. */
const UNFILTERED_LIMIT = 100

export type PickerTarget = {
  provider?: ProviderId
  /** The pane's comparison partner — used for "suggested comparable" ranking, never enforced. */
  reference?: { provider: ProviderId; model: string }
}

export type ModelPickerDeps = {
  providers: Readonly<Partial<Record<ProviderId, Provider>>>
  onSelect: (provider: ProviderId, model: string) => void
  apiKeyFor?: (provider: Provider) => string | undefined
  load?: (provider: Provider, apiKey: string | undefined, signal: AbortSignal) => Promise<ModelCatalog>
  search?: (provider: Provider, apiKey: string | undefined, query: string, signal: AbortSignal) => Promise<ModelInfo[]>
}

export type ModelPicker = {
  open(target?: PickerTarget): void
  close(): void
  destroy(): void
}

/** Case-insensitive substring match over model id and display name. */
export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return models
  return models.filter((model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q))
}

export function normalizeManualId(value: string): string | undefined {
  const id = value.trim()
  return id || undefined
}

const SIZE_TOKEN = /^\d+(\.\d+)?b$/

function familyTokens(info: ModelInfo): Set<string> {
  return new Set(
    `${info.id} ${info.name}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && /[a-z]/.test(token) && !SIZE_TOKEN.test(token)),
  )
}

function sizeOf(id: string): number | undefined {
  const match = id.toLowerCase().match(/(\d+(?:\.\d+)?)b/)
  return match ? Number(match[1]) : undefined
}

function primaryScore(reference: ModelInfo, candidate: ModelInfo): number {
  const referenceTokens = familyTokens(reference)
  const shared = [...familyTokens(candidate)].filter((token) => referenceTokens.has(token)).length
  const referenceSize = sizeOf(reference.id)
  const candidateSize = sizeOf(candidate.id)
  return shared * 10 + (referenceSize !== undefined && referenceSize === candidateSize ? 5 : 0)
}

function proximityScore(reference: ModelInfo, candidate: ModelInfo): number {
  if (reference.contextLength === undefined || candidate.contextLength === undefined) return 0
  return 1 / (1 + Math.abs(reference.contextLength - candidate.contextLength) / 65536)
}

/**
 * Advisory "comparable model" ranking (research R4): candidates sharing family tokens or parameter-size
 * class with the reference rank first, context-length proximity breaks ties. When nothing shares a
 * family/size signal, candidates with known context lengths fall back to pure proximity order.
 * Ordering only — callers must never enforce or filter on it.
 */
export function suggestComparable(reference: ModelInfo, candidates: ModelInfo[], limit = SUGGESTION_LIMIT): ModelInfo[] {
  const pool = candidates.filter((candidate) => candidate.id !== reference.id)
  const scored = pool
    .map((candidate) => ({ candidate, primary: primaryScore(reference, candidate), proximity: proximityScore(reference, candidate) }))
    .filter((entry) => entry.primary > 0)
    .sort((a, b) => b.primary - a.primary || b.proximity - a.proximity || a.candidate.id.localeCompare(b.candidate.id))
  if (scored.length > 0) return scored.slice(0, limit).map((entry) => entry.candidate)
  return pool
    .filter((candidate) => reference.contextLength !== undefined && candidate.contextLength !== undefined)
    .sort((a, b) => Math.abs(a.contextLength! - reference.contextLength!) - Math.abs(b.contextLength! - reference.contextLength!) || a.id.localeCompare(b.id))
    .slice(0, limit)
}

function defaultApiKeyFor(provider: Provider): string | undefined {
  return provider.keyStorage ? (localStorage.getItem(provider.keyStorage)?.trim() ?? "") || undefined : undefined
}

function metaText(model: ModelInfo): string {
  const parts: string[] = []
  if (model.name && model.name !== model.id) parts.push(model.name)
  if (model.contextLength !== undefined) parts.push(`${Math.round(model.contextLength / 1024)}k ctx`)
  return parts.join(" · ")
}

/** Wires the `#model-picker` dialog: provider tabs, debounced search, stale badge, manual entry, comparable suggestions. */
export function createModelPicker(dialog: HTMLDialogElement, deps: ModelPickerDeps): ModelPicker {
  const listeners = new AbortController()
  const on = (target: EventTarget, type: string, handler: (event: Event) => void) => target.addEventListener(type, handler, { signal: listeners.signal })

  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>("[data-provider]")]
  const searchInput = dialog.querySelector<HTMLInputElement>("#picker-search")!
  const staleNote = dialog.querySelector<HTMLElement>("#picker-stale")!
  const keyNote = dialog.querySelector<HTMLElement>("#picker-key-note")!
  const list = dialog.querySelector<HTMLElement>("#picker-list")!
  const manualForm = dialog.querySelector<HTMLFormElement>("#picker-manual")!
  const manualInput = manualForm.querySelector<HTMLInputElement>("input[name='model']")!

  const load = deps.load ?? loadCatalog
  const search = deps.search ?? searchCatalog
  const apiKeyFor = deps.apiKeyFor ?? defaultApiKeyFor

  let providerId: ProviderId = "sim"
  let catalog: ModelCatalog = { provider: "sim", fetchedAt: 0, source: "manual", models: [] }
  let reference: PickerTarget["reference"]
  let query = ""
  let searchResults: ModelInfo[] | undefined
  let searchResultsQuery = ""
  let loadSeq = 0
  let searchSeq = 0
  let loadAbort: AbortController | undefined
  let searchAbort: AbortController | undefined
  let debounceTimer: number | undefined

  for (const tab of tabs) {
    on(tab, "click", () => {
      const id = tab.dataset.provider as ProviderId | undefined
      if (!id || !deps.providers[id] || id === providerId) return
      providerId = id
      syncTabs()
      void loadProvider()
    })
  }
  on(searchInput, "input", () => {
    query = searchInput.value
    render()
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS)
  })
  on(list, "click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-model]") : null
    const model = button?.dataset.model
    if (!model) return
    deps.onSelect(providerId, model)
    close()
  })
  on(manualForm, "submit", (event) => {
    event.preventDefault()
    const model = normalizeManualId(manualInput.value)
    if (!model) return
    deps.onSelect(providerId, model)
    close()
  })
  on(dialog, "close", () => {
    loadSeq++
    searchSeq++
    loadAbort?.abort()
    searchAbort?.abort()
    clearTimeout(debounceTimer)
  })

  return { open, close, destroy }

  function provider(): Provider | undefined {
    return deps.providers[providerId]
  }

  function syncTabs() {
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.provider === providerId))
  }

  function open(target: PickerTarget = {}) {
    reference = target.reference
    const wanted = target.provider && deps.providers[target.provider] ? target.provider : providerId
    if (wanted !== providerId) {
      providerId = wanted
      syncTabs()
    }
    query = ""
    searchInput.value = ""
    searchResults = undefined
    searchResultsQuery = ""
    if (!dialog.open) dialog.showModal()
    searchInput.focus()
    void loadProvider()
  }

  function close() {
    if (dialog.open) dialog.close()
  }

  function destroy() {
    listeners.abort()
    loadAbort?.abort()
    searchAbort?.abort()
    clearTimeout(debounceTimer)
  }

  async function loadProvider() {
    const current = provider()
    loadAbort?.abort()
    const controller = new AbortController()
    loadAbort = controller
    const seq = ++loadSeq
    searchResults = undefined
    searchResultsQuery = ""
    if (!current) {
      catalog = { provider: providerId, fetchedAt: 0, source: "manual", models: [] }
      render()
      return
    }
    const next = await load(current, apiKeyFor(current), controller.signal)
    if (seq !== loadSeq || controller.signal.aborted) return
    catalog = next
    render()
  }

  async function runSearch() {
    const current = provider()
    const q = query.trim()
    if (!current || providerId !== "openrouter" || !q) {
      searchResults = undefined
      searchResultsQuery = ""
      render()
      return
    }
    const seq = ++searchSeq
    searchAbort?.abort()
    const controller = new AbortController()
    searchAbort = controller
    const firedFor = providerId
    const firedQuery = q
    try {
      const results = await search(current, apiKeyFor(current), q, controller.signal)
      if (seq !== searchSeq || providerId !== firedFor || query.trim() !== firedQuery) return
      searchResults = results
      searchResultsQuery = firedQuery
    } catch {
      if (seq === searchSeq) {
        searchResults = undefined
        searchResultsQuery = ""
      }
    }
    render()
  }

  function visibleModels(): ModelInfo[] {
    if (providerId === "openrouter" && query.trim() && searchResultsQuery === query.trim() && searchResults) return searchResults
    return filterModels(catalog.models, query)
  }

  function suggestions(): ModelInfo[] {
    if (!reference || reference.provider === providerId || query.trim()) return []
    const refInfo: ModelInfo = { id: reference.model, name: reference.model, contextLength: undefined, pricing: undefined }
    return suggestComparable(refInfo, catalog.models)
  }

  function render() {
    const current = provider()
    staleNote.hidden = catalog.source !== "cache"
    if (catalog.source === "cache") {
      staleNote.textContent = `showing cached list · fetched ${new Date(catalog.fetchedAt).toLocaleString()}`
    }
    const needsKey = current?.keyStorage !== undefined && apiKeyFor(current) === undefined
    keyNote.hidden = !needsKey
    if (needsKey && current) keyNote.textContent = `no ${current.name} key saved — add one under "keys" or enter a model id below`

    list.replaceChildren()
    const suggested = suggestions()
    if (suggested.length > 0) {
      const heading = document.createElement("p")
      heading.className = "meta"
      heading.textContent = "suggested comparable"
      list.append(heading)
      for (const model of suggested) list.append(modelButton(model))
    }

    const visible = visibleModels()
    const shown = query.trim() ? visible : visible.slice(0, UNFILTERED_LIMIT)
    if (suggested.length > 0 && shown.length > 0) {
      const heading = document.createElement("p")
      heading.className = "meta"
      heading.textContent = "all models"
      list.append(heading)
    }
    if (shown.length === 0) {
      const empty = document.createElement("p")
      empty.className = "meta"
      empty.textContent = catalog.source === "manual" && catalog.models.length === 0 ? "no models found — enter a model id below" : "no matches"
      list.append(empty)
    }
    for (const model of shown) list.append(modelButton(model))
    if (!query.trim() && visible.length > shown.length) {
      const more = document.createElement("p")
      more.className = "meta"
      more.textContent = `…and ${visible.length - shown.length} more — type to search`
      list.append(more)
    }
  }

  function modelButton(model: ModelInfo): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.setAttribute("role", "option")
    button.dataset.model = model.id
    button.append(document.createTextNode(model.id))
    const meta = metaText(model)
    if (meta) {
      button.append(" ")
      const span = document.createElement("span")
      span.className = "meta"
      span.textContent = meta
      button.append(span)
    }
    return button
  }
}
