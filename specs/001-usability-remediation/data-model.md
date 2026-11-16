# Data Model: Usability Remediation

Phase 1 output. Entities are UI-state records; no database. Persistence is
localStorage JSON.

## SessionState (localStorage `spaceship.session`)

```ts
type SessionState = {
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

## RestoreBuffer (in-memory, `main.ts`)

```ts
type RestoreBuffer =
  | {
      words: number // word count at truncation point
      tail: string // discarded text (firstWords-sliced)
      expiresAt: number // performance.now() + 10_000
    }
  | undefined
```

**State transitions**: created on `discardIfBehindRest`; cleared on restore,
expiry, or when `stream.text` word count diverges from `words` (regeneration
appended) — in which case the chip hides.

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

| Gesture                  | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| drag knob                | scrub text forward/back; back rewinds and regenerates |
| double-click knob        | show/hide attention boxes                             |
| ⌥-drag select            | turn selection into an attention box                  |
| drag box                 | move a box's keyword to another word                  |
| double-click box         | delete it                                             |
| 2×click + hold knob      | spawn a future knob                                   |
| carry through gate       | choose a steering dimension                           |
| swing / pull out         | set value / strength; release to drop                 |
| double-click future knob | delete it                                             |
| press past knob + drag   | pull the text toward your hand                        |
| `h` / `?`                | this legend · `↑↓←→` nudge · `Enter` expand           |
| tray `sim`/`flight`      | switch mode (asks for API keys once)                  |
| tray `♪`                 | sound on/off                                          |

## TrayStatus (existing, extended labels only)

No shape change; `title` attributes added for decode (FR-005/R17).
