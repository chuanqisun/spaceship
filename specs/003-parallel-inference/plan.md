# Implementation Plan: Parallel Model Comparison

**Branch**: `003-parallel-inference` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-parallel-inference/spec.md`

## Summary

Run up to four independent story-inference runtimes ("panes") side by side on a new comparison page, each bound to a provider + model chosen from auto-discovered model catalogs (Cerebras and OpenRouter first). A provider abstraction (`listModels` + streaming `chat`) replaces the hard-coded Cerebras client, and each pane reuses the existing composable seams (`createTextStream`, caret/layout/words, steering types). One page hosts all panes in a CSS grid — no runtime splitting across windows, since streams, keys, and steering are already per-instance factories and AbortSignal-cancellable.

## Technical Context

**Language/Version**: TypeScript ~7.0.2 (strict, `erasableSyntaxOnly`), ES modules

**Primary Dependencies**: Vite 8, `@chenglou/pretext` (text layout), Vitest + playwright-core (tests). No new runtime dependencies.

**Storage**: `localStorage` — API keys per provider (`cerebras-api-key`, `openrouter-api-key`), cached model catalogs with fetch timestamp, pane layout config.

**Testing**: Vitest unit (`*.test.ts` colocated) with stubbed `fetch`; playwright-core e2e in `e2e/` driving the simulator path (no keys, no network).

**Target Platform**: Evergreen browsers (Chromium, Firefox, Safari), static GitHub Pages deploy.

**Project Type**: Client-side web app (static SPA, multi-page: existing `index.html`/`extra/*` plus new comparison page).

**Performance Goals**: Each pane keeps the 16 ms frame budget for its own layout/paint; four panes = four independent rAF-bounded renderers. Generation streams are network-bound; per-pane AbortControllers isolate failures.

**Constraints**: Keys only to their provider's HTTPS endpoint (constitution IV); all async work as `AsyncIterable` + `AbortSignal` (III); every live capability needs a simulated counterpart (III); provider endpoints are module-constant allowlist entries; adding a provider requires an ADR (VII).

**Scale/Scope**: ≤4 panes, ≤~300-word buffer per pane, two providers initially (simulated + Cerebras + OpenRouter).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                    | Status | Notes                                                                                                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Composition-First TS      | PASS   | New `src/arena/` page: `main.ts` composition root; pane/provider/model-catalog as factory modules; no classes.                              |
| II. Semantic, Accessible UI  | PASS   | Comparison UI authored as semantic HTML in `index.html`-style page markup; `<dialog>` for model picker; CSS grid layout; uniform mono font. |
| III. Realtime & Cancellation | PASS   | Reuses `AsyncIterable`+`AbortSignal` seams; per-pane AbortControllers; simulated `TextSource` fallback per pane.                            |
| IV. Secure by Default        | PASS   | OpenRouter is a new provider → endpoint allowlist entry + ADR required; keys stay in localStorage, sent only to that provider.              |
| V. Privacy & Cost            | PASS   | No telemetry; model catalogs are public GETs, chat calls carry only story text the user generates.                                          |
| VI. Test-First               | PASS   | Provider parsing/catalog caching get unit tests with stubbed fetch; pane grid + steer-all get e2e in sim mode.                              |
| VII. Docs as Code            | PASS   | README + CHANGELOG + ADR (new provider) required.                                                                                           |
| VIII. CI/CD                  | PASS   | Standard `npm run check` gate; no workflow changes needed.                                                                                  |
| IX. Supply Chain             | PASS   | No new dependencies.                                                                                                                        |

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-parallel-inference/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── providers.md     # Provider/model-catalog contract
│   └── pane.md          # Pane lifecycle & steering contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
index.html                     # existing flagship page (unchanged)
arena.html                     # NEW: comparison page shell (semantic HTML, pane slots, shared steering bar, model-picker dialog)
src/
├── llm/
│   ├── cerebras.ts            # refactor: keep streamCompletion internals; expose Provider impl
│   ├── openrouter.ts          # NEW: OpenRouter provider (chat + model catalog)
│   ├── provider.ts            # NEW: Provider/ModelInfo types + registry
│   ├── sse.ts                 # NEW: shared SSE data:/[DONE]/delta.content parser
│   ├── catalog.ts             # NEW: model-list fetch, cache, search, comparability hints
│   └── decisions.ts           # unchanged (Gemini decisions API, used by flagship auxiliary sources)
├── arena/
│   ├── main.ts                # NEW composition root: builds panes, wires shared steering + picker
│   ├── pane.ts                # NEW: one runtime — stream + caret knob + steering + status, bound to a DOM subtree
│   ├── steering-bar.ts        # NEW: shared key-phrase/control editor targeting all-or-focused pane
│   ├── pane-grid.ts           # NEW: layout/ordering of up to 4 panes, add/remove/reorder, viewport-aware pane capacity
│   ├── story-source.ts        # NEW: TextSource factory bridging Provider.chat to createTextStream
│   └── *.test.ts              # colocated unit tests
├── story/
│   └── request.ts             # NEW: shared story request builders (system prompt, steered user message)
└── text/                      # existing modules reused as-is where possible
    ├── text-stream.ts         # createTextStream reused per pane
    ├── live-completion.ts     # flagship live source; request builders extracted to src/story/request.ts
    ├── live-dimension.ts      # reused for per-pane dimension menus
    ├── completion.ts          # simulatedSource reused for sim panes
    └── ...                    # caret/layout/words/segments/points reused
```

**Structure Decision**: Single project, new `arena.html` page + `src/arena/` feature folder per AGENTS.md ("one module per concern, grouped in a folder per feature"; each page's `main.ts` is a composition root). The flagship `src/text/` page is untouched except where modules are generalized to accept a provider parameter.

## Phase 0: Research → `research.md`

Resolved unknowns:

1. **Runtime topology** — one page, N pane instances vs separate windows/instances.
   Decision: single page, up to 4 panes. Rationale: `createTextStream` and all live sources are already factories closing over state; isolation comes free via per-pane `AbortController`s; separate windows would duplicate key entry, steering sync, and layout code. Alternative rejected: separate browser instances (spec allows it as fallback, but nothing requires it — shared-prefix comparison is easier in one DOM).
2. **Provider abstraction shape** — `Provider` = `{ id, name, keyStorage, endpoints, listModels, chat }`. `chat` yields `AsyncIterable<string>` deltas with the same SSE parsing `cerebras.ts` already does; OpenRouter is OpenAI-compatible so the parser is shared.
3. **Model discovery** — both providers expose list endpoints: Cerebras `GET https://api.cerebras.ai/v1/models` (Bearer key; public variant exists without key), OpenRouter `GET https://openrouter.ai/api/v1/models` (key optional; supports `?q=` search, `output_modalities=text`, server-side sort). Cache catalog in localStorage with timestamp; manual-entry fallback in picker.
4. **Comparable-model suggestions** — OpenRouter model records carry pricing/context; Cerebras list is small. Suggestion heuristic: match by parameter class where metadata exists, else alphabetical/curated pairing; kept advisory only (FR-006 is SHOULD).
5. **Pane steering scope** — full flagship machinery (pointer magnetism, attention rail, relevance, sound) does not scale to 4 panes. Pane gets: story text column, draggable caret knob (reuse `caretAt`/`pointAt`/`makeDraggable`), per-pane `Steering` state, regenerate-on-change via `createTextStream`, and status (first-chunk ms, words/sec). Steering edits go through a shared bar that targets all panes or the focused pane — satisfies FR-008/009 without replicating the flagship's LLM-assisted knob menus.
6. **Simulated counterpart** — each pane accepts a `sim` provider backed by `simulatedSource`/`simulatedDimension` so e2e and offline demo work without keys (constitution III).
7. **Viewport-aware pane capacity** — Decision: capacity is geometric — `min(4, floor(width / MIN_PANE_WIDTH))`, forced to 1 on narrow layout or a short coarse-pointer viewport (e.g. phone landscape). Rationale: reuses `src/text/breakpoints.ts` from spec 002 plus a height check; a phone cannot fit two readable story columns, but a large touchscreen can. Pointer type alone never caps panes — it only sizes controls. Alternative rejected: scroll/zoom squeeze (illegible, violates readability goal).

## Phase 1: Design → `data-model.md`, `contracts/`, `quickstart.md`

See generated artifacts. Key contracts:

- `contracts/providers.md` — `Provider`, `ModelInfo`, `ChatRequest`, catalog fetch/cache rules, endpoint allowlist.
- `contracts/pane.md` — `createPane(element, config)` API: `steer()`, `regenerate()`, `destroy()`, status events.
- `quickstart.md` — runnable validation: sim-mode 4-pane grid, live Cerebras vs OpenRouter comparison, failure isolation, steer-all.

## Complexity Tracking

No constitution violations.
