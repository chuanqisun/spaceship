# Contract: Arena Pane

## Creation

```ts
const pane = createPane(root: HTMLElement, config: PaneConfig, deps: PaneDeps): Pane
```

`root` is a `<section class="pane">` subtree authored in `arena.html` containing: header (provider/model label, status), text column, knob button, error slot. `PaneDeps` injects providers, catalog access, and the shared opening text — the pane never queries `document` globally.

## Capacity

- `pane-grid.ts` exposes the effective pane limit: `min(4, capacity(viewport))`, where capacity is 1 when `isCoarsePointer()` or `isNarrowLayout()` is true (`src/text/breakpoints.ts`), else 4.
- On capacity-1 viewports the grid renders a single pane (or a notice explaining comparison is unavailable on small screens); the "add pane" control and picker paths that would create a second pane are disabled with the same explanation.
- Restoring `arena-panes` config clamps to current capacity; excess entries are ignored (not deleted) so widening the viewport restores them.

## Pane API

```ts
type Pane = {
  readonly slot: number
  setModel(provider: Provider["id"], model: string): void // rebuilds TextSource, regenerates
  steer(steering: Steering): void // replaces pane Steering; regenerates if text exists past the caret
  regenerate(): void // re-run from current caret
  activity(): StreamActivity // for the shared status HUD
  destroy(): void // aborts in-flight, removes listeners
}
```

## Behaviour contract

- **Shared prefix**: all panes expand the same session opening via `expandToStoryStart`-equivalent logic fixed once per arena session; panes may diverge freely afterward.
- **Steering**: `steer()` replaces the pane's `Steering`. When the pane has generated text beyond the caret it calls `stream.regenerate(caretWords, "steering changed", steering)` — mirroring the flagship's regenerate-on-steering-change; otherwise it only updates state.
- **Isolation**: each pane owns its `AbortController` via its own `createTextStream`; `destroy()` or `setModel()` aborts only that pane.
- **Status**: pane header shows provider/model id, `isGenerating` indicator, `firstChunkMs`, and `wordsPerSecond` from `stream.activity()` — the fast-vs-standard comparison is the point (FR-011).
- **Failure**: provider errors surface in the pane's error slot; the pane keeps its last good text and remains steerable; siblings unaffected.
- **Sim mode**: `provider.id === "sim"` uses `simulatedSource`/`simulatedDimension`; no key required; deterministic enough for e2e assertions.

## Steering bar contract (`src/arena/steering-bar.ts`)

- Edits produce a `Steering` value and a `SteeringAction.target` (`"all"` or focused slot).
- "All" mode (default): every pane receives the same `steering` and regenerates — FR-009.
- Focused mode: click a pane to focus; bar edits hit only that pane — FR-008.
- The bar MUST NOT block generation: edits are local state until applied; applying is one synchronous fan-out.
