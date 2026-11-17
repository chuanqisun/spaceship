# UI Contract: Mobile Responsive UX

Phase 1 output. Behavioral contract between modules — no external API.

## Module seams (new)

### `src/text/breakpoints.ts` (pure, unit-tested)

```ts
export type PointerKind = "mouse" | "pen" | "touch";

isCoarsePointer(): boolean            // matchMedia("(pointer: coarse)").matches
isNarrowLayout(): boolean             // matchMedia("(max-width: 44rem)").matches
trackModality(root?: HTMLElement): { hasTouch(): boolean; lastPointer(): PointerKind }
```

- `trackModality` listens for `pointerdown`/`pointermove` (capture) and records
  the last `pointerType`; `hasTouch` latches true once a touch pointer is seen.
  Used to decide JS-side affordances; CSS media queries handle pure styling.

### `src/text/touch.ts`

```ts
createTouchRouting({
  knob: HTMLElement,
  onTapKnob: () => void,          // expand/collapse (tap path)
  onLongPressKnob: () => void,    // spawn future knob (single-press hold)
  onDeleteAt: (point: Point) => void,   // tap on box/future knob
  onSelectionBox: () => void,     // floating "box" action tapped
  isEditing: () => boolean,
}): { destroy(): void }
```

- Activates only when the event's `pointerType === "touch"`; mouse/pen events
  pass through untouched so desktop behavior is unchanged.
- Tap = pointerdown/up within movement threshold and < ~300 ms; routes to
  `onTapKnob`/`onDeleteAt` instead of `dblclick`.
- Long-press = single press held ~500 ms still (reuses `hold.ts` sweep with
  `secondPressWithin` disabled for touch); `contextmenu` prevented in capture
  phase on claimed elements.
- Suppresses iOS callout on `.knob`/`.future` via CSS (`-webkit-touch-callout`),
  not JS.

### `src/text/touch-controls.ts`

```ts
createTouchControls({
  onNudge: (delta: number) => void,   // same as keyboard nudge
  onExpand: () => void,               // same as Enter/dblclick
  isEditing: () => boolean,
}): { element: HTMLElement; destroy(): void }
```

- Renders a small cluster of `<button>`s (‹ › for nudge, expand/collapse)
  visible only under `(pointer: coarse)`; hidden on devices with a fine pointer.
  Positioned to not overlap the knob or tray (e.g. fixed above tray, right
  side, or beside the column).

### Floating "box" action (in `attention-knobs.ts`)

```ts
// extension of existing createAttentionKnobs options/returns
onSelectionAction?: () => void   // invoked by floating button; performs
                                 // word-range→addBox using current selection
```

- On `selectionchange`/`pointerup`, if `getSelection()` is non-collapsed and the
  last input was touch, position a small `<button>` ("box") at the selection
  rect; tapping it calls the existing snap-to-words + `addBox` path with the
  `altKey`/`selectWithAlt` gate bypassed. Hidden on `selectionchange` to
  collapsed or on scroll/resize.

## Modified module seams

### `src/text/hold.ts`

- `onPressAndHold` gains an option to skip the second-press gate for touch:
  `requireSecondPress?: boolean` (default true) or the caller passes a
  predicate. `main.ts` wires `requireSecondPress: pointerType !== "touch"`.
- Exports the timing constants needed by `touch.ts` if the tap/hold logic is
  shared rather than duplicated.

### `src/text/pointer.ts`

- Remove the `pointerType === "touch"` early-returns for the **steering zone
  only**; the custom cursor overlay and hover marks remain mouse/pen-only.
- Touch press in `"ahead"` zone engages `isSteering` with the same `pull()`
  loop; a touch-visible affordance (zone cue, R8/research R4) indicates the
  zone on `pointerdown`, not hover.
- Axis-lock arbitration: if the first ~8 px of a touch drag in a scrollable
  region is dominantly vertical, release steering and let scroll win.

### `src/text/zone-cue.ts`

- Show the boundary cue for touch `pointerdown`/`pointermove` in the ahead
  zone (currently returns early for touch at line ~19).

### `src/text/attention-knobs.ts`

- `dblclick` delete gains a touch tap path (via `touch.ts` `onDeleteAt` or an
  internal tap detector); `mousedown` preventDefault stays mouse-only.
- Selection→box: `boxSelection` accepts an explicit `via: "modifier" | "action"`
  so the floating button path bypasses `altKey`.

### `src/text/future-knobs.ts`

- `onDoubleClick` delete gains the same touch tap path.
- Fan spawn position/labels clamp inside the viewport on narrow layouts;
  parked/pinned label `maxWidth` floor raised or labels repositioned below the
  knob when the gutter is ~0 (margin-pins.ts `room` calc).
- `axisFor` (fan-axis.ts) already fits the viewport; verify at 390 px and
  tighten `MARGIN_X_PX` if the fan still overflows.

### `src/text/main.ts` (composition only)

- Instantiate `createTouchRouting`, `createTouchControls`, wire
  `onPressAndHold`'s touch option, pass selection-action callback into
  `createAttentionKnobs`, keep all existing wiring for mouse/pen.

## CSS contract (`index.html`)

- `@media (max-width: 44rem)`: `--margin: 0ch; --rail-width: 0px` collapse
  (keep knob parking working — pins move to a clamped position, not offscreen),
  `#rail { display: none }`, `#tray` compaction (smaller fields or
  `overflow-x: auto; scrollbar-width: none`), `#text` width clamp floor
  relaxed (`30ch` may exceed 320 px — verify; allow smaller floor like `24ch`
  under the breakpoint if needed).
- `@media (pointer: coarse)`: `.knob`/`.future` pseudo-element hit expansion
  to ≥44 px; `#touch-controls` visible; `#hint` copy may differ (JS-side).
- `#text { touch-action: pan-y }` (was `none`); `.knob`, `.future`,
  steering-claimed regions `touch-action: none`; `-webkit-touch-callout: none`
  on `.knob`/`.future`; `body { overflow-x: clip }`.
- Tray: `min-height`/`padding` bump under `(pointer: coarse)` for ~24 px
  targets; keep `--tray-height` row height but expand hit area via padding.
