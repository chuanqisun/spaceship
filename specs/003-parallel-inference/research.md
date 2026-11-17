# Research: Parallel Model Comparison

## R1 — Runtime topology: one page vs separate instances

**Decision**: One new page (`arena.html`) hosting up to four pane instances in a CSS grid.

**Rationale**:

- Every inference concern in the codebase is already a factory closing over state (`createTextStream`, `liveSource`, `liveDimension`, …), and async work is `AsyncIterable` + `AbortSignal`. N instances coexist with per-instance cancellation — no shared mutable runtime state exists to split.
- Isolation is per-pane `AbortController`; a failed provider cannot corrupt siblings (spec FR-010) because there is no shared stream.
- Separate browser windows/instances would force duplicating: key storage prompts, the shared story prefix, steering broadcast, and the comparison layout — all for isolation the AbortSignal design already provides.
- The user asked "split the runtimes completely or two separate instances" — the honest answer from the code: runtimes are already instances; the only real coupling is the single hard-coded provider client and single-page composition, both of which this plan removes.

**Alternatives considered**:

- Separate browser windows/tabs: rejected — duplicates UX and state, makes "steer together" a cross-window messaging problem.
- Web Workers per pane: rejected — all inference is network-bound; workers add serialization cost and complicate DOM rendering for zero benefit.
- Extending the flagship `src/text/` page in place: rejected — that page's `main.ts` is a 631-line singleton composition deeply bound to one DOM; a separate page reuses its modules without destabilising the flagship.

## R2 — Provider abstraction

**Decision**: `src/llm/provider.ts` defines:

```ts
type Provider = {
  id: "cerebras" | "openrouter" | "sim"
  name: string
  keyStorage?: string // localStorage key; absent for sim
  chatEndpoint: string // module constant, HTTPS, allowlisted
  modelsEndpoint?: string // catalog endpoint; absent for sim
  listModels(apiKey, signal): Promise<ModelInfo[]>
  chat(apiKey: string | undefined, request: ChatRequest): AsyncIterable<string> // SSE deltas
}
```

`ChatRequest` mirrors today's `CompletionRequest` — `apiKey` first — plus `model`. `cerebras.ts`'s SSE line-parser is extracted and shared; OpenRouter's `/chat/completions` is OpenAI-compatible so the same parser applies (its SSE `delta.content` shape is identical).

**Rationale**: Both providers speak OpenAI-style chat completions over SSE; the only differences are base URL, auth header (both Bearer), model id namespace, and catalog endpoint. One parser, two thin providers.

**Alternatives considered**: OpenAI SDK / Vercel AI SDK — rejected, adds a dependency for ~100 lines of fetch+SSE (constitution IX: prefer platform, minimal deps).

## R3 — Model auto-discovery

**Decision**: Fetch catalogs live, cache in localStorage with timestamp.

- Cerebras: `GET https://api.cerebras.ai/v1/models` with `Authorization: Bearer <key>` → `{ data: [{ id, owned_by, … }] }`. (A public no-auth variant also exists; keyed call preferred so the list reflects the user's tier.)
- OpenRouter: `GET https://openrouter.ai/api/v1/models` → `{ data: [{ id: "author/slug", name, context_length, pricing, … }] }`. Auth optional for listing; `?q=` and `output_modalities=text` supported for search/filter. `GET /api/v1/models/user` (keyed) is the better choice when a key exists — it reflects workspace guardrails.
- Cache: `{ fetchedAt, models }` per provider in localStorage; stale cache shown with timestamp while revalidating; picker always offers manual entry (FR-005).

**Rationale**: Both endpoints verified against current docs (see sources). Catalogs change as providers add models — live fetch + cache beats a hard-coded list (the current `MODEL = "gpt-oss-120b"` constant is exactly the problem).

## R4 — Comparable-model suggestions (FR-006, SHOULD)

**Decision**: Advisory pairing only. Heuristic: prefer OpenRouter models whose id/name suggests the same family/size class as the Cerebras pick (e.g. `gpt-oss-120b` ↔ `openai/gpt-oss-120b`); otherwise rank by context length proximity. Presented as a "suggested" section in the picker, never enforced.

**Rationale**: There is no canonical capability score shared across providers; honest suggestions beat fake precision.

## R5 — Pane steering scope

**Decision**: Pane = story column + caret knob + per-pane `Steering` + regenerate-on-change + status line (first-chunk ms, words/sec — FR-011). A shared steering bar edits `Steering { leads, controls }` and targets either all panes or the focused pane.

**Rationale**: The flagship's steering surface (attention boxes, future-knob fan menus, pointer magnetism, relevance rail, sound) is a research artefact tuned for one pane; replicating it ×4 would quadruple the interaction surface and the LLM-assisted sub-requests (dimension menus, relevance) that share rate limits. The spec's minimum viable pane is "story text stream + steering controls"; independent steerability (FR-008) is satisfied because each pane owns its `Steering` state and its own `createTextStream` regeneration, and steer-all (FR-009) is one broadcast call.

**Alternatives considered**: Full per-pane flagship UI — rejected for v1 (scope); per-pane independent steering bars only — rejected because "drive together" is the primary use case.

**Deferred**: attention boxes, future-knob menus, relevance rail, sound per pane. Tracked as follow-up; the pane API (`contracts/pane.md`) leaves room to add them later.

## R6 — Simulated counterpart

**Decision**: Register `sim` as a provider whose `chat`/`listModels` are backed by existing `simulatedSource`/`simulatedDimension` (offline, deterministic-ish, no keys).

**Rationale**: Constitution III requires every live capability to have a simulated counterpart; it also makes e2e tests hermetic and lets the 4-pane grid be demoed without spending tokens.

## Sources

- OpenRouter models API: https://openrouter.ai/docs/api_reference/models (`GET /api/v1/models`, `?q=`, `output_modalities`, `/models/user`)
- OpenRouter chat completions: `POST https://openrouter.ai/api/v1/chat/completions`, OpenAI-compatible SSE
- Cerebras list models: https://inference-docs.cerebras.ai/api-reference/models/list-models (`GET /v1/models`, Bearer)
- Cerebras public models: https://inference-docs.cerebras.ai/api-reference/models/public-models (no-auth variant, `?format=openrouter|huggingface`)
