# UI Contract: Mobile Responsive UX

Phase 1 output, synced to the implementation (Phase 8). Behavioral contract
between modules — no external API.

## Module seams

### `src/text/breakpoints.ts` (pure, unit-tested)

```ts
isCoarsePointer(): boolean   // matchMedia("(pointer: coarse)").matches
isNarrowLayout(): boolean    // matchMedia("(max-width: 44rem)").matches
```

- Display policy only: CSS-facing decisions (hit areas, control visibility,
  legend rows). Input decisions are made per event from `pointerType`, never
  from these helpers.

### `src/text/touch.ts`

```ts
onTouchTap(element, onTap: (point: Point, tap: { at: number }) => void): void
trackTouchPress(element): void
guardTouchHold(element): void
TAP_MS = 400   // a touch press counts as a tap under this long
TAP_PX = 12    // ... and this still
```

- `onTouchTap` calls `onTap` for a quick, still `pointerType === "touch"`
  press; `tap.at` is the press's start timestamp so callers can pair taps.
  Drags, long presses, other pointer types, and releases during
  `data-dragging` never tap.
- `trackTouchPress` marks `data-pressed` while a touch press is down.
- `guardTouchHold` prevents the native context menu/callout on touch and pen
  presses — except presses inside `input, textarea, [contenteditable], a,
button, summary` descendants and on non-touch/pen pointers, so links,
  fields, and desktop right-click keep their menus.

### `src/text/touch-controls.ts`

```ts
createTouchControls({
  nudge: (delta: number) => number,   // moves the caret, returns words moved
  tick?: (direction, count, speed, x) => void,
  toggleAttention: () => void,        // same as Enter / knob double-click
  commitBox: () => void,              // selection → attention box, no modifier
  canCommitBox: () => boolean,        // drives the ⊞ button's disabled state
}): { destroy(): void }
```

- Wires the `#touch-controls` cluster in `index.html`; visibility is CSS-gated
  by `@media (pointer: coarse)`. ◀/▶ fire one nudge on `pointerdown` and
  repeat while held (vertical drag sets speed, `--fill` sweeps like the knob
  hold); ⏎ toggles attention; ⊞ commits the current selection.
- `canCommitBox` is true iff the selection is non-empty, inside `#text`, and
  covers at least one whole word (`attention-knobs.ts` `selectionSpan`).

### `src/text/hold.ts`

```ts
onPressAndHold(element, ms, onHold, {
  onSweep?, onSweepEnd?,
  secondPressWithin?: number | false | ((event: PointerEvent) => number | false | undefined),
  stillPx?: number,
  sweepRegion?: (press: PointerEvent) => ((point: Point) => boolean) | undefined,
}): void
holdWindow(pointerType, doublePressMs): number | undefined
touchHoldOnly(event: PointerEvent): number | false | undefined
```

- `secondPressWithin` as a function decides per press: `undefined` arms a
  hold, `false` never does, a number is the double-press window.
- `holdWindow` returns `undefined` for touch (single still press holds) and
  the window for mouse/pen; `touchHoldOnly` is the inverse gate (touch only).
- Stillness defaults to 4 px, 8 px for `pointerType === "touch"`. Without a
  `sweepRegion` the sweep area is the element's circle, padded by 12 px for
  touch to match the coarse-pointer `::after` hit-area expansion.

## Modified module seams

### `src/text/pointer.ts`

- Touch presses in the `"ahead"` zone engage the same `pull()` steering as
  mouse/pen; the custom cursor overlay and hover marks stay mouse/pen-only.
- Steering state is scoped to the active `pointerId`: other fingers'
  `pointerup`/`pointercancel`/`lostpointercapture` are ignored, pressed
  pointers are tracked in a set, and only the steering finger's moves feed
  `aim`.
- During a touch steer the target's inline `touch-action` becomes
  `pan-y pinch-zoom` (vertical pans scroll, pinch-zoom survives) and is
  restored on release.
- `#steer-readout` shows the pull rate (`+N words · M w/s` or "behind the
  knob") while a finger steers.

### `src/text/zone-cue.ts`

- The cue shows while the pointer is in the ahead zone — including touch
  `pointerdown` — and hides on release; the hide is scoped to the pointer
  that last moved the cue.

### `src/text/attention-knobs.ts`

- `dblclick` delete ignores presses whose `pointerType` was touch; touch
  deletes via a ~500 ms still press armed only when the press starts on a
  box (`boxAt` gate), sweeping `#text`'s `data-holding`/`--fill`.
- Box hit area: full line height tall; on coarse pointers at least 24 px wide
  and 24 px tall (`targetRectsOf`), shared by `boxAt`, the hold `sweepRegion`,
  and the `claimBoxTouch` gesture claim.
- `commitSelection()` exposes the ⊞ path: `addBox` with the `altKey` /
  `selectWithAlt` requirement bypassed; `canCommitSelection()` reports whether
  a committable selection exists.
- `onTouchTap` on a box reports its keyword via `onBoxTap` (status line).
- `#box-action` floating button appears on touch selections inside `#text`.

### `src/text/future-knobs.ts`

- Delete keeps `dblclick` (fires for mouse/pen and synthesized touch
  double-tap) and gains a ~500 ms still-press hold (`touchHoldOnly`) with the
  sweep on the knob itself.
- `onTouchTap` pins the HUD readout (`hudPinned`) until the next tap or drag.
- Pinned/parked knobs clamp inside the viewport via `placeInRightMargin`.

### `src/text/main.ts` (composition only)

- Wires `createTouchControls`, `onTouchTap` expand/collapse pairing (two taps
  within ~300 ms cancel so a double tap is harmless), the knob's
  `onPressAndHold` spawn (`holdWindow` per pointer type), `createPointer`
  with `steerReadout`, `createZoneCue`, and `guardTouchHold` on gesture
  chrome.

## CSS contract (`index.html`)

- `<meta name="viewport" content="width=device-width, initial-scale=1,
viewport-fit=cover">`; same tag on all `extra/*.html`.
- `@media (max-width: 44rem)`: `--margin: 0ch; --rail-width: 0px`,
  `#rail { display: none }`, `--tray-height: 44px`, tray wrap/condense,
  legend single-column, `#hint` unwrap.
- `@media (pointer: coarse)`: `--knob: 20px; --knob-future: 16px;
--tray-height: 40px`, `#pointer::after { inset: -10px }` and
  `.future::after { inset: -13px }` (~40px effective targets),
  `.touch-only` rows visible, `#touch-controls` visible, dialog/`#box-action`
  min-height 24px.
- `#text { touch-action: pan-y pinch-zoom }`; `.knob`, `.future`, `#tray`,
  `#touch-controls`, `#box-action` keep `touch-action: none`;
  `-webkit-touch-callout: none` on gesture chrome; `body { overflow-x: clip }`.
- `--tray-occupied` is the measured tray height (including the narrow-layout
  `env(safe-area-inset-bottom)` padding); `#touch-controls`, `#steer-readout`,
  `#zone-cue`, and `body` padding all derive from it — no element adds the
  inset a second time.
- `prefers-reduced-motion` disables transitions/animations including
  `::highlight(pin-flash)`.
