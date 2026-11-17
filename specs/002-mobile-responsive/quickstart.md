# Quickstart: Mobile Responsive UX validation

Prerequisites: `npm ci`, `npm run pretest:e2e` (chromium), repo root.

## Automated gate

```sh
npm run check
```

Must pass: Prettier, speckit hardening, `tsc`, Vitest unit, Playwright e2e
(including the new `e2e/mobile.test.mjs` touch suite), `vite build`, bundle
secret scan.

## Desktop regression (SC-005)

```sh
npm run dev
# open http://localhost:5173 at 1280×800, mouse + keyboard only
```

Verify unchanged: knob scrub, double-click expand/collapse, double-click+
hold fan spawn, press-pull steering, ⌥-select→box, double-click deletes,
arrow-key nudge, Enter expand, hover readouts, custom cursor.

## Mobile validation (SC-001..004, SC-006)

Emulated (CI covers this via `e2e/mobile.test.mjs`):

- Playwright context `{ viewport: {width:390,height:844}, hasTouch:true,
isMobile:true }` — text fills width at 100% zoom, no horizontal scroll,
  tray fits, all G1–G8 gestures completable by touch alone.
- Repeat key assertions at 320×568 and landscape 844×390; rotate mid-session
  and confirm caret/boxes/knobs re-anchor and reading position holds.

Manual spot-check (constitution VI — what e2e cannot judge):

```sh
npm run dev
# Chrome DevTools → device toolbar → iPhone-sized preset, touch emulation on
```

- Pinch-zoom in/out: layout survives, no clipped controls.
- Long-press on knob: no native callout/selection on gesture elements;
  long-press on story text still allows selection for the ⊞ flow.
- Vertical pan over the text column scrolls; diagonal drag in the ahead
  zone steers (zone cue visible on press).
- Sound toggle, mode toggle, legend "?", launch dialog all ≥24 px targets
  and reachable.

## Session restore on mobile (edge case)

1. At desktop width: scrub forward, create a box, spawn+drop a future knob.
2. Resize to 390 px (or reload in a phone context — session persists in
   localStorage per origin; use same origin/port).
3. Caret position, attention highlight, and future knob re-appear anchored
   correctly inside the narrow column; nothing renders off-screen.
