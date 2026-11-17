# Tasks: Usability Remediation

**Input**: Design documents from `/specs/001-usability-remediation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui.md, quickstart.md

**Tests**: Required by constitution Principle VI — Vitest unit tests (`src/**/*.test.ts`) and Playwright e2e (`e2e/`); `npm run check` is the gate.

**Organization**: Tasks grouped by user story (US1–US5 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Confirm branch `001-usability-remediation` and spec artifacts exist under `specs/001-usability-remediation/`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Add localStorage helpers (safe get/set/remove tolerating unavailable storage) in `src/text/storage.ts`
- [x] T003 [P] Add `restore(tail)` to the stream API in `src/text/text-stream.ts` per contracts/ui.md (re-appends tail only when current word count matches)
- [x] T004 [P] Persist sound on/off in `src/text/sound/engine.ts` via `text-sound` localStorage key (as implemented)
- [x] T005 [P] Add `@media (prefers-reduced-motion: reduce)` CSS block and `.ghost`, `#hint`, `#legend`, zone-cue, `pin-flash` highlight styles to `index.html`

**Checkpoint**: Foundation ready — story work can begin.

---

## Phase 3: User Story 1 — First-time discovery (P1) 🎯 MVP

**Goal**: Page teaches itself — auto-reveal, first-drag hint, idle attract.

**Independent Test**: Fresh load shows text within ~2 s; hint dismisses on first drag and stays dismissed; attract plays after 6 s idle.

- [x] T006 [US1] Create `src/text/onboarding.ts` with `createOnboarding` per contracts/ui.md (auto-reveal driver via moveTo/pointAt, hint element lifecycle, attract loop, reduced-motion gate, engagement cancellation)
- [x] T007 [US1] Wire onboarding into `src/text/main.ts` composition (instantiate, start after first render, cancel on pointerdown/keydown, expose engagement flag for later stories)
- [x] T008 [US1] Add `#hint` element styling/positioning hooks in `index.html` if not covered by T005

**Checkpoint**: US1 independently testable — reload page, watch reveal + hint + attract.

---

## Phase 4: User Story 2 — Gesture legend and legible agency (P2)

**Goal**: Every gesture discoverable via legend dialog + plain-language labels.

**Independent Test**: `?` button / `h` key opens native dialog listing all gestures; Escape closes; tray fields show `title` tooltips.

- [x] T009 [P] [US2] Create `src/text/legend.ts` with static gesture table from data-model.md and `createLegend` per contracts/ui.md
- [x] T010 [P] [US2] Add `<dialog id="legend">` and tray `?` button to `index.html`
- [x] T011 [US2] Add `title` attributes to tray status fields in `src/text/status-line.ts` and wire the legend tray button in `src/text/main.ts`; the `h`/`?` key bindings are owned solely by `keyboard.ts` (T021) — no interim keydown was added
- [x] T012 [US2] Update `#pointer` aria-label and future-knob template aria-labels in `index.html`/`src/text/future-knobs.ts` to plain language where cheap

**Checkpoint**: US2 testable — open legend, verify all gestures listed match behavior.

---

## Phase 5: User Story 3 — Forgiving interactions (P3)

**Goal**: No unrecoverable loss — restore chip, dead-zone keeps knob, ⌥-select for boxes.

**Independent Test**: Each formerly-destructive gesture has a working recovery path.

- [x] T013 [P] [US3] Add `RestoreBuffer` tracking + `↩ restore` tray chip in `src/text/main.ts` using `stream.restore` from T003 (10 s expiry, hide when regeneration diverges)
- [x] T014 [P] [US3] Change dead-zone release in `src/text/future-knobs.ts` `drop()`: unchosen knob released inside dead zone stays in choosing state instead of `remove()`
- [x] T015 [US3] Gate `boxSelection` in `src/text/attention-knobs.ts` on Alt held at pointer-up (track modifier from pointerdown on `#text`); plain selection stays a normal selection
- [x] T016 [US3] Update legend gesture table (T009 content) to document ⌥-select and restore chip

**Checkpoint**: US3 testable — perform each destructive gesture, verify recovery.

---

## Phase 6: User Story 4 — Visible steering affordances (P4)

**Goal**: Ghost text ahead of caret, steering-zone cue, pin-provenance flash.

**Independent Test**: Each affordance renders in the correct state.

- [x] T017 [P] [US4] Create `src/text/ghost-text.ts` per contracts/ui.md; call from `render()` in `src/text/main.ts` with full `layoutLines` output; verify offsets unaffected
- [x] T018 [P] [US4] Create `src/text/zone-cue.ts` per contracts/ui.md; feed pointer zone from `src/text/pointer.ts`/`main.ts`; draw hairline at column edge + margin when zone is `"ahead"`
- [x] T019 [US4] Add transient `pin-flash` Custom Highlight over pinned sentence in `src/text/future-knobs.ts` `pin()` (~1.2 s fade) and ensure knob label visible
- [x] T020 [US4] Verify ghost text does not break attention boxes, selection offsets, or `domPointAt`/`textOffsetOf` (adjust `render()` equality check to compare shown content only)

**Checkpoint**: US4 testable — ghost text visible, zone cue on pointer-in-ahead, pin flash on realization.

---

## Phase 7: User Story 5 — Reach and persistence (P5)

**Goal**: Keyboard nudge, touch verification, persisted sound, reduced motion, session restore.

**Independent Test**: Each reach/persistence flow per quickstart.md Story 5.

- [x] T021 [P] [US5] Create `src/text/keyboard.ts` per contracts/ui.md (`↑↓←→` word nudge via `caretAfterWords`, `Enter` toggles attention, `h` opens legend, ignores inputs/dialogs/modifiers)
- [x] T022 [P] [US5] Create `src/text/session.ts` per contracts/ui.md + data-model.md (debounced save, 24 h staleness, keyword-text box restore, dimension-name future restore)
- [x] T023 [US5] Wire session save/restore into `src/text/main.ts` (snapshot on caret/box/knob change; restore after first render when sources ready)
- [x] T024 [US5] Wire `keyboard.ts` into `src/text/main.ts`; touch paths verified in T034 via CDP touch e2e (scrub + press-hold spawn) — all gestures ride Pointer Events, no custom-cursor dependency
- [x] T025 [US5] Verify `prefers-reduced-motion` suppresses attract/spin/pin-flash/blink/pulse (T005 CSS + T006 JS gate)

**Checkpoint**: US5 testable — keyboard-only scrub, reload restores state, sound persists, reduced-motion clean.

---

## Phase 8: Mode preview + Polish

- [x] T026 [P] Update `src/text/live-mode.ts` for armed `flight?` state when keys stored (2.5 s window, second click proceeds); dialog path unchanged when keys missing
- [x] T027 Update `docs/user-guide.md` gesture table to reflect ⌥-select, restore chip, legend, auto-reveal, ghost text, zone cue
- [x] T028 Run `npm run build` and fix type errors
- [x] T029 Run `npm run format`
- [x] T030 Run quickstart.md validation flows via Playwright; fix regressions
- [x] T031 Update `docs/usability-review.md` status notes marking remediated items

---

## Phase 9: Constitution remediation (post `/speckit-analyze`)

- [x] T032 [P] Unit tests: `src/text/text-stream.test.ts` (generate/busy, truncate+restore, expanded-opening guard) and `src/text/session.test.ts` (debounced save, load validation, TTL, clear) with stubbed localStorage
- [x] T033 [P] E2E `e2e/usability.test.mjs`: legend open/close via button + `h`/`?` + gesture-list audit, arrow-key nudge, Enter expand/collapse, keys ignored inside dialog, ghost text, zone cue, restore chip, session + sound persistence across reload, armed `flight?` mode toggle
- [x] T034 E2E: fresh-load auto-reveal + hint lifecycle/dismissal persistence; `prefers-reduced-motion` context; touch scrub + press-hold spawn/dead-zone keep via CDP touch events
- [x] T035 Fix session-restore race found by T033: `restoreSession` now waits until the stream holds the saved caret's words (30 s deadline fallback) instead of clamping to the first buffered words
- [x] T036 Update `README.md` and `CHANGELOG.md` `Unreleased` for the user-visible changes (constitution Principle VII)
- [x] T037 Run `npm test`, `npm run test:e2e`, `npm run build`, `npm run format`
- [x] T038 Post-implementation review fixes: Enter on a focused button/link no longer also toggles attention; `.touch-only` legend rows display under `(pointer: coarse)`; tap threshold covers the tap/hold dead zone; `#text[data-holding]` shows the delete-box sweep; session `savedAt` in the future is rejected

---

## Dependencies & Execution Order

- Phase 2 (T002–T005) blocks everything.
- US1 (T006–T008) independent; US2 (T009–T012) independent; US3 (T013–T016) depends on T003; US4 (T017–T020) depends on T005 styles; US5 (T021–T025) depends on US1 engagement flag + US4 render path.
- T026+ polish after all stories.
- Parallel: T009/T010, T013/T014, T017/T018, T021/T022 are file-disjoint.

## Parallel Example

```bash
# After Phase 2:
Task: T006 onboarding.ts  ||  Task: T009 legend.ts + T010 index.html dialog
Task: T013 restore chip   ||  Task: T014 future-knobs drop
Task: T017 ghost-text.ts  ||  Task: T018 zone-cue.ts
Task: T021 keyboard.ts    ||  Task: T022 session.ts
```

## Implementation Strategy

MVP = US1 alone (auto-reveal/hint/attract) — biggest UX delta for smallest change.
Then US3 (forgiveness) and US4 (visibility) as the highest-value increments;
US2/US5 complete the remediation.
