# Data Model: Usability Remediation

Phase 1 output. Entities are UI-state records; no database. Persistence is
localStorage JSON.

## SessionState (localStorage `spaceship.session`)

```ts
type SessionState = {
  version: 1 // blob ignored on mismatch
  caretWords: number // word count at knob rest; clamped on restore
  attention: BoxState[] // resolved against word list on restore
  future: FutureState[] // re-created only if dimension still offered
  savedAt: number // epoch ms; stale sessions (>24h) ignored
}

type BoxState = {
  keyword: string // keyword word text — stable identity across regen
  before: number // words before keyword in the box
  after: number // words after keyword in the box
}

type FutureState = {
  dimension: string // dimension name/id offered by the source
  position: number // normalized 0..1 swing value
  strength: number // normalized 0..1 distance value
}
```

**Validation / restore rules**:

- `caretWords` clamped to `[0, countWords(stream.text)]`.
- `attention` entries restored only if `keyword` text is found in the word list
  (first unused match wins); `before`/`after` clamped to text bounds.
- `future` entries restored only if the dimension source's next menu contains
  `dimension`; otherwise dropped silently.
- Whole blob ignored if JSON parse fails, version mismatches, or `savedAt` is
  older than 24 h.

## RestoreTail (in-memory, `main.ts`)

```ts
type RestoreTail = {
  words: number // word count at the deepest truncation point
  caretWords: number // where the knob rested before the scrub — the restore target
  snapshot: string // stream.text at the first discard of a scrub
}
// plus restoreTimer armed at RESTORE_MS = 10_000 on every scrub-back
```

**State transitions**: created on `discardIfBehindRest`; a later, deeper
discard in the same scrub updates only `words` (the snapshot stays the
pre-scrub text). Cleared by the `RESTORE_MS` timeout, by clicking the `↩ Nw`
chip (which derives `{words, text: snapshot.slice(firstWords(snapshot, words).length)}`
for `stream.restore` and returns the caret to `caretWords`), or when the knob
moves forward past `words` — in which case the chip hides.

## OnboardingState (localStorage + memory)

```ts
type Onboarding = {
  hintDismissed: boolean // persisted `spaceship.hint-dismissed`
  hasInteracted: boolean // session-only; gates attract mode
  autoRevealed: boolean // session-only; reveal runs once per load
}
```

## GestureLegend (static)

Enumerated list rendered into `#legend` dialog:

| Gesture                   | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| drag knob                 | scrub text forward/back; back rewinds and regenerates |
| double-click knob         | show/hide attention boxes                             |
| ⌥-drag select             | turn selection into an attention box                  |
| drag box                  | move a box's keyword to another word                  |
| double-click box          | delete it                                             |
| 2×click + hold knob       | spawn a future knob                                   |
| carry through gate        | choose a steering dimension                           |
| swing / pull out          | set value / strength; release to drop                 |
| double-click future knob  | delete it                                             |
| press past knob + drag    | pull the text toward your hand                        |
| `h` / `?`                 | this legend · `↑↓←→` nudge · `Enter` expand           |
| tray `sim`/`flight`       | switch mode (asks for API keys once)                  |
| tray `♪`                  | sound on/off                                          |
| touch: tap knob           | expand or collapse attention                          |
| touch: hold knob          | spawn a future knob (no double tap needed)            |
| touch: drag past the knob | pull the text toward your finger                      |
| touch: select text        | then tap "box" to make it an attention box            |
| touch: tap box or knob    | delete it                                             |
| touch: side buttons       | nudge the knob one word, expand or collapse           |

## TrayStatus (existing, extended labels only)

No shape change; `title` attributes added for decode (FR-005/R17).
