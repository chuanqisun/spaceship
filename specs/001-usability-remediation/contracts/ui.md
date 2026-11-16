# UI Contract: Usability Remediation

Phase 1 output. Behavioral contract between modules — no external API.

## Module seams (new)

### `onboarding.ts`

```ts
createOnboarding({
  knob: HTMLElement,
  caret: () => Caret,
  moveTo: (point: Point) => void,   // existing moveTo from main.ts
  pointAt: (caret: Caret, metrics: TextMetrics) => Point,
  metricsOf: () => TextMetrics,
  furthestCaret: () => Caret,        // end of buffered text
  onEngaged: () => void,             // user interacted; stops attract + marks hasInteracted
}): { start(): void; destroy(): void }
```

- `start()` begins auto-reveal unless `hintDismissed` already true AND session
  restored (still reveal — restore positions caret, reveal is skipped if caret
  already advanced).
- Emits hint element lifecycle: creates `#hint` div near knob, removes on first
  `onDrag` or after auto-reveal + 6 s.

### `ghost-text.ts`

```ts
createGhostText({ textElement: HTMLElement, style: CSSStyleDeclaration }):
  { update(lines: string[], caretLine: number): void }
```

- `lines` = full `layoutLines` output (shown + upcoming); renders lines after
  `caretLine`'s content as a trailing `<span class="ghost">` with `\n`-joined
  text at `--ink-5`. Called from `render()`; must run after `element.textContent`
  is set for shown content.

### `zone-cue.ts`

```ts
createZoneCue({ layer: SVGElement | HTMLElement, textElement: HTMLElement }):
  { update(pointer: { x: number; y: number }, zone: Zone | undefined): void }
```

- Draws/positions a hairline at the column's right edge + margin when pointer
  zone is `"ahead"`; hides otherwise. Fed from `createPointer`'s zone info or a
  `pointermove` listener in `main.ts`.

### `keyboard.ts`

```ts
createKeyboard({
  moveByWords: (delta: number) => void,   // wraps caretAfterWords+moveTo
  toggleAttention: () => void,            // detachAllOrExpand
  openLegend: () => void,
  isEditing: () => boolean,               // focus in input/dialog/contenteditable
}): { destroy(): void }
```

### `session.ts`

```ts
createSession({
  storage: () => Storage | undefined,     // localStorage, may throw
  snapshot: () => SessionState,
  restore: (state: SessionState) => void, // applied by main.ts once sources ready
  now: () => number,
}): { save(): void; load(): SessionState | undefined; clear(): void }
```

- Debounced `save()` (~500 ms) called on caret/box/knob change.
- `load()` returns undefined on parse error, stale (>24 h), or absent.

### `legend.ts`

```ts
createLegend({ dialog: HTMLDialogElement, toggle: HTMLElement }): { open(): void; close(): void }
```

- Fills `#legend` content from the static gesture table in data-model.md;
  `toggle` is the tray `?` button; `h` key handled by `keyboard.ts`.

## Modified contracts

### `text-stream.ts`

Add to returned object:

```ts
restore(tail: { words: number; text: string }): boolean
// returns true if stream.text word count === tail.words and re-appends tail.text
// (only safe before regeneration appended; caller checks)
```

### `future-knobs.ts` `drop()`

- If `!knob.dimension` and released: keep knob in choosing state (no remove,
  no sound); it remains grabbable. Delete paths unchanged (double-click,
  drop-on-main).
- `pin()` additionally triggers a transient `pin-flash` highlight (new
  `CSS.highlights` name, ~1.2 s fade) over the pinned sentence.

### `attention-knobs.ts` `boxSelection`

- Convert selection → box only when `event.altKey` (or `getSelection()` was
  made with Alt held — track via pointerdown modifier on `textElement`).

### `live-mode.ts`

- Keys-stored path: toggle enters armed state (`flight?`, 2.5 s timeout);
  second click reloads live. Keys-missing path: opens dialog (unchanged).

### `sound/engine.ts`

- `isSoundOn()`/`setSoundOn()` read/write `localStorage["spaceship.sound-on"]`.

### `main.ts` composition additions

- Instantiate `ghostText`, `zoneCue`, `keyboard`, `session`, `legend`,
  `onboarding`.
- `render()` calls `ghostText.update(lines, caret.line)` and schedules
  `session.save()` (debounced).
- `discardIfBehindRest` records `RestoreBuffer`, shows tray chip; chip click
  calls `stream.restore` + `moveTo` back.
- `pointermove` feeds `zoneCue.update`.
- Keyboard nudge reuses `caretAfterWords`.

### `index.html` additions

- `<dialog id="legend">` (native, `closedby="closerequest"`, same styling as
  `#live-keys`).
- `<button id="hint">` transient hint element (or created by onboarding).
- Tray: `?` legend button; `↩ restore` chip container (hidden by default).
- CSS: `.ghost`, `#hint`, `#legend` styles, `@media (prefers-reduced-motion)`
  block, `pin-flash` highlight color, zone-cue stroke.
