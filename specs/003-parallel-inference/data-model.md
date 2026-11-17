# Data Model: Parallel Model Comparison

## Entities

### Provider

An inference service a pane can run against.

| Field            | Type                                  | Notes                                                           |
| ---------------- | ------------------------------------- | --------------------------------------------------------------- |
| `id`             | `"sim" \| "cerebras" \| "openrouter"` | Registry key; extensible to further OpenAI-compatible providers |
| `name`           | `string`                              | Display label ("Cerebras", "OpenRouter", "Simulator")           |
| `keyStorage`     | `string \| undefined`                 | localStorage key for the user's API key; `undefined` for `sim`  |
| `chatEndpoint`   | `string`                              | HTTPS allowlisted constant per provider                         |
| `modelsEndpoint` | `string \| undefined`                 | Catalog endpoint; `undefined` for `sim`                         |

Validation: endpoints are module constants, never user input (constitution IV).

### ModelInfo

One selectable model in a provider's catalog.

| Field           | Type                                  | Notes                                                        |
| --------------- | ------------------------------------- | ------------------------------------------------------------ |
| `id`            | `string`                              | Provider-specific id (`gpt-oss-120b`, `openai/gpt-oss-120b`) |
| `name`          | `string`                              | Human-readable label; falls back to `id`                     |
| `contextLength` | `number \| undefined`                 | From catalog metadata when present                           |
| `pricing`       | `{ prompt, completion } \| undefined` | USD per token, OpenRouter only                               |

### ModelCatalog

Cached result of `loadCatalog` (`src/llm/catalog.ts`).

| Field       | Type                            | Notes                                      |
| ----------- | ------------------------------- | ------------------------------------------ |
| `provider`  | `Provider["id"]`                | Owning provider                            |
| `fetchedAt` | `number`                        | `Date.now()`; drives staleness display     |
| `models`    | `ModelInfo[]`                   | Sorted for display; searchable             |
| `source`    | `"live" \| "cache" \| "manual"` | Where the list came from — shown in picker |

### PaneConfig

Persisted per-slot configuration (localStorage `arena-panes`).

| Field      | Type             | Notes                                           |
| ---------- | ---------------- | ----------------------------------------------- |
| `slot`     | `0..3`           | Grid position                                   |
| `provider` | `Provider["id"]` |                                                 |
| `model`    | `string`         | `ModelInfo.id`, or a manually entered id        |
| `focused`  | `boolean`        | Which pane receives bar edits in "focused" mode |

Validation: ≤ `min(4, viewportCapacity)` entries; capacity is computed at runtime (not persisted), and restoring a config with more panes than the current capacity clamps to the first N slots. Duplicate (provider, model) pairs are allowed — useful for A/B same-model runs.

### PaneState (runtime, not persisted)

| Field      | Type                  | Notes                                                      |
| ---------- | --------------------- | ---------------------------------------------------------- |
| `stream`   | `TextStream`          | `createTextStream` instance; owns text, abort, timing      |
| `steering` | `Steering`            | `{ leads, controls }` — per-pane, independently mutable    |
| `status`   | `StreamActivity`      | `{ isGenerating, firstChunkMs, wordsPerSecond }`           |
| `error`    | `string \| undefined` | Last provider failure; cleared on next successful generate |

State transitions: `idle → generating → idle | error`; `truncate`/`regenerate` abort in-flight generation (existing `createTextStream` semantics).

### SteeringAction

An edit to `Steering` produced by the shared bar.

| Field      | Type            | Notes                                          |
| ---------- | --------------- | ---------------------------------------------- |
| `target`   | `"all" \| slot` | Broadcast or single pane                       |
| `steering` | `Steering`      | Full replacement value applied to target panes |

## Relationships

- `PaneConfig` 1—1 `PaneState` at runtime; config persists, state does not.
- `Provider` 1—N `ModelInfo` (via `ModelCatalog`).
- `PaneState` N—1 `Provider` + `ModelInfo` (the configured pair).
- `SteeringAction` N—M `PaneState` (all-or-one fan-out).
- Pane count is bounded by runtime viewport capacity, not just the persisted config: `min(4, 1 on coarse-pointer/narrow viewports, else 4)`.

## Shared Story Prefix

All panes continue from the same opening (`expandToStoryStart` picks a random `STORY_OPENINGS` entry per pane today — for comparison, the arena fixes one opening per session and shares it, or lets the user pick). Divergence after the prefix is expected and desired.
