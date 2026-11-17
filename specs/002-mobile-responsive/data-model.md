# Data Model: Mobile Responsive UX

Phase 1 output. This feature is primarily CSS/DOM/gesture-policy work; the
persistent data model is unchanged. The entities below are the new runtime
concepts the implementation must represent.

## ViewportContext

Decides which layout density and control set is active.

| Field          | Source                                                                                | Values                                                                                               |
| -------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `narrow`       | `matchMedia("(max-width: 44rem)")` (CSS-side; JS reads via `matchMedia` where needed) | boolean — collapses `--margin`/`--rail-width`, hides `#rail`, condenses tray, single-column legend   |
| `coarse`       | `matchMedia("(pointer: coarse)")`                                                     | boolean — shows `#touch-controls`, enlarges hit areas, swaps hint/legend copy                        |
| `touchPointer` | per-event `event.pointerType === "touch"`                                             | per-gesture — selects touch gesture policy (single long-press spawn, touch delete, steering enabled) |

Rules:

- `narrow` and `coarse` are independent: a narrow desktop window gets the
  compact layout but NOT the touch controls; a tablet in desktop mode gets
  coarse controls at wide width. Never conflate them.
- All three must degrade gracefully: no matchMedia support → desktop path.

## TouchGestureMapping

The contract between desktop gestures and touch equivalents (authoritative
table in `contracts/touch-gestures.md`). Implementation-relevant fields:

| Desktop gesture              | Touch equivalent                                             | Mechanism                                              |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| knob drag scrub              | same                                                         | `makeDraggable` (unchanged)                            |
| dblclick expand/collapse     | on-screen ⏎ button (+ dblclick where fired)                  | `touch-controls.ts` → `toggleAttention`                |
| dblclick+hold spawn          | single long-press on knob                                    | `onPressAndHold` touch policy (no `secondPressWithin`) |
| press-pull steering          | drag in ahead zone (non-vertical pans; vertical pans scroll) | `pointer.ts` steering branch enabled for touch         |
| ⌥-select → box               | native select → ⊞ commit button                              | `attention-knobs.ts` commit path                       |
| dblclick delete (box/future) | long-press on element                                        | `onPressAndHold` touch policy → delete                 |
| arrow keys / Enter           | ◀ ▶ ⏎ buttons                                                | `touch-controls.ts` → `keyboard.ts` actions            |
| hover readouts               | zone cue on press; tap pins HUD; tap box → status line       | `zone-cue.ts`, `future-knobs.ts`, `attention-knobs.ts` |

## TouchAffordanceLayer

Transient/per-press visual feedback replacing hover for touch users:

- `#zone-cue` — shown on touch `pointerdown` in the ahead zone (guard at
  `zone-cue.ts:19` removed for press events).
- Press state on `.knob`/`.future`/boxes — `data-pressed` or existing
  `--near`/wake styling reused; no new persistent chrome.
- `#touch-controls` — persistent cluster, `hidden` unless `coarse`;
  contains nudge −/+, expand/collapse, box-commit (disabled unless a
  non-empty selection exists).
- Future-knob HUD pinning on tap — `isHovered`-equivalent persistent state
  for `pointerType === "touch"` taps without drag.

## Layout entities (CSS-driven, JS-guarded)

- `#text` width: `clamp(30ch, 100% - 2*(--margin + --rail-width), 64ch)`;
  under `max-width: 44rem`, `--margin: 0ch`, `--rail-width: 0px`.
- `#rail`: `display:none` under the same query; `refreshRail` translate
  clamped to viewport regardless.
- `placeInRightMargin` narrow path: when `room <= 0`, pins stack in a compact
  column clamped to `clientWidth` (no off-screen placement).
- `#tray`: wraps to ≤2 lines under the query; `--tray-height` grows; body
  padding derives from the var (already does).
- `#hint`: `white-space` normal under the query; JS position clamped to
  viewport.

## SessionReanchor invariants (unchanged, verified by e2e)

- `caretWords` (count) → `caretAfterWords` → `pointAt` re-derives x/y on any
  width — rotation/resize safe.
- `BoxState {keyword, before, after}` matches by word text — width-agnostic.
- `FutureState {dimension, position, strength}` normalized 0–1 → fan-axis +
  `placeInGutter` place within _current_ viewport — narrow-safe once R2's
  clamp lands.
- Pinned knobs are session-transient (not persisted) — re-place on load.
