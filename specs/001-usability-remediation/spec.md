# Feature Specification: Usability Remediation

**Feature Branch**: `001-usability-remediation`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Remediate the usability issues identified in docs/usability-review.md — improvements P0 through P4"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - First-time discovery (Priority: P1)

A new user opens the app and, without any instructions, sees text appear and
understands that the knob controls what is revealed. The page teaches itself:
text auto-reveals on load, an idle attract animation demonstrates the scrub, and
a fading hint names the first gesture.

**Why this priority**: Today the app shows an empty page with a 14px knob and no
affordances; nothing is discoverable. This is the critical failure.

**Independent Test**: Load the page in a fresh browser profile with no prior
state; within 10 seconds, text is visible and a first-time user can produce a
text reveal by dragging the knob.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** the app initializes, **Then** text
   begins revealing automatically (auto-reveal) without requiring a drag.
2. **Given** a fresh page load where the user has never dragged, **When** 6
   seconds pass without interaction, **Then** the knob performs a gentle
   idle attract animation demonstrating forward/back scrub.
3. **Given** a first-time user who has not yet dragged the knob, **When** the
   page is idle after auto-reveal, **Then** a transient hint near the knob
   suggests dragging; the hint disappears permanently after the first
   successful drag.

---

### User Story 2 - Gesture legend and legible agency (Priority: P2)

A user who has discovered basic scrubbing can open a gesture reference at any
time and learn every verb the interface supports: scrub, expand/collapse
attention, select-to-box, spawn future knob, tune, drop, pin, delete,
press-pull steer, and the tray controls. Vague instrument names are replaced
with plain-language descriptions at point of use.

**Why this priority**: Six+ hidden gestures with zero signposting is the second
critical failure; a legend converts recall into recognition.

**Independent Test**: Open the gesture legend via its tray affordance (and
keyboard shortcut); verify every gesture listed matches implemented behavior.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the user activates the gesture
   legend (tray button or `h`/`?` key), **Then** a dialog lists all gestures
   with descriptions.
2. **Given** the legend is open, **When** the user presses Escape or activates
   close, **Then** the dialog closes and focus returns appropriately.
3. **Given** any hoverable instrument (knob, future knob, attention box, tray
   fields), **When** the user hovers, **Then** a plain-language label explains
   its function rather than only cryptic glyphs.

---

### User Story 3 - Forgiving interactions (Priority: P3)

A user who makes an exploratory or mistaken gesture can recover: scrub-back no
longer silently destroys generated text (an undo/restore path exists), releasing
a spawned future knob inside the dead zone no longer deletes it, and text
selection no longer accidentally converts to a steering box when the user
intended to copy.

**Why this priority**: Destructive-by-accident interactions erode trust;
forgiveness is the difference between an instrument and a trap.

**Independent Test**: Perform each formerly-destructive gesture and verify a
recovery path exists and works.

**Acceptance Scenarios**:

1. **Given** the user scrubs the knob backward past the rest point, **When**
   regeneration is triggered, **Then** the discarded text is restorable via a
   visible affordance for a limited window.
2. **Given** a spawned future knob released inside the dead zone, **When** the
   pointer is released, **Then** the knob is not deleted (it remains dormant or
   returns to a neutral state).
3. **Given** the user makes a text selection intending to copy, **When** they
   release, **Then** the selection remains a normal selection unless they
   explicitly invoke the box-creation gesture; copying works.

---

### User Story 4 - Visible steering affordances (Priority: P4)

A user can see where steering is possible before attempting it: the empty
region past the caret is visually delineated as a steering zone, generated text
waiting ahead of the knob is faintly visible as ghost text, and when a future
knob pins, the causal link between dial and sentence is made visible.

**Why this priority**: Invisible interaction zones and invisible causality are
why the demo's core value (steering) is hard to perceive.

**Independent Test**: Observe the page in each state and confirm the
corresponding affordance is rendered.

**Acceptance Scenarios**:

1. **Given** the knob has revealed text and more text is buffered, **When** the
   user views the column, **Then** upcoming text is faintly rendered ahead of
   the caret (ghost text).
2. **Given** the pointer is in the empty region past the caret, **When** it
   moves, **Then** a visual boundary indicates the press-pull steering zone.
3. **Given** a future knob reaches pin confidence, **When** it pins, **Then**
   the sentence it shaped is briefly highlighted and the knob's label is
   visible beside it.

---

### User Story 5 - Reach and persistence (Priority: P5)

Users on keyboard-only, touch, and reduced-motion setups can operate core
flows; sound preference persists across reloads; session state (position,
boxes, knobs) survives a reload.

**Why this priority**: The instrument currently only works for mouse users with
full motion and sound; broadening reach completes the remediation.

**Independent Test**: Operate core flows via keyboard alone; reload the page
and verify state restoration; toggle reduced-motion and verify animations are
suppressed.

**Acceptance Scenarios**:

1. **Given** keyboard focus on the page, **When** the user presses arrow keys,
   **Then** the caret/knob position moves by word.
2. **Given** a touch device, **When** the user long-presses and drags, **Then**
   future-knob spawn and tuning work without the custom cursor layer.
3. **Given** the user toggles sound off, **When** the page reloads, **Then**
   sound remains off.
4. **Given** `prefers-reduced-motion` is set, **When** animations would play,
   **Then** they are shortened or removed.
5. **Given** an active session with text position, attention boxes, and future
   knobs, **When** the page reloads, **Then** the session state is restored.
6. **Given** keyboard focus on the page, **When** the user presses Enter,
   **Then** attention boxes and future knobs expand or collapse.

---

### Edge Cases

- What happens when auto-reveal reaches the end of the buffer before the user
  interacts? Generation continues; the knob rests at the tip.
- What happens if the user drags during the first-drag hint display? The hint
  dismisses immediately.
- What happens when the restore window expires? The restore affordance is
  removed; regeneration proceeds normally.
- What happens when ghost text rendering conflicts with the custom cursor's
  hit-testing? Ghost text is non-interactive and pointer-transparent.
- What happens on very narrow viewports? All new affordances degrade gracefully
  (hints stack, legend remains reachable).
- What happens if localStorage is unavailable (private mode)? Persistence and
  hint-dismissal degrade silently to session-only.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The app MUST reveal text automatically on load without requiring
  user input, animating the knob from the start position toward the generated
  buffer at a readable pace.
- **FR-002**: The app MUST display a transient first-use hint suggesting the
  drag gesture, dismissed permanently (persisted) after the first successful
  knob drag.
- **FR-003**: The app MUST perform an idle attract animation after a period of
  no interaction, demonstrating knob scrub forward and back, suppressed once
  the user has interacted.
- **FR-004**: The app MUST provide a gesture legend accessible via a tray
  affordance and a keyboard shortcut, listing every user-facing gesture with a
  plain-language description, implemented with the native dialog element.
- **FR-005**: Hover labels on instruments MUST use plain language in addition
  to or instead of cryptic glyphs.
- **FR-006**: Scrub-back regeneration MUST offer a restore affordance for the
  discarded text for a bounded time window of 10 seconds.
- **FR-007**: Releasing a spawned future knob inside the dead zone MUST NOT
  delete the knob.
- **FR-008**: Text selection MUST remain a normal selection by default;
  conversion to an attention box MUST require an explicit additional action.
- **FR-009**: The app MUST render upcoming generated text as low-emphasis ghost
  text ahead of the caret.
- **FR-010**: The app MUST visually indicate the press-pull steering zone when
  the pointer is in the empty region past the caret.
- **FR-011**: When a future knob pins, the app MUST briefly highlight the
  sentence it shaped and show the knob's label.
- **FR-012**: Arrow keys MUST move the caret/knob position by word when the
  page has focus.
- **FR-013**: Touch input MUST support knob scrub, attention-box drag,
  future-knob spawn and tune without the custom cursor layer.
- **FR-014**: Sound on/off preference MUST persist across reloads via
  localStorage.
- **FR-015**: The app MUST respect `prefers-reduced-motion` for all decorative
  animations.
- **FR-016**: Session state (caret position, attention boxes, future knob
  settings) MUST persist across reloads and restore on next load.
- **FR-017**: The mode toggle's first activation MUST preview the consequence
  rather than immediately opening the credential dialog.
- **FR-018**: When the page has focus, the Enter key MUST toggle attention
  expansion (show or hide attention boxes and future knobs); keys typed into
  fields, dialogs, or with modifiers held MUST be left alone.

### Key Entities

- **Session state**: caret position, shown text extent, attention box
  definitions (keyword index, before/after spans), future knob definitions
  (dimension choice, position, strength), pinned sentences.
- **Gesture legend**: enumerated list of gestures and descriptions.
- **Restore buffer**: recently discarded generated text retained for a bounded
  window.
- **Ghost text**: buffered-but-unrevealed words rendered at low emphasis.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A first-time user can produce visible text within 10 seconds of
  page load without any instruction.
- **SC-002**: Every implemented gesture is discoverable from the legend without
  prior knowledge; legend coverage is 100% of user-facing gestures.
- **SC-003**: No user gesture results in unrecoverable loss of generated text
  or accidentally-created artifacts; all destructive paths have a recovery
  affordance.
- **SC-004**: Core flows (scrub, expand attention, spawn/tune/drop future
  knob) are completable via keyboard alone and via touch alone.
- **SC-005**: Sound preference and session state survive reload in 100% of
  cases where storage is available.
- **SC-006**: All decorative animations are suppressed under
  `prefers-reduced-motion`.

## Assumptions

- Simulated mode is the primary test target; live mode shares all UI
  remediation since sources are interchangeable by design.
- The existing custom cursor system, sound engine, and native dialog usage are
  retained; remediation adds to them rather than replacing them.
- Session persistence stores steering state, not the full generated text
  (which regenerates from the stream).
- The pull-steering zone boundary cue is a visual hairline/region indicator,
  not a modal takeover.
- Keyboard word-nudge granularity is one word per arrow press.
