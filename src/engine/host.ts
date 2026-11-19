import type { AttentionBox } from "../text/attention.ts"
import type { Dimension } from "../text/dimension.ts"
import type { Focus, Influence } from "../text/influence.ts"
import type { Relevance, RelevanceRequest } from "../text/keyword-relevance.ts"
import type { Realization, RealizationRequest } from "../text/realization.ts"
import { focusBoxes, influence, realization, relevance } from "./analysis.ts"
import { complete, type CompletionChunk, type LocalCompletion } from "./generation.ts"
import type { LayerKind } from "./instruments.ts"
import { loadEngine, type Engine } from "./model.ts"
import { deleteModel, fetchModel, isDownloaded, kept, MODELS, type Model, type ModelFiles } from "./models.ts"
import { findVectors, GENERIC, type Vectors } from "./steering.ts"

export type EngineModel = {
  id: string
  name: string
  size: number
  downloaded: boolean
}

export type EngineHealth = { models: EngineModel[]; unsupported?: string }

export type ModelLayout = { model: string; layers: LayerKind[] }

export type LoadProgress = { status: "downloading"; done: number; total: number } | { status: "loading" } | { status: "ready" }

type OfModel = { model: string }
type Nothing = Record<string, never>

/** What the page asks of the engine: each request's body, and the items that answer it. */
export type Routes = {
  health: [Nothing, EngineHealth]
  load: [OfModel, LoadProgress]
  download: [OfModel, LoadProgress]
  delete: [OfModel, never]
  layers: [Nothing, ModelLayout]
  complete: [LocalCompletion, CompletionChunk]
  attention: [{ text: string }, AttentionBox]
  influence: [{ sentences: string[]; focus: Focus }, Influence]
  relevance: [RelevanceRequest, Relevance]
  realization: [RealizationRequest, Realization]
  dimensions: [{ text: string; taken: Dimension[]; size: number }, Dimension]
}

type Answers = { [Route in keyof Routes]: (body: Routes[Route][0], signal: AbortSignal) => AsyncIterable<Routes[Route][1]> }

const PROGRESS_INTERVAL_MS = 500

export function createHost() {
  let loaded: { engine: Engine; vectors: Vectors } | undefined
  let preparing: ReturnType<typeof prepare> | undefined
  const fetching = new Map<string, { done: number; files: Promise<ModelFiles> }>()

  const answers: Answers = {
    health: async function* () {
      yield await health()
    },
    load: ({ model }) => load(model),
    download: ({ model }) => download(model),
    delete: async function* ({ model }) {
      await deleteModel(modelOf(model))
    },
    layers: async function* () {
      const { engine } = await ready()
      yield { model: engine.name, layers: engine.layerKinds }
    },
    complete: async function* (request, signal) {
      const { engine, vectors } = await ready()
      yield* complete(engine, vectors, request, signal)
    },
    attention: async function* ({ text }, signal) {
      yield* await focusBoxes((await ready()).engine, text, signal)
    },
    influence: async function* ({ sentences, focus }, signal) {
      yield* await influence((await ready()).engine, sentences, focus, signal)
    },
    relevance: async function* (request, signal) {
      yield* await relevance((await ready()).engine, request, signal)
    },
    realization: async function* (request, signal) {
      const { engine, vectors } = await ready()
      yield* await realization(engine, vectors, request, signal)
    },
    dimensions: async function* ({ text, taken, size }, signal) {
      yield* await (await ready()).vectors.menu(text, taken, size, signal)
    },
  }

  return { answer }

  /** A body arrives as the page posted it; `streamEngine` typed it where it was written. */
  function answer(route: keyof Routes, body: unknown, signal: AbortSignal) {
    return (answers[route] as (body: unknown, signal: AbortSignal) => AsyncIterable<unknown>)(body, signal)
  }

  /** A request that arrives while a model loads waits for it. */
  async function ready() {
    await preparing?.ready.catch(() => {})
    if (!loaded) throw new Error("no model loaded")
    return loaded
  }

  async function health(): Promise<EngineHealth> {
    const models = await Promise.all(MODELS.map(async (model) => ({ id: model.id, name: model.name, size: model.size, downloaded: await isDownloaded(model) })))
    return { models, unsupported: await unsupported() }
  }

  /** A page that stops listening leaves the load running. */
  async function* load(id: string): AsyncGenerator<LoadProgress> {
    const model = modelOf(id)
    if (loaded?.engine.id !== id) {
      const current = preparing?.id === id ? preparing : (preparing = prepare(model))
      yield* follow(current.ready, () => current.progress())
    }
    yield { status: "ready" }
  }

  async function* download(id: string): AsyncGenerator<LoadProgress> {
    const model = modelOf(id)
    if (await isDownloaded(model)) return
    const transfer = fetchOnce(model)
    yield* follow(transfer.files, (): LoadProgress => ({ status: "downloading", done: transfer.done, total: model.size }))
  }

  function prepare(model: Model) {
    const state = { id: model.id, progress: (): LoadProgress => ({ status: "loading" }), ready: Promise.resolve() }
    state.ready = (async () => {
      const isNew = !(await isDownloaded(model))
      const transfer = fetchOnce(model)
      if (isNew) state.progress = () => ({ status: "downloading", done: transfer.done, total: model.size })
      const files = await transfer.files
      state.progress = () => ({ status: "loading" })
      const engine = await loadEngine(model, files)
      const vectors = await findVectors(engine, (recipe, make) => kept(model, recipe, make))
      for (const dimension of GENERIC) await vectors.directionsOf(dimension)
      loaded = { engine, vectors }
    })().finally(() => {
      if (preparing === state) preparing = undefined
    })
    return state
  }

  function fetchOnce(model: Model) {
    const under = fetching.get(model.id)
    if (under) return under
    const transfer = { done: 0, files: fetchModel(model, (done) => (transfer.done = done)).finally(() => fetching.delete(model.id)) }
    fetching.set(model.id, transfer)
    return transfer
  }
}

async function* follow<T>(ready: Promise<unknown>, progress: () => T) {
  while (!(await Promise.race([ready.then(() => true), wait(PROGRESS_INTERVAL_MS)]))) yield progress()
}

async function unsupported() {
  if (!("gpu" in navigator) || !("Float16Array" in globalThis)) return "it needs WebGPU, which Chrome and Edge have"
  const adapter = await navigator.gpu.requestAdapter()
  // The models are stored in 16-bit floats, which a GPU supports only as an optional feature.
  if (!adapter?.features.has("shader-f16")) return "its GPU cannot compute in 16-bit floats, which the models need"
}

function modelOf(id: string) {
  const model = MODELS.find((candidate) => candidate.id === id)
  if (!model) throw new Error(`unknown model ${id}`)
  return model
}

function wait(ms: number) {
  return new Promise<false>((resolve) => setTimeout(() => resolve(false), ms))
}
