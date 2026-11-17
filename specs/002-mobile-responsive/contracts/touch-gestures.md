# Contracts: Mobile Responsive UX

## Touch gesture contract

Authoritative mapping. "Same end state as desktop" is the acceptance bar
(spec US2). Pointer-type policy is per-event; display policy is per-media-
query. Desktop (mouse/pen/keyboard) behavior MUST be byte-identical.

| #   | Desktop gesture                                                                          | Touch gesture                                                                                                                                                                                                                       | FR             |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| G1  | Drag `#pointer` knob horizontally/vertically to scrub                                    | Identical drag on the knob; effective hit area ≥24×24 px                                                                                                                                                                            | FR-005, FR-006 |
| G2  | Double-click knob → expand attention / collapse all                                      | Tap **⏎** in `#touch-controls` (also fires where `dblclick` reaches the page)                                                                                                                                                       | FR-007, FR-012 |
| G3  | Double-click + 400 ms still-hold on knob → spawn future knob, then drag to fan/tune/drop | **Single press-and-hold (~400 ms still)** on knob → spawn; fan/tune/drop drag unchanged                                                                                                                                             | FR-008         |
| G4  | Press in ahead-of-caret zone + drag → pull text toward pointer (rate 3–40 w/s)           | Press in ahead zone shows `#zone-cue`; drag engages same pull for non-vertical pans (pure vertical pans scroll natively)                                                                                                            | FR-009, FR-015 |
| G5  | ⌥-drag across text → attention box on release                                            | Native text selection inside `#text` → tap **⊞** in `#touch-controls` (enabled iff the selection is non-empty and covers whole words) → same `addBox` path                                                                          | FR-010         |
| G6  | Double-click attention box or future knob → delete                                       | **Press-and-hold (~500 ms still)** on the element → delete. dblclick retention differs: attention boxes ignore the synthesized touch dblclick (still-press only); future knobs keep `dblclick`, so a touch double-tap still deletes | FR-011         |
| G7  | Arrow keys nudge caret ±1 word; Enter toggles attention                                  | **◀ / ▶** nudge buttons and **⏎** button in `#touch-controls` call the same handlers as `keyboard.ts`                                                                                                                               | FR-012         |
| G8  | Hover: knob wake brackets, HUD readouts, `abbr[title]` tooltips, tether/vector           | Touch press shows zone cue; tap on `.future` pins its HUD; tap on box reports keyword via status line; tray hints move into legend/`aria-label`s                                                                                    | FR-013         |
| G9  | — (no desktop equivalent)                                                                | Native callout/context menu suppressed on `.knob`, `.future`, `#tray`, dialogs; text selection preserved on `#text`                                                                                                                 | FR-014         |
| G10 | Mouse wheel / scrollbar / trackpad scroll                                                | Touch scroll works everywhere `touch-action` permits (`pan-y pinch-zoom` on `#text` and on the steering target while a pull is claimed, `none` on gesture chrome); pinch-zoom allowed everywhere, including mid-pull                | FR-015         |
| G11 | —                                                                                        | Rotation/resize/browser-chrome changes reflow text and re-anchor caret, boxes, knobs; reading position preserved                                                                                                                    | FR-016         |

## DOM contract — additions

```html
<!-- fixed cluster above the tray; shown only under (pointer: coarse) via CSS -->
<div id="touch-controls" role="group" aria-label="touch controls">
  <button type="button" data-nudge="-1" aria-label="nudge back one word">‹</button>
  <button type="button" data-nudge="1" aria-label="nudge forward one word">›</button>
  <button type="button" data-expand aria-label="expand or collapse attention">⇅</button>
  <button type="button" id="touch-box" aria-label="turn the text selection into an attention box" disabled>⊞</button>
</div>
```

- All four are real `<button>`s ≥24×24 px effective target under
  `(pointer: coarse)`; visibility is gated by `@media (pointer: coarse)`
  in `index.html` (`display: none` → `flex`), not a `hidden` attribute.
- `#touch-box` `disabled` state tracks `getSelection()` non-empty on
  `selectionchange`; it enables only when the selection is inside `#text`
  and covers at least one whole word. Enabling runs the existing box-creation
  path with the Alt requirement bypassed **only** for this explicit commit.
- No new `id`s collide with existing ones; `#touch-controls` is
  `aria-label`led group (`role="group"` or `<fieldset>`-like semantics per
  existing style — match tray conventions).

## CSS contract

- `index.html` `<head>` gains
  `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  same tag added to all `extra/*.html`.
- `@media (max-width: 44rem)`: `--margin: 0ch; --rail-width: 0px;`,
  `#rail { display: none }`, tray wrap/condense, legend single-column,
  `#hint` unwrap.
- `@media (pointer: coarse)`: hit-area expansion (≥24 px effective) on
  `.knob`, `.future`, tray buttons, dialog buttons; `#touch-controls`
  visible.
- `#text { touch-action: pan-y pinch-zoom }`; `.knob`, `.future`, `#tray`,
  `#touch-controls`, `#box-action` keep `touch-action: none`;
  `-webkit-touch-callout: none` + `contextmenu` prevention (touch/pen
  pointers only) on gesture elements only — presses that start on an
  attention box claim `touch-action: none` on `#text` for that gesture so
  vertical box drags move the box instead of scrolling.
- All new visual rules use existing custom properties; no new fonts,
  colors, or dependencies.

## Test contract

- `npm test` (unit): new `*.test.ts` for pure helpers — breakpoint/media
  decision logic if extracted to TS, touch hold-policy selection, tray
  condensation rules if JS-side.
- `npm run test:e2e`: new `e2e/mobile.test.mjs` with
  `{ viewport: {width:390,height:844}, hasTouch: true, isMobile: true }`
  covering G1–G8 minimum: scrub, expand, spawn+drop, steering-pull,
  select→box, delete, resize/rotation reflow, desktop-context regression
  already covered by existing suite (must stay green — SC-005).
- Manual check before merge (constitution VI): look/feel/motion/sound on a
  real or emulated touch device; PR states what was checked.
