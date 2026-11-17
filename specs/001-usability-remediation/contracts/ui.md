# UI Contract: Usability Remediation

Phase 1 output. Behavioral contract between modules — no external API.

## Module seams (new)

### `onboarding.ts`

```ts
createOnboarding({
  knob: HTMLElement,
  shownWords: () => number,      // words the knob currently shows
  bufferedWords: () => number,   // words the stream holds in total
  nudge: (delta: number) => void, // existing nudge from main.ts
  onEngaged?: () => void,        // user interacted; stops attract + marks hasInteracted
}): { start(): Promise<void>; noteDrag(): void; isEngaged(): boolean; destroy(): void }
```

- `start()` waits for `bufferedWords() > 0`, then auto-reveals by nudging at
  ~90 w/s for up to ~140 words (skipped/instant under `prefers-reduced-motion`),
  shows the `#hint` element, and schedules the attract loop 6 s later.
- `noteDrag()` retires the hint permanently (persisted
  `spaceship.hint-dismissed`); `destroy()` clears timers and removes the hint.

### `ghost-text.ts`

```ts
createGhostText({ textElement: HTMLElement }):
  { update(upcoming: string): void }
```

- `upcoming` is the generated text past the shown text; renders
  `firstWords(upcoming.trim(), 26)` as a trailing `<span class="ghost">`
  appended after every real offset, so word spans, ranges and caret math are
  unaffected. Empty input removes the ghost. Called from `render()` with
  `story.combined.slice(story.text.length)`.

### `zone-cue.ts`

```ts
createZoneCue({
  element: HTMLElement,          // #zone-cue
  textElement: HTMLElement,      // text column; cue marks its right edge
  zoneAtPoint: (x: number, y: number) => string, // "ahead" | other zones
}): { destroy(): void }
```

- Self-contained and event-driven: `pointermove`/`pointerdown` listeners track
  the pointer, `pointerup`/`pointercancel` clear it, and a rAF `place()`
  positions the hairline at the column's right edge, toggling `data-show` while
  `zoneAtPoint` reports `"ahead"`. Touch has no hover, so the cue shows while a
  finger is down in the zone and hides when it lifts.

### `keyboard.ts`

```ts
createKeyboard({
  nudge: (delta: number) => void,      // moves the knob `delta` words; ±1 per arrow
  toggleAttention: () => void,         // detachAllOrExpand
  openLegend: () => void,
  isEditing: () => boolean,            // focus in input/dialog/contenteditable
}): { destroy(): void }
```

- `ArrowDown`/`ArrowRight` nudge `+1`, `ArrowUp`/`ArrowLeft` nudge `-1`,
  `Enter` toggles attention, `h`/`?` opens the legend. All ignored while
  `isEditing()` or when meta/ctrl/alt is held. `Shift` is allowed.

### `session.ts`

```ts
createSession({
  snapshot: () => Omit<SessionState, "version" | "savedAt">,
  now?: () => number,                  // defaults to Date.now
}): { save(): void; load(): SessionState | undefined; clear(): void }
```

- Persists to localStorage key `spaceship.session` via `storage.ts` helpers
  (tolerates unavailable storage). `save()` debounces ~500 ms and stamps
  `version: 1` and `savedAt`; `load()` returns undefined on absent/corrupt
  JSON, version mismatch, malformed shape, or age >24 h; `clear()` removes the
  key and cancels a pending save.

### `legend.ts`

```ts
createLegend({ dialog: HTMLDialogElement, toggle: HTMLElement }): { open(): void; close(): void }
```

- Opens/closes the static `#legend` `<dialog>` (content lives in
  `index.html`, matching the GestureLegend table in data-model.md);
  `toggle` is the tray `?` button; `h`/`?` keys handled by `keyboard.ts`.

## Modified contracts

### `text-stream.ts`

Add to returned object:

```ts
restore(tail: { words: number; text: string }): boolean
// aborts any in-flight generation, replaces everything past `tail.words`
// with `tail.text`, and returns false only if the text has fewer than
// `tail.words` (it does not require an exact count match)
```

### `future-knobs.ts` `drop()`

- If `!knob.dimension` and released: keep knob in choosing state (no remove,
  no sound); it remains grabbable. Delete paths unchanged (double-click,
  drop-on-main).
- `pin()` additionally triggers a transient `pin-flash` highlight (new
  `CSS.highlights` name, ~1.2 s fade) over the pinned sentence.

### `attention-knobs.ts` `boxSelection`

- Convert selection → box only when Alt was held through the press on
  `textElement` (tracked via `pointerdown` modifier) or the floating
  `#box-action` button was tapped — the touch path, since touch selections
  have no modifier. A plain selection stays a normal selection so copying
  works.

### `touch.ts` / `touch-controls.ts`

- `touch.ts` exports `onTouchTap` (fires on a quick, still touch press;
  `main.ts` uses it for the knob tap toggle with a double-tap cancel) and
  `guardTouchHold` (suppresses the contextmenu so Android's long-press does
  not `pointercancel` mid-hold and kill press-and-hold spawn).
- `createTouchControls({nudge, toggleAttention})` wires the `#touch-controls`
  side buttons: word nudge and attention expand/collapse, shown only on
  coarse pointers.

### `live-mode.ts`

- Keys-stored path: toggle enters armed state (`flight?`, 2.5 s timeout);
  second click reloads live. Keys-missing path: opens dialog (unchanged).

### `sound/engine.ts`

- `isSoundOn()`/`setSoundOn()` read/write localStorage key `"text-sound"`
  with values `"on"`/`"off"` (missing or any other value counts as on).

### `main.ts` composition additions

- Instantiate `ghostText`, `zoneCue`, `keyboard`, `session`, `legend`,
  `onboarding`, `touchControls`.
- `render()` calls `ghostText.update(story.combined.slice(story.text.length))`
  and `session.save()` (debounced inside `createSession`).
- `discardIfBehindRest` records `restoreTail` (`{words, caretWords, snapshot}`),
  shows the tray chip, and arms a 10 s `RESTORE_MS` expiry; chip click derives
  the `stream.restore` tail from the snapshot and returns the caret to
  `caretWords`.
- `zoneCue` wires itself to pointer events; no `pointermove` feed needed.
- Keyboard `nudge` is shared by onboarding reveal, attract, arrows, and the
  touch side buttons.

### `index.html` additions

- `<dialog id="legend">` (native, `closedby="closerequest"`, same styling as
  `#live-keys`).
- `<div id="hint">` transient hint element (populated by onboarding).
- `<div id="touch-controls">` side buttons (coarse pointers only) and
  `#box-action` floating button (created by `attention-knobs.ts`, shown for
  touch selections).
- Tray: `?` legend button; `↩ restore` chip container (hidden by default).
- `#legend` lists `.touch-only` rows for the touch gestures.
- CSS: `.ghost`, `#hint`, `#legend`, `#touch-controls`, `#box-action` styles,
  `@media (prefers-reduced-motion)` block, `pin-flash` highlight color,
  zone-cue stroke, coarse-pointer sizing.
