# 0005. Touch gesture mapping and touch-action arbitration

- Status: Accepted
- Date: 2026-11-17

## Context

Spec `002-mobile-responsive` gave every desktop gesture a touch path
(`contracts/touch-gestures.md`, mappings G1–G11). Two implementation questions
had real alternatives: how a single comfortable press replaces the desktop
double-press-and-hold, and how touch drags are arbitrated between the app's
gestures and the browser's native scroll/zoom/callout behaviors without
dead-zoning the page.

## Decision

- **Per-pointer-type hold policy in `onPressAndHold`.** The hold gate is a
  `secondPressWithin` option that may be a number, a per-event function, or
  `false` (never). `holdWindow` maps `pointerType === "touch"` to ungated — a
  single still ~500 ms press fires `onHold` — while mouse and pen keep the
  double-press window. `touchHoldOnly` is the inverse gate for touch-only
  holds (delete), where other pointers return `false`.
- **Gesture mapping.** Scrub is the same drag on an enlarged knob; tap on the
  knob expands/collapses attention; single long-press spawns a future knob and
  the fan/tune/drop drag is unchanged; press in the ahead zone shows the zone
  cue and drags steer; native text selection plus the ⊞ `#touch-controls`
  button (or the floating `box` action) commits an attention box with the Alt
  requirement bypassed only for that explicit commit; ~500 ms still press
  deletes attention boxes and future knobs (double-click/double-tap retained);
  `‹` `›` `⇅` `⊞` side buttons cover nudge, expand, and box-commit; tap on a
  `.future` pins its HUD readout and tap on a box reports its keyword in the
  status line.
- **`touch-action` arbitration.** `#text` gets `pan-y pinch-zoom` so vertical
  pans scroll and pinch-zoom stays native while horizontal and other drags
  reach the app; `.knob`, `.future`, `#tray`, `#touch-controls`, and
  `#box-action` keep `touch-action: none`. Dialogs deliberately keep the
  default so tall legend content can still scroll on a phone.
- **Steering press-pull for touch.** The ahead-zone press sets
  `touch-action: pan-y pinch-zoom` inline on the touched element (restored on
  `lostpointercapture`): vertical pans are claimed by the browser — which
  cancels the press — while every other drag steers, matching G4's
  "non-vertical pans pull, pure vertical pans scroll", and a pinch zooms
  natively even mid-pull.
- **Native-behavior suppression is scoped.** `-webkit-touch-callout: none` and
  a capture-phase `contextmenu` `preventDefault` apply only to gesture chrome
  (`.knob`, `.future`, `#tray`, dialogs, `#touch-controls`, `#box-action`);
  `#text` keeps selection, callout, and scrolling untouched.
- **Media-query split.** `(max-width: 44rem)` owns layout density;
  `(pointer: coarse)` owns touch controls, hit areas, and touch copy. They are
  never conflated — a narrow desktop window gets compact layout without touch
  controls.

## Consequences

- Desktop (mouse/pen/keyboard) paths are unchanged: the double-press gate,
  `⌥`-drag box commit, double-click delete, and custom cursor all behave as
  before, guarded by the desktop e2e suite (SC-005).
- A paused mid-drag hold over ~600 ms on a box or knob reads as a delete
  intent; the sweep fill on the element is the warning, same trade-off the
  desktop double-click makes.
- `#box-action` (floating, beside the selection) and `#touch-box` (persistent,
  disabled until a selection exists) both commit through the same
  `commitSelection` path; the former is contextual, the latter discoverable.
- Touch e2e coverage lives in `e2e/mobile.test.mjs` over CDP
  `Input.dispatchTouchEvent` (`createTouchHand`), per the test contract.
