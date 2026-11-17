# Tasks: Parallel Model Comparison

**Input**: Design documents from `/specs/003-parallel-inference/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/providers.md, contracts/pane.md, quickstart.md

**Tests**: Included — constitution VI (Test-First Quality) requires failing tests before implementation for live sources (stubbed `fetch`), pure logic, and new gestures/interactions in `e2e/`.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1; US1 delivers the runnable comparison, US2 the model picking it depends on for live use — US1 can ship with a fixed/sim provider pair and still be independently testable.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Page shell and build wiring for the new comparison page

- [ ] T001 Create `arena.html` page shell with semantic HTML: `<main>` grid of up to 4 `<section class="pane">` slots (each containing header with provider/model label + status, text column, knob `<button>`, error slot), a shared steering bar, an "add pane" control, a native `<dialog>` for the model picker, and a native `<dialog>` for API keys — styled per AGENTS.md (mono font, CSS variables, grid/flex, system defaults)
- [ ] T002 [P] Register `arena.html` as a Vite build input in `vite.config.ts`: add `arena: resolve(import.meta.dirname, "arena.html")` to `rollupOptions.input` (vite only auto-discovers `extra/*.html`; `arena.html` sits at repo root) and add a link to it from `index.html`'s tray
- [ ] T003 Write ADR `docs/adr/NNNN-openrouter-provider.md` recording the new provider, its endpoints, and the connect-src allowlist addition (`https://openrouter.ai`); update CSP notes in `index.html`/shared styles if a CSP exists

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provider abstraction and shared inference plumbing every story needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create `src/llm/provider.ts` with `ChatRequest`, `ModelInfo`, `Provider` types and a `PROVIDERS` registry per `contracts/providers.md` (fields: `id`, `name`, `keyStorage?`, `chatEndpoint`, `modelsEndpoint?`, `listModels`, `chat(request: ChatRequest)`; `ChatRequest` carries `apiKey: string | undefined` as its first field, mirroring `CompletionRequest`)
- [ ] T005 [P] Extract the SSE `data:`/`[DONE]`/`delta.content` parser from `src/llm/cerebras.ts` into a shared helper (e.g. `src/llm/sse.ts`) with a colocated `sse.test.ts` covering chunked lines, `[DONE]`, and malformed JSON tolerance
- [ ] T006 Refactor `src/llm/cerebras.ts` into a `Provider` implementation using the shared SSE parser; keep `streamCompletion`, `storedApiKey`, `KEY_STORAGE` exports working for existing `live-*.ts` callers (compatibility wrapper or update call sites)
- [ ] T007 [P] Create `src/llm/openrouter.ts` implementing `Provider` for `https://openrouter.ai/api/v1` (Bearer auth, OpenAI-compatible chat body with `model`, `stream: true`); add `KEY_STORAGE = "openrouter-api-key"`
- [ ] T008 [P] Create `src/llm/sim.ts` provider (`id: "sim"`, no key) whose `chat` is a stub/unused by panes — panes get `simulatedSource` directly via `src/arena/story-source.ts` (T011); `listModels` returns a single synthetic model
- [ ] T009 Move the story request builders into `src/story/request.ts` so arena panes reuse identical prompts without importing the flagship's live module: `STORY_REQUEST`/`STORY_MAX_WORDS` stay exported from `src/story/prompt.ts`; move `STEERED_SYSTEM_PROMPT`, `steeredUserMessage`, `withoutEcho` out of `src/text/live-completion.ts` (keep re-exports if needed for compat)
- [ ] T010 Create `src/arena/opening.ts` that fixes ONE story opening per arena session (shared across all panes, per data-model "Shared Story Prefix") and `src/arena/opening.test.ts` verifying all panes receive the same prefix
- [ ] T011 Create `src/arena/story-source.ts`: a factory returning a `TextSource` (`complete(prefix, steering, signal)`) for a given provider+model — for `sim` return `simulatedSource` from `src/text/completion.ts` directly; for live providers wrap `Provider.chat(request)` into the delta contract, building requests via the shared story-request helpers (`src/story/request.ts`: system prompt, steered user message)

**Checkpoint**: Foundation ready — panes can be built against `TextSource` from `story-source.ts` and the shared story request

---

## Phase 3: User Story 1 — Side-by-side model comparison (Priority: P1) 🎯 MVP

**Goal**: Up to four panes stream independent continuations of the same story simultaneously; failures and speed differences are per-pane visible

**Independent Test**: Open `arena.html` in sim mode, run 4 panes, confirm independent streaming; stub one provider to fail and confirm siblings continue

### Tests for User Story 1 ⚠️

- [ ] T012 [P] [US1] Unit test `src/arena/pane.test.ts`: `createTextStream`-backed pane isolates abort/error — a rejecting `chat` leaves sibling panes' streams untouched (stubbed fetch, hermetic)
- [ ] T013 [P] [US1] E2E test `e2e/arena.test.mjs`: sim mode renders 4 panes, each shows growing word counts, and pane knob scrub regenerates only that pane

### Implementation for User Story 1

- [ ] T014 [US1] Implement `src/arena/pane.ts` — `createPane(root, config, deps)` per `contracts/pane.md`: owns `createTextStream` with a `TextSource` obtained from `src/arena/story-source.ts` (provider+model → `TextSource`), caret knob drag (reuse `caretAt`/`pointAt`/`makeDraggable` from `src/text/`), per-pane `Steering` state, `activity()` status, error slot rendering, `destroy()`
- [ ] T015 [US1] Implement `src/arena/pane-grid.ts` — lays out N≤4 pane sections in the `arena.html` grid (1/2/4 column arrangements), handles add/remove/reorder DOM placement, and computes the effective pane limit from viewport geometry per `contracts/pane.md` "Capacity" (1 on narrow or short-coarse viewports and when width can't fit two minimum panes, up to 4 otherwise)
- [ ] T016 [US1] Implement `src/arena/main.ts` composition root: queries DOM, creates panes from `PaneConfig`s (default: 2 sim panes), wires knob/status/error rendering, restores `arena-panes` config from localStorage
- [ ] T017 [US1] Add pane status display in `arena.html`/pane header: provider+model id, generating indicator, `firstChunkMs`, `wordsPerSecond` from `stream.activity()` (FR-011)
- [ ] T018 [US1] Failure isolation: pane `chat` errors render in the pane's error slot and clear on next successful generate; verify no unhandled rejection escapes to siblings (T012 covers)
- [ ] T041 [P] [US1] Unit test `src/arena/pane-grid.test.ts` (or `pane-capacity.test.ts`): effective pane limit is 1 on stubbed narrow `(max-width: 44rem)` and short-coarse `(pointer: coarse) and (max-height: 30rem)` matchMedia and when the stubbed width fits fewer than two `MIN_PANE_WIDTH`s, up to 4 otherwise; a coarse pointer alone must NOT cap; add-pane/picker entry points reject pane 2 on capacity-1 viewports
- [ ] T042 [US1] Implement viewport-aware capacity in `src/arena/pane-grid.ts` + `arena.html`: reuse `isNarrowLayout`/`isCoarsePointer` from `src/text/breakpoints.ts` plus the `MIN_PANE_WIDTH` geometry rule in `contracts/pane.md`; cap panes at 1 only where panes can't stay readable; disable "add pane" and comparison entry points with a visible explanation (for example: "Side-by-side comparison needs a larger screen — open on a desktop or a bigger window")
- [ ] T043 [P] [US1] E2E test in `e2e/arena.test.mjs` with an iPhone-16 touch viewport (copy context setup from `e2e/mobile.test.mjs`): arena shows ≤1 pane / disabled notice and no multi-pane offer; desktop viewport still shows 4 sim panes

**Checkpoint**: US1 fully functional — sim 4-pane comparison works end-to-end with per-pane status

---

## Phase 4: User Story 2 — Model selection per pane with auto-discovery (Priority: P1)

**Goal**: Each pane's provider+model is picked from live-fetched catalogs (Cerebras, OpenRouter) with search, caching, manual fallback, and comparable-model suggestions

**Independent Test**: With stubbed `fetch` catalog responses, picker lists models; with failing fetch, picker falls back to cache/manual entry

### Tests for User Story 2 ⚠️

- [ ] T019 [P] [US2] Unit test `src/llm/catalog.test.ts`: `loadCatalog` live fetch parses Cerebras `{data:[{id}]}` and OpenRouter `{data:[{id,name,context_length,pricing}]}` shapes; cache write/read; stale-flag on old `fetchedAt`; failure → cached or empty+manual fallback
- [ ] T020 [P] [US2] Unit test `src/arena/model-picker.test.ts`: query filtering, "suggested comparable" ranking heuristic (family/size match), manual-entry path

### Implementation for User Story 2

- [ ] T021 [US2] Implement `src/llm/catalog.ts` per `contracts/providers.md`: `loadCatalog(provider, apiKey, signal)` wraps `Provider.listModels` live fetch → `ModelCatalog` with `fetchedAt`/`source`; localStorage cache `models-catalog-<provider>`; OpenRouter `?q=` server-side search with ≥150 ms debounce (session-only query cache)
- [ ] T022 [US2] Implement `src/arena/model-picker.ts`: populates the `arena.html` dialog — provider tabs, searchable model list (client-side filter for Cerebras, server-side `?q=` for OpenRouter), stale-cache badge, manual id input, "suggested comparable" section ranking by family/context-length proximity
- [ ] T023 [US2] Extend the API-key dialog in `arena.html` to collect `cerebras-api-key` and `openrouter-api-key` (reuse `KEY_STORAGE` constants); missing keys disable only panes needing them
- [ ] T024 [US2] Wire picker selection → `pane.setModel(provider, model)`: rebuilds the pane's `TextSource`, regenerates continuation, updates header label and `PaneConfig` persistence
- [ ] T025 [US2] Implement comparability suggestions per research R4: match OpenRouter `author/slug` ids against the Cerebras model family/size; advisory ordering only, never enforced

**Checkpoint**: US2 independently testable — picker works against stubbed catalogs without US3/US4

---

## Phase 5: User Story 3 — Steering applied across panes (Priority: P2)

**Goal**: Shared steering bar edits `Steering` per pane; "all" broadcasts to every pane, focused mode hits one; each pane regenerates from its own caret

**Independent Test**: In sim mode, apply a control in "all" mode → all panes regenerate; focus one pane → only it regenerates

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Unit test `src/arena/steering-bar.test.ts`: bar edits produce correct `Steering` shape; target resolution ("all" vs focused slot) fans out to the right panes
- [ ] T027 [P] [US3] E2E test in `e2e/arena.test.mjs`: steer-all regenerates every pane's text; focused-pane steering leaves siblings' text unchanged

### Implementation for User Story 3

- [ ] T028 [US3] Implement `src/arena/steering-bar.ts` per `contracts/pane.md`: key-phrase input + dimension control editors producing `Steering { leads, controls }`; target toggle "all panes" / "focused pane" (click pane to focus, visible focus ring)
- [ ] T029 [US3] Wire `Pane.steer(steering)`: set pane steering state; call `stream.regenerate(caretWords, "steering changed", steering)` only when the pane has generated text past the steering point (mirror flagship `invalidateFuture`/`regenerateFuture` semantics)
- [ ] T030 [US3] Ensure steering edits never block generation: bar state is local until applied; apply is a synchronous fan-out that calls `Pane.steer` for each target without awaiting each pane's async regeneration promise; in-flight generations abort via existing `createTextStream` semantics

**Checkpoint**: US3 works — same steering drives all panes together or one pane independently

---

## Phase 6: User Story 4 — Pane lifecycle management (Priority: P3)

**Goal**: Add/remove/reconfigure panes up to 4 without restarting siblings; layout persists across reloads

**Independent Test**: Add a third pane mid-stream, swap a model, remove a pane; siblings uninterrupted; fifth add rejected

### Tests for User Story 4 ⚠️

- [ ] T031 [P] [US4] Unit test `src/arena/pane-grid.test.ts`: slot assignment, cap rejection at `min(4, viewport capacity)` (stub `matchMedia`/viewport to cover capacity-1 geometry), config persistence round-trip (`arena-panes` localStorage)
- [ ] T032 [P] [US4] E2E test in `e2e/arena.test.mjs`: add pane mid-run, remove pane, reload restores pane count/providers

### Implementation for User Story 4

- [ ] T033 [US4] Implement add-pane flow in `src/arena/main.ts` + `pane-grid.ts`: "add pane" opens picker, creates `PaneConfig`+`Pane` in the next free slot, joins the shared opening; disable with message at the effective cap (up to 4 where panes fit readably, 1 where they don't — FR-015, edge case)
- [ ] T034 [US4] Implement remove-pane: per-pane close control calls `pane.destroy()` (aborts in-flight, removes listeners/DOM), frees the slot, persists config
- [ ] T035 [US4] Persist and restore `PaneConfig[]` (`arena-panes` key): on load, recreate panes in slot order with stored provider/model, clamped to current viewport capacity; invalid entries fall back to sim defaults

**Checkpoint**: All four stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, verification, and gate compliance

- [ ] T036 [P] Update `README.md` with the arena/comparison page: what it shows, how to enter Cerebras + OpenRouter keys, sim mode
- [ ] T037 [P] Add `CHANGELOG.md` entry under `Unreleased` describing parallel model comparison
- [ ] T038 Verify `docs/adr/NNNN-openrouter-provider.md` (T003) covers endpoint allowlist + CSP implications; confirm `connect-src` includes both provider origins in any CSP meta
- [ ] T039 Run `npm run format`, then `npm run check` (format:check, speckit hardening, typecheck, unit, e2e, build, bundle secret scan); fix all failures
- [ ] T040 Walk `quickstart.md` scenarios 1–6 manually in sim mode and record results; verify live Cerebras vs OpenRouter path if keys are available

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately
- **Phase 2 (Foundational)**: depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: depends on Phase 2 — first independently testable increment (MVP with sim providers)
- **Phase 4 (US2)**: depends on Phase 2; integrates with US1's `pane.setModel` but independently testable via stubbed catalogs
- **Phase 5 (US3)**: depends on US1's `Pane.steer`/caret plumbing (Phase 3)
- **Phase 6 (US4)**: depends on US1 + US2 (`pane-grid` + picker + `setModel`)
- **Phase 7 (Polish)**: after all desired stories

### User Story Dependencies

- **US1 (P1)**: after Foundational — no story deps
- **US2 (P1)**: after Foundational; plugs into US1 via `setModel` — can be developed against US1's pane contract
- **US3 (P2)**: after US1 (needs pane steering surface)
- **US4 (P3)**: after US1 + US2 (needs pane creation and model picker)

### Parallel Opportunities

- T002, T005, T007, T008 all touch different files — parallel after their prerequisites
- Within US1: T012/T013 tests parallel; T014 must precede T016
- Within US2: T019/T020 tests parallel; T021 precedes T022
- US2's catalog/picker work (T021–T023) can proceed in parallel with US3 once US1 lands

### Parallel Example: User Story 1

```bash
# Tests together:
Task: "Unit test src/arena/pane.test.ts isolation"
Task: "E2E test e2e/arena.test.mjs 4-pane sim grid"

# Then implementation:
Task: "src/arena/pane.ts" → "src/arena/pane-grid.ts" → "src/arena/main.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2 → provider plumbing ready
2. Phase 3 → sim-mode 4-pane comparison works end-to-end
3. **STOP and VALIDATE**: quickstart scenario 1 passes — this is the demo-able MVP

### Incremental Delivery

1. MVP: US1 (sim panes side by side)
2. Add US2 → live Cerebras vs OpenRouter comparison (the feature's headline)
3. Add US3 → steer-all / focused steering
4. Add US4 → lifecycle management
5. Polish: docs + `npm run check` green

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- All `src/text/` flagship modules are reused read-only; changes to `live-completion.ts` are limited to exporting the request builders (T009)
- Live-source unit tests MUST stub `fetch` — hermetic, no real keys/network (constitution VI)
- `arena.html` follows the same styling system as `index.html` (CSS variables, mono, high contrast)
