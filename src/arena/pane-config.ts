import { PROVIDERS, type ProviderId } from "../llm/provider.ts"
import { MAX_PANES } from "./pane-grid.ts"
import type { PaneConfig } from "./pane.ts"

export const PANES_STORAGE_KEY = "arena-panes"

export function defaultPaneConfigs(): PaneConfig[] {
  return [0, 1].map((slot) => ({ slot, provider: "sim", model: "sim" }))
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDERS[value as ProviderId] !== undefined
}

/** Reads the stored `arena-panes` JSON back into slot-ordered configs; invalid entries fall back to sim, excess slots past 4 are dropped. */
export function loadPaneConfigs(raw: string | null): PaneConfig[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null")
    if (!Array.isArray(parsed)) return defaultPaneConfigs()
    const used = new Set<number>()
    const configs = parsed.slice(0, MAX_PANES).flatMap((entry): PaneConfig[] => {
      if (typeof entry !== "object" || entry === null) return []
      const { provider, model, slot, focused } = entry as Record<string, unknown>
      const storedSlot = typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < MAX_PANES ? slot : undefined
      let free = storedSlot !== undefined && !used.has(storedSlot) ? storedSlot : undefined
      for (let candidate = 0; candidate < MAX_PANES && free === undefined; candidate++) {
        if (!used.has(candidate)) free = candidate
      }
      if (free === undefined) return []
      used.add(free)
      return [
        {
          slot: free,
          provider: isProviderId(provider) ? provider : "sim",
          model: typeof model === "string" && model ? model : "sim",
          ...(focused === true ? { focused: true } : {}),
        },
      ]
    })
    return configs.length ? configs.sort((a, b) => a.slot - b.slot) : defaultPaneConfigs()
  } catch {
    return defaultPaneConfigs()
  }
}

export function serializePaneConfigs(configs: PaneConfig[]): string {
  return JSON.stringify(configs)
}
