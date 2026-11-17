# Research: Mobile Responsive UX

Phase 0 output for `002-mobile-responsive`. Sources: codebase survey of
`index.html`, `src/text/*`, `scripts/capture/*`, `e2e/*` (see plan Summary).

## R1 — Viewport & breakpoint mechanism

**Decision**: Add
`<meta name="viewport" content="width=device-width, initial-scale=1">` to
`index.html` and every `extra/*.html` (only `illustrations.html` has one
today). Pinch-zoom stays enabled per spec assumption; FR-016 is satisfied by
the existing `resize` → `moveTo(pointAt(caret, metricsOf()))` path
(`main.ts:226`) and `viewport-follow.ts` resize handling — both already
re-derive layout from live rects.

**Rationale**: The only missing primitive is the meta tag; all geometry is
already measured per-frame, so rotation/resize reflow works once the page
renders at device width.

**Alternatives considered**: JS-driven breakpoint class on `<html>` —
rejected; a CSS custom-property override under a width media query achieves
the same with zero JS and keeps `prefers-*`/width concerns in CSS.

## R2 — Narrow-viewport layout (FR-002..004)

**Decision**: Collapse the gutter reservation with a width media query:

```css
@media (max-width: 44rem) {
  /* ~704px: below this the 24ch+144px gutters
                                can never fit alongside a readable column */
  :root {
    --margin: 0ch;
    --rail-width: 0px;
  }
}
```

`#text`'s existing `clamp(30ch, 100% - 2*(margin+rail), 64ch)` then resolves
to a width that fits 320px. Additionally:

- `#rail` (144px ruler, `aria-hidden`): `display: none` under the same
  query, AND clamp `refreshRail`'s translate in `main.ts` so a hidden/zero
  rail never computes a negative off-screen position (defensive; also covers
  intermediate widths).
- `#links` SVG stays `overflow: visible` but all children are positioned
  inside the column or the (now zero) gutter; `placeInRightMargin`
  (`margin-pins.ts`) gets a narrow path: when `room <= 0`, stack pins in a
  compact column immediately right of the text column (or inline below it),
  clamped to `clientWidth`.
- `#tray`: switch from fixed `nowrap` single row to wrapping/condensing under
  the query — hide `abbr` glyph prefixes and unit suffixes, allow the status
  zones to wrap to two lines, and raise `--tray-height` accordingly (body
  padding-bottom already derives from the var).
- Dialogs: already `min(Nch, 100% - 2*padding)`; legend `<dl>` grid gets a
  single-column fallback under the query.
- `#hint`: drop `white-space: nowrap` under the query and clamp its
  positioning in `onboarding.ts` to the viewport.

**Rationale**: one breakpoint, CSS-first, no layout thrash; JS only needs
guards where it computes absolute positions (`refreshRail`,
`placeInRightMargin`, `#hint`).

**Alternatives considered**: container queries — rejected, support is fine
but the page is the viewport; JS resize classes — rejected per R1.

## R3 — Touch target size (FR-005, SC-003)

**Decision**: Under `@media (pointer: coarse)`, enlarge effective hit areas
without changing desktop visuals:

- `.knob`/`#pointer` (14px) and `.future` (12px): keep visual size; add an
  invisible hit expansion via `padding` on a `::before`/`::after` or
  `min-width/min-height: 24px` with negative-margin compensation — verify in
  implementation which keeps the SVG/circle visuals pixel-identical.
- Tray buttons and dialog buttons: `padding` bump to ≥24px effective under
  `(pointer: coarse)` only.

**Rationale**: SC-003 is about _effective_ hit area; visual design is
constitution-protected, so expansion must be non-visual.

## R4 — Gesture mapping (FR-006..013) — the core decision

All gestures already run on Pointer Events; `makeDraggable` and
`onPressAndHold` are pointer-type-agnostic. The gaps are policy gates, not
machinery:

| Desktop gesture                               | Today on touch                                           | Touch mapping                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag main knob (scrub)                        | works (`makeDraggable`)                                  | unchanged + R3 hit area (FR-006)                                                                                                                                                                                |
| Double-click knob → expand/collapse           | unreliable `dblclick`                                    | **on-screen expand/collapse button** in the touch control cluster (FR-007, FR-012); `dblclick` still fires where the browser supports it                                                                        |
| Double-click+hold knob → spawn future knob    | works but painful (2 taps ≤400ms/8px + 400ms still-hold) | **single long-press** on the knob for `pointerType === "touch"` — `onPressAndHold` gains a per-pointer-type policy so touch skips `secondPressWithin` (FR-008)                                                  |
| Fan/tune/drop after spawn                     | works (drag-based)                                       | unchanged; HUD already shows while dragging (FR-013 partial)                                                                                                                                                    |
| Press-pull steering (ahead zone)              | **disabled** (`pointer.ts:112`)                          | enable for touch: remove the touch early-return for the steering branch only; keep `use(false)` so no custom cursor renders (FR-009)                                                                            |
| ⌥-drag selection → attention box              | impossible (no modifier)                                 | **select text natively, then tap an on-screen "box" commit control** (or a floating chip) that runs the existing `boxSelection`/`addBox` path (FR-010)                                                          |
| Double-click box/knob → delete                | unreliable                                               | **long-press (touch-only, ~500ms, via `onPressAndHold`) on a `.future` knob or attention box deletes it**; double-tap path retained where `dblclick` fires (FR-011)                                             |
| Arrow keys / Enter                            | no keyboard                                              | **on-screen cluster**: ◀ ▶ nudge, ⏎ expand/collapse — rendered only under `(pointer: coarse)` (FR-012)                                                                                                          |
| Hover readouts (HUD, `abbr[title]`, zone cue) | absent                                                   | zone cue shows on touch press in ahead zone (remove `zone-cue.ts:19` touch guard, trigger on `pointerdown`); tapping a future knob pins its HUD; tapping a box surfaces its keyword in the status line (FR-013) |

**Touch detection**: per-event `event.pointerType === "touch"` for gesture
policy (hybrid devices keep mouse/pen paths intact — FR-017), plus
`matchMedia("(pointer: coarse)")` for _display_ decisions (show/hide the
on-screen control cluster, legend copy). Both already have precedent in the
codebase (`pointer.ts` uses pointerType; `onboarding.ts` uses matchMedia).

**On-screen controls**: new `touch-controls.ts` module — a small cluster of
`<button>`s (nudge −/+, expand/collapse, box-selection commit) appended to
`#tray` or floating above it, `hidden` unless `(pointer: coarse)` matches.
Buttons call the same functions `keyboard.ts`/`attention-knobs.ts` already
own — no duplicated logic.

**Alternatives considered**: gesture-only everything (long-press menus) —
rejected; spec FR-012/SC-002 explicitly want on-screen controls, and hidden
gestures fail discoverability. Custom tap-count state machines — rejected;
the browser's `dblclick` plus explicit hold/delete covers it with less code.

## R5 — `touch-action` arbitration vs scrolling (FR-014, FR-015)

**Decision**: `#text { touch-action: pan-y }` (was `none`). Rationale:
`pan-y` still lets horizontal/diagonal drags reach the app as pointer events
(only pure vertical pans become native scroll), which preserves:

- page scrolling over the text column (the largest dead zone today),
- pinch-zoom (`pan-y` doesn't block `pinch-zoom`; default `touch-action`
  includes it — verify `manipulation` vs `pan-y pinch-zoom` in implementation;
  choose the most permissive that keeps steering usable),
- steering-pull on touch for any non-vertical drag; the zone cue advertises
  the zone on press. Pure-vertical drags in the ahead zone scroll instead of
  steering — acceptable trade-off, documented in the legend ("drag sideways
  to pull" phrasing TBD in implementation; the pull rate is magnitude-based,
  not direction-locked, so diagonal drags steer fine).

`.knob`, `.future`, `#tray`, dialogs keep `touch-action: none` (they own
their gestures). `#links`/`#cursor`/`#future-hud` are `pointer-events: none`
already.

`contextmenu`: `preventDefault` on `.knob`, `.future`, `#tray`, dialogs
(touch long-press callout suppression); on `#text` leave the context menu
alone so text selection/copy keeps working — box creation _depends_ on
native selection. `-webkit-touch-callout: none` on gesture elements only.
`selectstart` stays untouched.

**Alternatives considered**: keep `none` and add a scroll affordance —
rejected, FR-015 forbids dead zones. JS `touchmove` preventDefault —
rejected; Pointer Events + `touch-action` is the platform mechanism and
avoids scroll jank.

## R6 — Attention-box creation & delete on touch (FR-010, FR-011)

**Decision**: Reuse the existing selection pipeline. `boxSelection`
(`attention-knobs.ts:163`) currently requires `altKey`; refactor its gate to
accept an explicit "commit" trigger: the touch control cluster's "⊞ box"
button (enabled when `getSelection()` is non-empty) calls the same
`addBox`/selection-reading code with the modifier requirement bypassed for
coarse pointers. Desktop path (⌥-drag) unchanged.

Delete: `onPressAndHold` with a touch-only ~500ms policy on `.future`
elements (in `future-knobs.ts`) and on attention boxes (in
`attention-knobs.ts`) → `deleteBox`/existing delete. Long-press on the main
knob remains spawn (different element, no conflict). Double-tap retained.

## R7 — Session restore on narrow layouts (edge case)

**Decision**: No code change expected — verify only. Caret is a word count
re-anchored through `caretAfterWords`; boxes match by keyword text; future
knobs restore from normalized `position`/`strength` and re-place via
`placeInGutter`/fan axis, both of which become viewport-aware under R2.
Add an e2e assertion: save session at 1280px, reload at 390px, caret/boxes/
knobs present and on-screen.

## R8 — e2e touch infrastructure (FR-019, SC-006)

**Decision**: Extend `scripts/capture/hand.mjs` with a touch sibling —
`createTouchHand(page)` wrapping CDP `Input.dispatchTouchEvent`
(`touchStart`/`touchMove`/`touchEnd`, already proven in
`e2e/usability.test.mjs:236–289`) with the same eased-motion helper
`hand.mjs` uses for mouse. New `e2e/mobile.test.mjs` opens the sim with
`browser.newContext({ viewport: {width:390,height:844}, hasTouch: true,
isMobile: true })`, `context.route` off-origin blocking copied from
`ux.test.mjs`, and covers: scrub, expand/collapse, long-press fan-spawn +
drop, steering-pull, select→box, delete, rotation/resize reflow, and the
session-restore check from R7.

`appOf`/`measure`/`textPoint`/`knobCenter` in `scripts/capture/app.mjs` are
already layout-agnostic — reused as-is.

**Alternatives considered**: `page.touchscreen.tap` only — insufficient for
drags/holds; raw CDP in each test — rejected, the hand abstraction exists
for exactly this.

## R9 — Legend, onboarding, docs (FR-018, constitution VII)

**Decision**: Legend `<dl>` gains touch rows (or a touch column under
`(pointer: coarse)`); `onboarding.ts` hint text switches on
`matchMedia("(pointer: coarse)")`. `README.md`, `CHANGELOG.md` Unreleased,
`docs/user-guide.md` updated; one ADR
(`docs/adr/NNNN-touch-gesture-mapping.md`) records the R4/R5 decisions —
constitution VII requires an ADR for a new interaction paradigm.

## Resolved unknowns

All Technical Context fields are determined — no NEEDS CLARIFICATION remains.
