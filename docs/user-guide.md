# Spaceship — User Guide

A field manual for driving the current build, written from guided browser
sessions (Playwright, 1280×800, simulator mode). Everything below was verified
against the running app, not just the code.

## What it is

Spaceship is a single-page instrument for _steering generated text in realtime_.
A short story (live mode) or lorem-ipsum stream (sim mode) is continuously
generated into a buffer; a small knob on the page is your position in it.
Dragging the knob scrubs the text; everything else — attention boxes, future
knobs — biases what gets generated next.

Run it: `npm run dev`, open `http://localhost:PORT/spaceshipUI/`.
The `?live=true` query param selects live mode (chosen via the tray toggle).

## First 30 seconds

On load the app now teaches itself:

- The knob **reveals text by itself**, pacing through the buffer at ~90 words/s
  for up to ~140 words, so the first screen is never blank.
- A transient **hint** appears under the knob once the reveal ends:
  `drag to reveal · ⌥-select to box · 2×click+hold for future`. It fades on its
  own, and the first completed drag retires it forever (remembered in
  localStorage).
- **Ghost text** continues the shown text in the faintest ink — the generated
  words waiting past the knob, previewing what scrubbing forward reveals.
- If you leave the page alone, the knob performs a small **attract loop**
  (forward a few words, back) after ~6 s of quiet, demonstrating the scrub.
  Any real input ends it for the session.
- **Your session persists**: caret position, attention boxes, and future-knob
  settings are saved (debounced) and restored on reload for up to 24 h.

## The cast

| Element             | What it is                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `#pointer` knob     | Your position in the text. Drag vertically (or anywhere) to scrub forward/back.                                        |
| `#text` column      | The revealed story, with `.ghost` upcoming words appended at low emphasis.                                             |
| Left rail (`#rail`) | A ruler: one row per text line with bracket glyphs, keyword labels, relevance numbers, and a 10-step connection meter. |
| `#links` SVG        | Hairline curves: attention keywords → main knob; future knobs → main knob.                                             |
| `#future-hud` SVG   | Rim, ruler ticks, labels for whichever future knob is dragged/hovered.                                                 |
| `.future` knobs     | Small dashed dials spawned by double-click-and-hold on the main knob.                                                  |
| Attention boxes     | Shaded word regions that pin keywords and steer generation.                                                            |
| `#cursor` layer     | Custom crosshair + brackets + dot + readouts (replaces the OS cursor for mouse/pen).                                   |
| `#zone-cue`         | A hairline at the column's right edge shown while the pointer is in the press-pull steering zone.                      |
| `#tray`             | Bottom status bar: mode toggle, restore chip, legend button, stream stats, sound toggle, "extra" link.                 |
| `#legend` dialog    | Native `<dialog>` listing every gesture in plain language; opens via the `?` tray button or the `h` key.               |

## Core gestures, verified

### 1. Scrub the text — drag the main knob

- Press the knob and drag. It follows the pointer in page coordinates; the caret
  snaps to the nearest text position (`caretAt`). Moving down reveals more text;
  moving back up truncates what was shown past the last "rest" point and
  regenerates it once you pause.
- While dragging, each word revealed/removed ticks a sound (if sound is on) and
  the knob shows an orange drag reticle.
- The knob's conic fill (`--fill`) and the six-segment arc (`--buffer`) show
  generation state; it turns orange and spins while the model streams.
- **Keyboard:** `↑`/`↓`/`←`/`→` nudge the knob one word forward or back while
  the page has focus.

### 2. Undo a scrub-back — the `↩ restore` chip

- Scrubbing back past the resting point discards the text beyond the knob and
  regenerates it — but the discarded text is kept for **10 seconds**.
- A `↩ Nw` chip appears in the tray. Clicking it re-appends the discarded text
  and returns the knob to where it rested before the scrub. The chip hides if
  you move forward again or the window expires.

### 3. Expand attention — double-click the knob

- A quick double-click on the main knob generates **attention boxes**: shaded
  word regions built around keywords the model chose. Each box underlines its
  keyword and draws a link to the knob.
- Boxes arrive one at a time as the model streams them (`box1`, `box2`, `box3`…).
- Double-click again to collapse all boxes and future knobs. `Tab` focuses the
  knob; `Enter` does the same expand/collapse.

### 4. Make an attention box from a selection

- Click-drag across words in the text and release: a **normal selection** stays
  a selection, so copying works.
- Hold **Alt** through the drag and release: the selection becomes an attention
  box centered on its middle word. (The press must start on the text with Alt
  held.)
- Boxes can be **dragged** to a different word (grab the shaded region; the
  keyword hops word-by-word with a tick sound). Double-click a box to delete it.

### 5. Spawn a future knob — double-click and hold

- Press the knob, release, then press again **within 400 ms and hold still**.
- After ~500 ms a sweep animation plays and a small dashed knob spawns at the
  pointer, already grabbed.
- **Choosing a dimension:** carry the knob away from the main knob. Within 24 px
  nothing happens (dead zone); by ~96 px ("the gate") the fan menu commits to
  whichever dimension sector the knob is pointing through. A HUD fan with
  numbered graduations appears while dragging.
- **Tuning:** once a dimension is chosen, swinging the knob around the main knob
  sets the value (scale position or choice option); distance from the main knob
  sets strength (0–1, shown on a ruler). Tuning ticks sounds per graduation.
- **Drop** (release): the knob stays on the page, keeps its setting, and steers
  future text (`steer` count in the tray increments). Its dashed link remains.
  **Releasing before choosing a dimension is safe** — the knob stays, still
  choosing; an accidental release costs nothing. A _tuned_ knob dropped back
  onto the main knob is deleted (as is a double-click).
- While dropped, the knob **tracks realization**: as new sentences arrive, a
  confidence meter fills; at ≥0.8 confidence the knob **pins** into the right
  margin beside the sentence that delivered it — the sentence flashes briefly
  (`pin-flash` highlight), the knob's label shows, and it stops steering. If
  the main knob scrubs back before the pinned sentence, the pin is removed.
- If the text grows over a dropped knob, it "parks" in the right gutter until it
  pins or is removed.

### 6. Steer by pulling — press in the empty page past the knob

- Past the main knob (where no text is shown yet), the page is a "ahead" zone —
  now marked by the **zone cue** hairline at the column's right edge whenever
  the pointer is inside it.
- A press there and drag **pulls the knob toward the hand word-by-word** — the
  text scrubs itself toward your pointer at 3–40 words/sec depending on
  distance. Brackets frame the last shown word; a tether line leads to the
  nearest interactive target.
- This only works in the empty region beyond the caret; over shown text a press
  makes a selection instead.

### 7. The custom cursor

- On first mouse/pen movement the OS cursor is replaced by a full-page crosshair
  (edge-to-edge hairlines through the exact pointer position).
- Targets frame themselves with corner brackets as the hand nears (120 px range);
  the nearest gets a text label (e.g. `338 words`, `box 0.82`).
- Over text: an I-beam marks the insertion caret; during selection both ends are
  marked and the to-be-boxed words are framed.
- Over an attention box: brackets turn orange (press would drag it).
- Past the knob: a high-contrast dot marks the steering point.
- Touch input disables the custom cursor entirely; touch equivalents are below.

### 7a. Touch gestures

On phones and other coarse-pointer devices the same verbs map to touch:

- **Scrub** — drag the (enlarged) knob, same as mouse.
- **Expand/collapse attention** — a single **tap** on the knob (a quick second
  tap is ignored, so double-tapping is harmless). The `⇅` side button does the
  same.
- **Spawn a future knob** — **press and hold the knob ~0.5 s**; no double tap
  needed. Carry, choose, tune and drop work as with a mouse.
- **Steer by pulling** — press-drag in the empty region past the caret; the
  zone cue hairline marks the boundary while your finger is down.
- **Attention box from text** — select text natively (long-press drag), then
  tap the floating **box** button beside the selection or the ⊞ side button.
- **Delete** — a still **~0.5 s press** on an attention box or future knob
  removes it (double-tap still works). A quick **tap** on a future knob pins
  its readout the way hover does; a tap on a box names its keyword in the
  status line.
- **Nudge** — the `‹` `›` side buttons move the knob one word at a time; `⇅`
  expands or collapses attention and `⊞` boxes the selection.
- **Scrolling** — vertical pans scroll the page everywhere, including the
  ahead zone: only non-vertical drags there steer.
- Side controls (`‹` `›` `⇅` `⊞`) appear only on coarse pointers; the gesture
  legend lists the touch mappings when `?` is opened on such a device.

### 8. Tray controls

- `mode sim|flight` — click toggles. With keys stored, the first click arms a
  `flight?` state for ~2.5 s (a second click reloads into live mode) instead of
  surprising you with the dialog. Without keys it opens the **launch dialog**:
  two masked fields (`cerebras`, `gemini`), prefilled from localStorage.
  `launch` saves keys and reloads with `?live=true`; `abort` closes.
- `↩ Nw` — restore chip, see §2.
- `?` — opens the gesture legend (`h` works too).
- `♪ on|off` — toggles all UI sounds; the preference persists across reloads.
- `extra` — link to `extra/style-1.html` (design sandbox pages).
- Status fields show plain-language `title` tooltips over the compact glyphs:
  `»` model rate, `▼` latency to first chunk, `¶` shown words `+buffer`
  generated-past-knob, `box`/`steer`/`pin` counts. While streaming, rate and
  buffer read orange.

## The gesture legend

Press `h` or click `?` in the tray. The dialog lists every gesture — scrub,
restore chip, double-click attention, ⌥-select, double-click-hold future knobs,
press-pull steering, tray toggles — and closes on `Esc` or its button.

## What the rail shows (once text exists)

Each row aligns with a text line: line number, bracket segments for attention
boxes covering that line, a keyword with its rank `i`/`b` (brighter while its box
is hovered — that's the "focus monitor"), a relevance score to the current focus,
and a 10-step meter of the line's connection strength. The tip row (where the
knob rests) is marked; the focused row's spine thickens.

## Live mode vs sim mode

- **Sim** (default): lorem-ipsum dictionary stream at ~800 w/s, 150 ms fake
  latency, simulated attention/dimension/relevance/realization sources. No keys
  needed; steering has only a subtle statistical effect (25% of words drawn from
  steering).
- **Flight** (`?live=true`): Cerebras `gpt-oss-120b` streams story continuations
  (120–300 words per call); a Gemini "decisions" API scores keyword relevance,
  realization confidence, and generates the dimension menus for future knobs.
  The story begins from a random opening (`STORY_OPENINGS`). Keys live in
  localStorage (`cerebras-api-key`, `gemini-api-key`).

## Session persistence

`localStorage["spaceship.session"]` stores `{ version, caretWords, attention,
future, savedAt }`, written ~500 ms after changes settle and ignored after 24 h.
Attention boxes restore by matching keyword text; future knobs re-fetch a fresh
dimension menu and keep settings whose dimension is still offered. Corrupt or
stale state is dropped silently. Sound preference lives under `text-sound`;
hint dismissal under `spaceship.hint-dismissed`.

## Remaining sharp edges

- The future-knob fan interaction (dead zone → gate → swing → distance → drop →
  track → pin) is still the steepest gesture; the legend and hint name it but
  muscle memory takes a session.
- The press-pull steering zone is marked only while the pointer is inside it;
  there is no persistent boundary.
- Below ~768 px the rail hides and side gutters shrink to what pinned knobs
  need; below that the column can get cramped again on very small screens.
- Ghost text previews only ~26 words ahead, so long buffers still reveal
  gradually.
