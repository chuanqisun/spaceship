# Tasks: Mobile Responsive UX

**Input**: Design documents from `/specs/002-mobile-responsive/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/touch-gestures.md, quickstart.md

**Tests**: REQUIRED — constitution VI mandates unit tests for new pure logic and e2e coverage for new gestures (FR-019, SC-006). Write failing tests first.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared helpers both layout and gesture work depend on.

- [x] T001 Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to `index.html` `<head>` and to every `extra/*.html` missing it (all except `extra/illustrations.html`), per FR-001 and plan R1
- [x] T002 Create breakpoint/media-query helper backed by `matchMedia("(max-width: 44rem)")` and `matchMedia("(pointer: coarse)")` with change listeners, per data-model.md ViewportContext and plan R1/R4 — implemented as `src/text/breakpoints.ts` (`isNarrowLayout`, `isCoarsePointer`, `createViewport` factory with `onChange`/`destroy`) because `src/text/layout.ts` already owns text line layout
- [x] T003 [P] Add `*.test.ts` unit tests for the media-query logic with a stubbed `matchMedia`, per constitution VI — `src/text/breakpoints.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Touch e2e driver + narrow-layout CSS foundation that US1–US3 build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend `scripts/capture/hand.mjs` with `createTouchHand(page)` wrapping CDP `Input.dispatchTouchEvent` (`touchStart`/`touchMove`/`touchEnd`) with eased motion matching the mouse hand's pacing, per plan R8
- [x] T005 [P] Create `e2e/mobile.test.mjs` skeleton: helper opening the simulator with `browser.newContext({ viewport: {width:390,height:844}, hasTouch:true, isMobile:true })`, off-origin `context.route` blocking copied from `e2e/ux.test.mjs`, and `appOf`/`createTouchHand` wiring, per contracts/touch-gestures.md Test contract
- [x] T006 Add narrow-viewport CSS block to `index.html` `<style>`: `@media (max-width: 44rem)` setting `--margin: 0ch; --rail-width: 0px`, `#rail { display:none }`, `#text` clamp verification at 320px, per plan R2 and contracts CSS contract
- [x] T007 Add `@media (pointer: coarse)` hit-area expansion to `index.html` `<style>`: ≥24×24 px effective targets on `.knob`, `#pointer`, `.future`, tray buttons, and dialog buttons via non-visual padding/`::before` expansion, per FR-005, SC-003, plan R3
- [x] T008 Clamp `refreshRail` translate in `src/text/main.ts` so the rail never positions off-viewport at narrow widths (defensive even when `#rail` is hidden), per plan R2
- [x] T009 Update `placeInRightMargin` in `src/text/margin-pins.ts` with a narrow-viewport path: when `room <= 0`, stack pins in a compact column clamped to `clientWidth` instead of placing off-screen, per plan R2 and data-model.md Layout entities

**Checkpoint**: Foundation ready — viewport meta lands, media helpers exist, touch e2e harness exists, narrow layout no longer overflows. User story work can begin.

---

## Phase 3: User Story 1 — Readable layout on a phone screen (Priority: P1) 🎯 MVP

**Goal**: At 320–430 px viewports the text column fills the width at 100% zoom, the tray and dialogs fit, decorative layers never overflow, and rotation/resize reflows correctly.

**Independent Test**: Open the app at 390×844 with touch emulation; verify text column fills width, all text legible, no horizontal page scroll, tray fits, rotation re-lays out (spec US1 independent test).

### Tests for User Story 1

- [x] T010 [P] [US1] Add e2e assertions in `e2e/mobile.test.mjs`: at 390×844 assert `#text` rect width > 60% of viewport, `document.documentElement.scrollWidth <= innerWidth` (no horizontal overflow), `#tray` rect within viewport, and no `pageerror`s — per SC-001/SC-004
- [x] T011 [P] [US1] Add e2e resize/rotation test in `e2e/mobile.test.mjs`: load at 390×844, `page.setViewportSize({width:844,height:390})`, assert caret/knob re-anchored and `scrollWidth` still fits — per FR-016, spec US1/AC4

### Implementation for User Story 1

- [x] T012 [US1] Condense `#tray` under `@media (max-width: 44rem)` in `index.html` `<style>`: allow status zones to wrap to two lines, hide `abbr` glyph prefixes/unit suffixes where needed, grow `--tray-height` (body padding already derives from it), per FR-004 and plan R2
- [x] T013 [US1] Make legend `#legend` `<dl>` single-column under the narrow query and verify `#live-keys` dialog fits 320 px in `index.html` `<style>`, per FR-004 — dialogs also get `max-height: 100dvh` + `overflow: auto` so tall single-column content scrolls inside the dialog
- [x] T014 [US1] Fix `#hint` positioning in `src/text/onboarding.ts`: drop `white-space: nowrap` under narrow widths (CSS) and clamp computed left position to viewport bounds, per plan R2
- [x] T015 [US1] Verify decorative layers cannot overflow: audit `#links` SVG children, `.future > span` labels, and `#zone-cue` positioning at 320 px; clamp or hide per FR-003 (coordinate with T009's `placeInRightMargin` path) — unpinned future labels hidden when no gutter; verified via `scrollWidth <= innerWidth` e2e assertions
- [x] T016 [US1] Session-restore re-anchor check: add e2e assertion in `e2e/mobile.test.mjs` that a session saved at desktop width restores caret/boxes/future knob inside the narrow viewport (no off-screen elements), per spec edge case and plan R7

**Checkpoint**: US1 independently testable — phone-width layout is readable, tray/dialogs fit, rotation safe.

---

## Phase 4: User Story 2 — Every gesture has a touch-friendly path (Priority: P1)

**Goal**: Using only touch input at phone width, every legend gesture produces the same end state as desktop — no double-tap-and-hold, no sub-8 px precision, no hover dependency.

**Independent Test**: Drive the simulator with `createTouchHand` through every gesture in the legend at 390×844; each reaches the desktop end state (spec US2 independent test).

### Tests for User Story 2

- [x] T017 [P] [US2] Add failing e2e test in `e2e/mobile.test.mjs`: touch drag on `#pointer` knob scrubs text forward/backward (G1, FR-006)
- [x] T018 [P] [US2] Add failing e2e test in `e2e/mobile.test.mjs`: single long-press on knob spawns future knob and touch drag completes fan/tune/drop (G3, FR-008)
- [x] T019 [P] [US2] Add failing e2e test in `e2e/mobile.test.mjs`: press+drag in ahead zone engages steering pull with zone cue visible (G4, FR-009)
- [x] T020 [P] [US2] Add failing e2e test in `e2e/mobile.test.mjs`: native text selection + ⊞ commit creates attention box; long-press deletes box and future knob (G5/G6, FR-010/FR-011)
- [x] T021 [P] [US2] Add failing e2e test in `e2e/mobile.test.mjs`: ◀ ▶ nudge and ⏎ expand/collapse via `#touch-controls` produce same state as keyboard (G2/G7, FR-007/FR-012)

### Implementation for User Story 2

- [x] T022 [US2] Add per-pointer-type hold policy to `src/text/hold.ts`: option allowing touch pointers to fire `onHold` without `secondPressWithin` (single long-press), keeping mouse/pen double-press+hold unchanged; add unit tests in `src/text/hold.test.ts` (new) per constitution VI
- [x] T023 [US2] Wire touch spawn in `src/text/main.ts`: pass pointer-type-aware options to `onPressAndHold` for the knob so `pointerType === "touch"` single long-press calls `futureKnobs.spawn`, per FR-008 and contract G3
- [x] T024 [US2] Enable press-pull steering for touch in `src/text/pointer.ts`: remove the touch early-return for the steering branch only (keep `use(false)` so no custom cursor renders for touch), per FR-009 and contract G4
- [x] T025 [US2] Show `#zone-cue` on touch press in the ahead zone: remove the `pointerType === "touch"` guard in `src/text/zone-cue.ts` and trigger on `pointerdown` (not just `pointermove`) for touch, per FR-009/FR-013 and contract G4/G8
- [x] T026 [US2] Create `src/text/touch-controls.ts`: factory rendering `#touch-controls` cluster (◀ ▶ ⏎ ⊞ buttons per contracts/touch-gestures.md DOM contract), shown only under `isCoarsePointer()` from T002, wiring ◀/▶/⏎ to the same nudge/toggle functions `keyboard.ts` exposes and ⊞ to the box-commit path; compose it in `src/text/main.ts`
- [x] T027 [US2] Add box-commit path in `src/text/attention-knobs.ts`: expose a `commitSelection()` that runs the existing `boxSelection`/`addBox` logic with the `altKey` requirement bypassed for the explicit touch commit; keep ⌥-drag path unchanged, per FR-010 and contract G5
- [x] T028 [US2] Enable/disable `#touch-box` on `selectionchange` in `src/text/touch-controls.ts` (non-empty `getSelection()`), per contract DOM contract
- [x] T029 [US2] Add touch delete: `onPressAndHold` touch-only ~500 ms policy on `.future` elements in `src/text/future-knobs.ts` and on attention boxes in `src/text/attention-knobs.ts` calling existing delete paths; retain `dblclick`/`onDoubleClick` fallbacks, per FR-011 and contract G6
- [x] T030 [US2] Pin future-knob HUD on touch tap in `src/text/future-knobs.ts`: a touch `pointerup` without drag sets persistent `isHovered`-equivalent so `hudNodesOf` readouts stay visible until next tap/drag, per FR-013 and contract G8
- [x] T031 [US2] Surface attention-box info on touch tap in `src/text/attention-knobs.ts`: tap (no drag) on a box reports its keyword via `showStatus`/status line, per FR-013 and contract G8

**Checkpoint**: US2 independently testable — every legend gesture completable by touch alone at phone width.

---

## Phase 5: User Story 3 — Touch-appropriate feedback and native-gesture harmony (Priority: P2)

**Goal**: Touch users get equivalent state feedback (zone cues, press states, HUD) without hover; native callout/context-menu/double-tap-zoom conflicts are suppressed only where app gestures need it; scrolling works in unclaimed regions; desktop input is unchanged.

**Independent Test**: On a touch viewport, perform each gesture and verify equivalent feedback; verify long-press on text still allows selection, vertical pans scroll, and a paired mouse still gets the full desktop experience (spec US3).

### Tests for User Story 3

- [x] T032 [P] [US3] Add failing e2e test in `e2e/mobile.test.mjs`: vertical pan over `#text` scrolls the page (no dead zone) and pinch-zoom/viewport change doesn't break layout — per FR-015/FR-016, spec US3/AC3
- [x] T033 [P] [US3] Add failing e2e test in `e2e/mobile.test.mjs`: long-press on `.knob`/`.future`/tray does not trigger native callout; long-press on story text still produces a selectable selection — per FR-014, spec US3/AC2
- [x] T034 [P] [US3] Add e2e regression check in `e2e/mobile.test.mjs` (or existing suite): desktop context (mouse) still shows custom cursor, hover wake, and all desktop gestures unchanged — per FR-017, SC-005

### Implementation for User Story 3

- [x] T035 [US3] Scope `touch-action` in `index.html` `<style>`: `#text { touch-action: pan-y }` (verify pinch-zoom survives; use `pan-y pinch-zoom` if needed); keep `touch-action: none` on `.knob`, `.future`, `#tray`, `dialog`; per FR-015 and plan R5
- [x] T036 [US3] Suppress native callout/context menu on gesture elements: `-webkit-touch-callout: none` + `contextmenu` `preventDefault` on `.knob`, `.future`, `#tray`, dialogs in `index.html`/module wiring; leave `#text` selection untouched, per FR-014 and plan R5
- [x] T037 [US3] Add press-state affordance for touch: `data-pressed`/existing `--near` styling on `.knob`, `.future`, and boxes during touch `pointerdown`→`pointerup` in the relevant modules, per FR-013 and spec US3/AC1
- [x] T038 [US3] Move hover-only tray hints into touch-accessible form: ensure `abbr[title]` tooltips have `aria-label` equivalents and legend documents touch gestures — coordinate copy with T039, per FR-013/FR-018

**Checkpoint**: All three user stories independently functional; native/mobile behaviors harmonious.

---

## Phase 6: User Story sweep — legend/onboarding/docs (cross-story, FR-018)

**Goal**: Onboarding and legend describe touch gestures accurately on touch devices; docs updated per constitution VII.

- [x] T039 [P] Update legend `<dl>` in `index.html` and `src/text/legend.ts`/`onboarding.ts` hint copy: touch-accurate gesture descriptions gated on `isCoarsePointer()` (single long-press spawn, ⊞ commit, on-screen controls), per FR-018 and plan R9
- [x] T040 [P] Write ADR `docs/adr/NNNN-touch-gesture-mapping.md` recording the gesture mapping and `touch-action` arbitration decisions (plan R4/R5), per constitution VII
- [x] T041 [P] Update `README.md`, `CHANGELOG.md` (`Unreleased`), and `docs/user-guide.md` for mobile/touch support, per constitution VII
- [x] T042 Run `npm run format` then `npm run check`; fix all failures (typecheck, unit, e2e, build, secret scan) per AGENTS.md workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (T002 media helper, T004/T005 touch harness, T006–T009 layout foundation)
- **US1 (Phase 3)**: After Foundational; independent of US2/US3 code paths (CSS + positioning guards)
- **US2 (Phase 4)**: After Foundational; touches `main.ts`, `pointer.ts`, `hold.ts`, `attention-knobs.ts`, `future-knobs.ts`, `zone-cue.ts`, new `touch-controls.ts` — sequence internally (T022→T023, T026→T027/T028)
- **US3 (Phase 5)**: After Foundational; overlaps US2 files (`pointer.ts` press states, `attention-knobs.ts`) — run after US2 gesture wiring lands to avoid conflicts, or split carefully by function
- **Sweep (Phase 6)**: After US1–US3 (legend copy references final gestures)

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP
- **US2 (P1)**: Foundational only — parallel with US1 except shared `main.ts` composition (T023/T026 both edit it; sequence or combine)
- **US3 (P2)**: Foundational only; soft dependency on US2 for press-state hooks in the same modules

### Parallel Opportunities

- T003, T004, T005 (test/harness tasks, different files)
- T006+T007 CSS blocks can be one edit but are logically parallel-safe
- T010/T011, T017–T021, T032–T034 e2e tasks all edit `e2e/mobile.test.mjs` — NOT parallel with each other; write as one file sequentially or split describes carefully
- T040/T041 docs tasks parallel
- US1 implementation (T012–T016) parallel with US2 gesture modules once T026 lands

### Parallel Example: User Story 2

```bash
# After T022 (hold policy) lands:
Task: "Wire touch spawn in src/text/main.ts (T023)"
Task: "Enable press-pull steering for touch in src/text/pointer.ts (T024)"   # different file
Task: "Show #zone-cue on touch press in src/text/zone-cue.ts (T025)"        # different file
# Then T026 touch-controls.ts, then T027/T029/T030/T031 module wiring
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup + Phase 2 Foundational
2. Phase 3 US1 → phone-width layout usable; `e2e/mobile.test.mjs` layout tests green
3. **STOP and VALIDATE**: quickstart.md desktop regression + mobile layout checks

### Incremental Delivery

1. Setup + Foundational → harness ready
2. US1 → readable mobile layout (MVP demo)
3. US2 → full touch gesture parity (the core ask: "double tap and hold is painful")
4. US3 → feedback/harmony polish
5. Sweep → legend/docs/ADR, `npm run check` green

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story independently completable and testable per its Independent Test
- Verify tests fail before implementing (constitution VI)
- Commit after each task or logical group
- `main.ts` is a composition root touched by T023/T026/T008 — sequence these

---

## Phase 7: Convergence

**Purpose**: Close gaps found by auditing the implemented code against spec.md, plan.md, contracts/, and the constitution. Findings F1–F11 from the converge run; ordered CRITICAL/HIGH first.

- [ ] T043 Gate `guardTouchHold` contextmenu prevention to touch/pen pointers only and exclude text inputs and links, so desktop right-click (paste in `#live-keys`, `extra` link) is unchanged per FR-017/SC-005 (contradicts)
- [ ] T044 Fix `.touch-only` CSS ordering in `index.html` so touch legend rows display under `@media (pointer: coarse)`, and add an e2e assertion that the rows are visible on a touch context per FR-018 (partial)
- [ ] T045 Give attention boxes a ≥24px effective touch hit area and scope the ~500ms hold-delete still-check to the press point/box rect (not `circleOf(#text)` width/2), with a visible hold sweep affordance, per FR-005/FR-011/SC-003/SC-002 (partial)
- [ ] T046 Restore vertical attention-box dragging on touch (touch-action scoping or drag threshold so `pan-y` doesn't cancel box moves) and suppress callout/contextmenu only when the press starts on a box, per US2/SC-002/FR-014 (partial)
- [ ] T047 Change `#text` touch-action to allow pinch-zoom (`pan-y pinch-zoom`) and verify steering, scroll, and e2e still pass per FR-014 and spec pinch-zoom assumption (partial)
- [ ] T048 Make the reserved tray height reflect the real wrapped tray on narrow+coarse viewports (fixed two-line height or measured) so `#touch-controls` and `#zone-cue` don't overlap per FR-004 (partial)
- [ ] T049 Re-anchor the caret by word count (`caretAfterWords`/`shownCount`) on resize/rotation instead of preserving the geometric `{line,x}` caret per FR-016 (partial)
- [ ] T050 Add a compact touch steering readout (pull rate/direction) during press-pull and document tray metric hints (`w/s`, `ms`, `+buffer`) in the legend or aria equivalents per FR-013 (partial)
- [ ] T051 Cancel the pending tap-expand timer on the next `pointerdown` (not only on qualifying `pointerup`) to fix tap-then-hold expand+spawn ambiguity per spec edge cases (partial)
- [ ] T052 Remove or wire up unused helpers (`createViewport`, `trackModality`, `pointerKindOf` in `src/text/breakpoints.ts`), add CSS for `#text[data-pressed]` or remove the attribute, update stale "double click" aria-labels for touch devices, sync `contracts/touch-gestures.md` DOM ids with implementation, and add `#zone-cue` to the `prefers-reduced-motion` block per Constitution I/II and FR-013 (unrequested)
- [ ] T053 Add e2e coverage in `e2e/mobile.test.mjs` for the remediated areas: touch legend row visibility, pinch-zoom survival, attention-box drag/delete robustness, tray/`#touch-controls` non-overlap, and non-empty-caret resize re-anchoring per FR-019/SC-006 (partial)
