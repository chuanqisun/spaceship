# Research: Usability Remediation

Phase 0 output. All spec unknowns resolved against the existing codebase; no
external research needed — every mechanism already exists in some form.

## R1 — Auto-reveal on load (FR-001)

- **Decision**: On load, animate the caret from `{line:0, x:0}` toward the
  furthest reachable position (end of buffered text or viewport bottom), at a
  readable pace (~40–60 words/sec effective), implemented in `onboarding.ts`
  as a rAF/interval driver that calls the existing `moveTo(pointAt(caret))`
  path per step.
- **Rationale**: Reuses `caretAt`/`pointAt`/`moveTo` so reveal is identical to a
  user drag; generation already buffers 300+ words so the reveal never starves.
- **Alternatives considered**: CSS-only text fade-in (rejected — doesn't
  demonstrate the knob↔text mapping, which is the point); instant jump to a
  mid position (rejected — too abrupt, hides the scrub metaphor).
- **Cancellation**: Any `pointerdown` on the knob or page, or any keypress,
  cancels auto-reveal and marks the user as "engaged" (disables attract mode).

## R2 — Idle attract mode (FR-003)

- **Decision**: After 8 s without interaction (and only if the user has never
  dragged), animate the knob ±N words around its rest point in a slow loop.
  Implemented in `onboarding.ts` with the same caret-move path; suppressed by
  `prefers-reduced-motion` and by any interaction.
- **Rationale**: The "screensaver" instinct; demonstrates reversibility of the
  scrub. Cheap: reuses moveTo.
- **Alternatives considered**: Animating a decorative element (rejected — must
  teach the real gesture); particle effects (rejected — off-brand).

## R3 — First-drag hint (FR-002)

- **Decision**: A transient label near the knob ("drag to reveal the story"),
  shown after auto-reveal completes or on first pointer proximity, dismissed on
  first successful `onDrag` of the main knob; dismissal persisted in
  localStorage (`spaceship.hint-dismissed`).
- **Rationale**: One-line hint per review P0.2; localStorage flag prevents
  re-appearance for returning users.

## R4 — Gesture legend (FR-004, FR-005)

- **Decision**: New `<dialog id="legend">` in `index.html` (native dialog API,
  matching `#live-keys`), populated by `legend.ts` from a static gesture list.
  Opened by a `?`/`h` tray button and the `h` key; closed by Escape/`closedby`.
  Tray glyph fields get `title` attributes with plain-language expansions.
- **Rationale**: AGENTS.md mandates native dialog; legend content is static
  text so a plain module suffices (no factory needed beyond open/close wiring).
- **Alternatives considered**: Tooltip-only (rejected — too many gestures);
  onboarding tour (rejected — heavyweight, fights the instrument aesthetic).

## R5 — Restore discarded text (FR-006)

- **Decision**: `text-stream.ts` gains `truncate` bookkeeping: when
  `discardIfBehindRest` truncates, `main.ts` captures the discarded tail
  (word count + text). A `restore()` stream method re-appends the tail if the
  current text is still exactly the truncation prefix (i.e., regeneration has
  not yet appended). UI: a tray chip `↩ restore N words` visible for ~10 s.
- **Rationale**: Minimal stream change; regeneration typically appends quickly
  in sim (buffer top-up), so the window is naturally bounded — enforce an
  explicit 10 s timeout too.
- **Alternatives considered**: Never truncate (rejected — breaks the
  regeneration demo); undo stack of arbitrary depth (rejected — YAGNI, one
  tail suffices).

## R6 — Dead-zone release forgiveness (FR-007)

- **Decision**: In `future-knobs.ts` `drop()`, when the knob has no chosen
  `dimension` and is released, do not `remove()` — instead leave it in
  "choosing" state at the drop point, dimmed, still grabbable, with its menu
  intact. Only double-click or drop-on-main-knob deletes (unchanged).
- **Rationale**: A knob that never chose does no harm parked; deleting on an
  accidental release inside the dead zone was the destructive path.
- **Alternatives considered**: Animate back to main knob then delete (still
  deletes — violates FR-007); auto-choose nearest dimension (rejected —
  surprising, removes user agency).

## R7 — Selection vs. box disambiguation (FR-008)

- **Decision**: `boxSelection` in `attention-knobs.ts` only converts a
  selection to an attention box when `Alt` (Option) is held at pointer-up.
  Plain selections remain normal (copy works). Legend + hint document
  "⌥-select a passage to box it".
- **Rationale**: Explicit modifier = explicit additional action per FR-008;
  zero-cost to discover via legend; preserves all existing box gestures
  (expand, drag, delete).
- **Alternatives considered**: "Boxify" button on selection (rejected —
  floating UI fights the aesthetic); double-click-drag (rejected — conflicts
  with knob double-click grammar).

## R8 — Ghost text (FR-009)

- **Decision**: `ghost-text.ts` renders the next ~2 laid-out lines beyond the
  caret inside `#text` as a trailing `<span class="ghost">` appended after the
  shown content. `shownText`/`story.text`/word-spans logic is unchanged — ghost
  lives only in the DOM, after all real offsets, so every offset-based consumer
  (boxes, ranges, caret math) is unaffected. Styled `color: var(--ink-5)` (or
  `opacity`), `pointer-events: none` semantics inherited (zone is already
  "ahead"). Recomputed in `render()` from the same `layoutLines` output used
  for shown text.
- **Rationale**: Cheapest correct approach — same layout engine, no second
  measurement pass, no offset perturbation. Appending after shown text keeps
  all `textOffsetOf`/`domPointAt` mappings valid.
- **Alternatives considered**: Separate absolutely-positioned layer (rejected —
  duplicates layout logic, drift risk); Custom Highlight on real offsets
  (rejected — ghost words aren't in `shownText` so there are no offsets).
- **Risk**: `element.textContent` currently stores `story.content`; ghost must
  be a child element so `textContent` still equals shown+ghost — update the
  `render()` equality check to compare shown content only, and ensure
  `domPointAt` handles the extra trailing text node (it maps offsets; trailing
  node is beyond all real offsets — verify in implementation).

## R9 — Steering zone cue (FR-010)

- **Decision**: `zone-cue.ts` draws a faint vertical hairline at the text
  column's right edge extended into the right margin whenever the pointer is in
  the "ahead" zone (or always, at very low emphasis). Implemented as an SVG
  line or CSS gradient in the existing `#links` layer / cursor layer.
- **Rationale**: The zone already exists in `zoneAt`; the cue just makes it
  visible before pressing. Reuse `--ink-5` hairline styling.
- **Alternatives considered**: Shading the whole ahead region (rejected —
  visually noisy, competes with ghost text); only on hover-near (rejected —
  defeats the purpose of pre-discovery).

## R10 — Pin provenance flash (FR-011)

- **Decision**: On `pin()` in `future-knobs.ts`, register a transient Custom
  Highlight (`pin-flash`) over the pinned sentence range with an orange fade
  (~1.2 s), and ensure the knob's `> span` label is visible. The existing
  `pinned-sentence` dashed underline remains for hover.
- **Rationale**: CSS Custom Highlight API already used throughout; flash is a
  pure presentation addition in `layout()`/`follow()`.

## R11 — Keyboard operation (FR-012)

- **Decision**: `keyboard.ts` adds a `keydown` listener: `ArrowUp`/`ArrowDown`
  (and `ArrowLeft`/`ArrowRight` when not editing) move the caret one word via
  the existing `caretAfterWords(count ± 1)` + `moveTo`; `Enter` toggles
  attention expand/collapse; `h` opens the legend. Ignored when focus is in an
  input/dialog or a modifier other than Shift is held.
- **Rationale**: `caretAfterWords` already exists for `pullToward`; reuse it.

## R12 — Touch support (FR-013)

- **Decision**: Audit pointer-event paths — `makeDraggable` and
  `onPressAndHold` already use pointer events, so knob scrub, box drag, and
  spawn-hold likely work on touch. Add: (a) long-press on empty ahead-region
  as an alternative spawn path is OUT of scope; (b) verify `onPressAndHold`'s
  double-press window works with touch pointerIds (it should — pointerId-agnostic);
  (c) ensure the custom cursor layer stays disabled for touch (already done in
  `pointer.ts`); (d) add `touch-action` verification on `#text` (already
  `touch-action: none`).
- **Rationale**: Mostly verification + small fixes rather than new architecture.
- **Alternatives considered**: Dedicated touch gesture set (rejected — YAGNI
  until tested; pointer events unify the paths).

## R13 — Sound persistence (FR-014)

- **Decision**: `sound/engine.ts` `setSoundOn`/`isSoundOn` persist to
  localStorage key `spaceship.sound-on`; `showSoundToggle` reads persisted
  value on init.
- **Rationale**: Trivial; engine already owns the boolean.

## R14 — Reduced motion (FR-015)

- **Decision**: CSS `@media (prefers-reduced-motion: reduce)` block disabling
  `pin`, `spin`, `pulse`, `blink` animations and transitions; JS side,
  `onboarding.ts` checks `matchMedia("(prefers-reduced-motion: reduce)")`
  before attract mode and uses instant (single-step) auto-reveal.
- **Rationale**: Standard practice; CSS covers declarative animations, JS gate
  covers programmatic ones.

## R15 — Session persistence (FR-016)

- **Decision**: `session.ts` serializes to localStorage `spaceship.session`
  (debounced on change, cleared on explicit reset): caret word count, attention
  boxes (keyword word text + before/after counts — re-resolved to indices on
  restore by matching keyword text in the new word list), future knobs
  (dimension name + normalized swing position + strength — re-created only if
  the dimension source offers that dimension again). Restore happens after the
  first render; mismatches degrade by dropping the unresolvable item.
- **Rationale**: Steering state, not text (per spec assumption); text
  regenerates stochastically so exact offsets are meaningless — keyword-text
  matching is the stable identity.
- **Alternatives considered**: Persist full text (rejected — huge, and
  regeneration makes it stale); URL-hash state (rejected — localStorage is
  simpler and already used for keys).

## R16 — Mode toggle preview (FR-017)

- **Decision**: `live-mode.ts` — first click on `sim` when no keys are stored
  shows the launch dialog as today (it already explains consequences); the
  improvement is the toggle button label/state: while the dialog is open the
  toggle reads `launch?` and after abort returns to `sim` with a one-time hint.
  When keys ARE stored, clicking goes straight to a lightweight confirm state
  (`flight?` for 2.5 s, second click proceeds) — no dialog unless keys missing.
- **Rationale**: Preview-then-commit for the common (keys-stored) path;
  credential dialog only when actually needed.

## R17 — Telemetry decode (review P3.12, folded into FR-005)

- **Decision**: Tray `abbr`/`b` elements get `title` attributes with full
  phrases ("words shown, + generated past the knob", etc.). Legend lists all
  tray fields.
- **Rationale**: Cheap; `showStatus` already has the names.

## Dependencies & sequencing

- Ghost text (R8) and zone cue (R9) both render in/near `render()` — implement
  together to avoid layout conflicts.
- Session persistence (R15) depends on stable identities for boxes/knobs —
  implement after R6/R7 semantics settle.
- Keyboard (R11) and legend (R4) share the `h`/`Enter` keymap — implement
  together in `keyboard.ts`.
