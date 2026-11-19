import type { Routes } from "../engine/host.ts"
import type { EngineCall, EngineReply } from "../engine/worker.ts"

export type { EngineModel, LoadProgress, ModelLayout } from "../engine/host.ts"

let worker: Worker | undefined
let lastId = 0
const listeners = new Map<number, (reply: EngineReply) => void>()

export async function* streamEngine<Route extends keyof Routes>(route: Route, body: Routes[Route][0], signal: AbortSignal): AsyncIterable<Routes[Route][1]> {
  const id = ++lastId
  const replies: EngineReply[] = []
  let wake = () => {}
  listeners.set(id, (reply) => {
    replies.push(reply)
    wake()
  })
  const onAbort = () => wake()
  signal.addEventListener("abort", onAbort)
  post({ id, route, body })
  try {
    while (true) {
      signal.throwIfAborted()
      const reply = replies.shift()
      if (!reply) await new Promise<void>((resolve) => (wake = resolve))
      else if ("error" in reply) throw new Error(`engine: ${reply.error}`)
      else if ("done" in reply) return
      else yield reply.item as Routes[Route][1]
    }
  } finally {
    signal.removeEventListener("abort", onAbort)
    listeners.delete(id)
    post({ id, cancel: true })
  }
}

function post(call: EngineCall) {
  if (!worker) {
    worker = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" })
    worker.addEventListener("message", ({ data }: MessageEvent<EngineReply>) => listeners.get(data.id)?.(data))
    worker.addEventListener("error", (event) => {
      for (const [id, listener] of listeners) listener({ id, error: event.message || "the engine stopped" })
    })
  }
  worker.postMessage(call)
}
