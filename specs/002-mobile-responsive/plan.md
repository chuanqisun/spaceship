# Implementation Plan: Mobile Responsive UX

**Branch**: `002-mobile-responsive` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-mobile-responsive/spec.md`

## Summary

Make the spaceshipUI simulator usable on phone-width touch devices. The work
splits into three layers: (1) a responsive layout pass — viewport meta,
collapsible side gutters, a tray that fits narrow screens, and decorative
overflow guards; (2) a touch gesture mapping — every desktop gesture gets a
touch equivalent built on the existing Pointer Events seams (`makeDraggable`,
`onPressAndHold`, `createPointer`), with on-screen controls replacing
keyboard/hover-only functions; (3) native-gesture harmony — scoped
`touch-action`, callout/context-menu suppression, and pinch-zoom survival.
Desktop behaviour is gated behind pointer-type and `(pointer: coarse)` checks
so the mouse/keyboard experience is unchanged (FR-017, SC-005).

## Technical Context

**Language/Version**: TypeScript ~7.0.2 (strict, `erasableSyntaxOnly`), modern ESM

**Primary Dependencies**: Vite 8, Vitest 5 (unit + e2e projects),
playwright-core 1.65 (chromium), `@chenglou/pretext`, `@fontsource-variable/jetbrains-mono`.
No new runtime dependencies (spec assumption; constitution IX).

**Storage**: `localStorage` via `src/text/storage.ts`/`session.ts` — unchanged;
session state is already layout-agnostic (caret = word count, boxes keyed by
keyword text, future knobs by normalized position/strength).

**Testing**: Vitest unit tests (`src/**/*.test.ts`) for pure logic
(breakpoint/gutter math, gesture-mapping helpers); Playwright e2e UX suite
(`e2e/`, sim mode, no network/keys) extended with a touch context
(`hasTouch`, `isMobile`, 390×844) per constitution VI. `npm run check` is the
gate.

**Target Platform**: Evergreen desktop browsers (unchanged) + iOS Safari /
Android Chrome smartphones ~320–430 px portrait and landscape; tablets reuse
the same rules. Pointer Events cover mouse/pen/touch.

**Project Type**: Static web app (Vite multi-page: `index.html` + `extra/*`)

**Performance Goals**: 16 ms frame budget on the main thread (constitution
III); touch gestures reuse the existing rAF-driven drag/hold paths — no new
per-frame work beyond what mouse input already does.

**Constraints**: No new dependencies; desktop pixel-identical where required;
WCAG 2.1 AA + ≥24×24 px effective touch targets (SC-003); `prefers-reduced-motion`
and sound-toggle rules apply to any new affordance.

**Scale/Scope**: ~15 source files touched (`index.html` CSS/DOM, ~8 modules in
`src/text/`, `scripts/capture/hand.mjs`, `e2e/`), 18 `extra/` pages get a
viewport meta + shared.css guard only.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Checked against `.specify/memory/constitution.md` v1.1.1:

- **I. Composition-First TypeScript**: PASS — all changes extend existing
  factory modules (`pointer.ts`, `hold.ts`, `attention-knobs.ts`,
  `future-knobs.ts`, `zone-cue.ts`, new small modules); `main.ts` stays a
  composition root; no classes; `tsc` strict.
- **II. Semantic, Accessible, Minimal UI**: PASS — viewport/tray/dialog work
  is HTML/CSS; new on-screen controls are real `<button>`s with labels;
  decorative layers stay `aria-hidden`; touch affordances respect
  `prefers-reduced-motion`; native `<dialog>` retained.
- **III. Realtime Responsiveness and Cancellation**: PASS — touch paths reuse
  `makeDraggable`/`onPressAndHold`/`setPointerCapture`; no new async sources;
  steering keeps the existing pull-rate loop and abort semantics.
- **IV. Secure by Default**: PASS — no network calls, no `innerHTML`, no new
  dependencies, no secrets; gesture code is DOM-event only.
- **V. Privacy and Cost Accountability**: PASS — no analytics; no LLM paths
  touched.
- **VI. Test-First Quality**: PASS (planned) — unit tests for new pure helpers
  (breakpoint decision, touch gesture mapping, tray condensation rules);
  e2e touch suite covers scrub, expand, fan-spawn, steering-pull, box-create
  (SC-006); `npm test` + `npm run test:e2e` gate.
- **VII. Documentation as Code**: PASS (planned) — `README.md`,
  `CHANGELOG.md` Unreleased, `docs/user-guide.md` updated for touch gestures;
  gesture-mapping decisions recorded as `docs/adr/` entry (new interaction
  paradigm).
- **VIII–IX. CI/CD and Supply Chain**: PASS — no workflow or dependency
  changes; e2e additions run inside the existing `check` job.

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-mobile-responsive/
├── plan.md              # This file
├── research.md          # Phase 0 output — gesture/layout decisions
├── data-model.md        # Phase 1 output — touch mapping + layout entities
├── quickstart.md        # Phase 1 output — validation scenarios
├── contracts/           # Phase 1 output — touch-gesture + DOM contract
│   └── touch-gestures.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html                     # viewport meta, responsive CSS, touch controls,
                               #   legend copy, touch-action/callout rules
extra/*.html + extra/shared.css# viewport meta + minimal narrow-viewport guard
src/text/
├── main.ts                   # composition: wire touch controls, pass
│                             #   pointer-type-aware options to hold/pointer
├── pointer.ts                # enable press-pull for touch; keep custom
│                             #   cursor mouse/pen-only; touch affordance hooks
├── hold.ts                   # per-pointer-type hold policy (single long-press
│                             #   vs double-press+hold)
├── attention-knobs.ts        # touch path for select→box; reliable touch delete
├── future-knobs.ts           # touch spawn/delete affordances; tap-to-show HUD
├── zone-cue.ts               # show cue for touch presses in the ahead zone
├── keyboard.ts               # expose nudge/expand actions for on-screen controls
├── onboarding.ts             # touch-appropriate hint copy
├── legend.ts + index.html    # legend rows for touch gestures (FR-018)
├── layout.ts (new, small)    # breakpoint/coarse-pointer decision helper
├── touch-controls.ts (new)   # on-screen nudge/expand/box-commit controls
└── *.test.ts                 # unit tests for new pure helpers
scripts/capture/hand.mjs      # touch gesture primitives for e2e
e2e/mobile.test.mjs (new)     # touch-context UX suite (SC-006)
docs/adr/NNNN-touch-gestures.md
```

**Structure Decision**: single-project layout (Option 1). All work lands in
the existing `src/text/` feature folder following the one-module-per-concern
factory pattern; `index.html` remains the single stylesheet/DOM source. Two
new small modules (`layout.ts` breakpoint helper, `touch-controls.ts`)
are justified by real reuse: the breakpoint query is read by CSS-adjacent JS
and tests, and the controls cluster owns its own DOM/state.

## Phase 0 / Phase 1 Artifacts

- `research.md` — resolves: breakpoint mechanism, touch gesture mapping per
  FR, `touch-action` arbitration vs scrolling, selection→box touch path,
  delete affordance, target-size strategy, e2e touch driver approach.
- `data-model.md` — viewport/breakpoint context, touch gesture mapping,
  touch affordance layer, session re-anchor invariants.
- `contracts/touch-gestures.md` — the authoritative gesture table
  (desktop ↔ touch) plus DOM contract for new controls.
- `quickstart.md` — runnable validation: desktop regression + phone-viewport
  manual/e2e scenarios.
