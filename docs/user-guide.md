# Spaceship — User Guide (as it behaves today)

A field manual for driving the current build, written from a guided browser session
(Playwright, 1280×800, simulator mode). Everything below was verified against the
running app, not just the code.

## What it is

Spaceship is a single-page instrument for _steering generated text in realtime_.
A short story (live mode) or lorem-ipsum stream (sim mode) is continuously
generated into a buffer; a small knob on the page is your position in it. Dragging
the knob scrubs the text; everything else — attention boxes, future knobs —
biases what gets generated next.

Run it: `npm run dev`, open `http://localhost:PORT/spaceship/`.
The `?live=true` query param selects live mode (chosen via the tray toggle).

## First 30 seconds — the actual onboarding

There is **no onboarding, no help text, no visible instructions**. On load:

- The text column is **empty**. ~400 words are already generated and waiting in
  a buffer (`¶0+400` in the tray), but nothing is shown.
- A 14px circular knob sits near the top of where the text column will be.
- The left "rail" is empty. The tray reads e.g.
  `mode sim | »665w/s ▼151ms | ¶0+400 box0 steer0 pin0 | ♪on | extra`.
- A custom crosshair cursor appears once the mouse moves over the page.

**The one thing you must discover: drag the knob downward to reveal text.**
Text appears as the knob travels; words past the knob stay hidden. Scrub back up
and the text past the resting point is discarded and regenerated — this is the
core loop, and nothing tells you it exists.

## The cast

| Element             | What it is                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `#pointer` knob     | Your position in the text. Drag vertically (or anywhere) to scrub forward/back.                                        |
| `#text` column      | The revealed story. Monospace, justified left, centered column.                                                        |
| Left rail (`#rail`) | A ruler: one row per text line with bracket glyphs, keyword labels, relevance numbers, and a 10-step connection meter. |
| `#links` SVG        | Hairline curves: attention keywords → main knob; future knobs → main knob.                                             |
| `#future-hud` SVG   | Rim, ruler ticks, labels for whichever future knob is dragged/hovered.                                                 |
| `.future` knobs     | Small dashed dials spawned by double-click-and-hold on the main knob.                                                  |
| Attention boxes     | Shaded word regions that pin keywords and steer generation.                                                            |
| `#cursor` layer     | Custom crosshair + brackets + dot + readouts (replaces the OS cursor for mouse/pen).                                   |
| `#tray`             | Bottom status bar: mode toggle, stream stats, sound toggle, "extra" link.                                              |

## Core gestures, verified

### 1. Scrub the text — drag the main knob

- Press the knob and drag. It follows the pointer in page coordinates; the caret
  snaps to the nearest text position (`caretAt`). Moving down reveals more text;
  moving back up truncates what was shown past the last "rest" point and
  regenerates it once you pause (100 ms dwell).
- While dragging, each word revealed/removed ticks a sound (if sound is on) and
  the knob shows an orange drag reticle.
- The knob's conic fill (`--fill`) and the six-segment arc (`--buffer`) show
  generation state; it turns orange and spins while the model streams.

### 2. Expand attention — double-click the knob

- A quick double-click on the main knob generates **attention boxes**: shaded
  word regions built around keywords the model chose. Each box underlines its
  keyword and draws a link to the knob.
- Boxes arrive one at a time as the model streams them (`box1`, `box2`, `box3`…).
- Double-click again to collapse all boxes and future knobs (`detachAllOrExpand`).

### 3. Make an attention box from a selection

- Click-drag across words in the text to make a normal text selection, release.
- On pointer-up, the selection becomes an attention box centered on the middle
  word of the selection. The selection is cleared.
- Boxes can be **dragged** to a different word (grab the shaded region; the
  keyword hops word-by-word with a tick sound). Double-click a box to delete it.

### 4. Spawn a future knob — double-click and hold

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
- While dropped, the knob **tracks realization**: as new sentences arrive, a
  confidence meter fills; at ≥0.8 confidence the knob **pins** into the right
  margin beside the sentence that delivered it — it stops steering and can't be
  dragged. If the main knob scrubs back before the pinned sentence, the pin is
  removed.
- **Delete a future knob:** double-click it, or drop it back onto the main knob.
- If the text grows over a dropped knob, it "parks" in the right gutter until it
  pins or is removed.

### 5. Steer by pulling — press in the empty page past the knob

- Past the main knob (where no text is shown yet), the page is a "ahead" zone.
  A press there and drag **pulls the knob toward the hand word-by-word** — the
  text scrubs itself toward your pointer at 3–40 words/sec depending on
  distance. Brackets frame the last shown word; a tether line leads to the
  nearest interactive target.
- This only works in the empty region beyond the caret; over shown text a press
  makes a selection instead.

### 6. The custom cursor

- On first mouse/pen movement the OS cursor is replaced by a full-page crosshair
  (edge-to-edge hairlines through the exact pointer position).
- Targets frame themselves with corner brackets as the hand nears (120 px range);
  the nearest gets a text label (e.g. `338 words`, `box 0.82`).
- Over text: an I-beam marks the insertion caret; during selection both ends are
  marked and the to-be-boxed words are framed.
- Over an attention box: brackets turn orange (press would drag it).
- Past the knob: a high-contrast dot marks the steering point.
- Touch input disables the custom cursor entirely.

### 7. Tray controls

- `mode sim|flight` — click toggles. In sim, clicking opens the **launch
  dialog**: two masked fields (`cerebras`, `gemini`), prefilled from
  localStorage. `launch` saves keys and reloads with `?live=true`; `abort`
  closes. In flight mode, clicking reloads back to sim.
- `♪ on|off` — toggles all UI sounds.
- `extra` — link to `extra/style-1.html` (design sandbox pages).
- Status fields: `»` rate (w/s), `▼` latency to first chunk (ms), `¶` shown words
  `+buffer` generated-past-knob, `box`/`steer`/`pin` counts. Hover glyphs for
  full names. While streaming, rate and buffer read orange.

## What the rail shows (once text exists)

Each row aligns with a text line: line number, bracket segments for attention
boxes covering that line, a keyword with its rank `i`/`b` (brighter while its box
is hovered — that's the "focus monitor"), a relevance score to the current focus,
and a 10-step meter of the line's connection strength. The tip row (where the
knob rests) is marked; the focused row's spine thickens.

## Live mode vs sim mode

- **Sim** (default): lorem-ipsum dictionary stream at ~660 w/s, 150 ms fake
  latency, simulated attention/dimension/relevance/realization sources. No keys
  needed; steering has only a subtle statistical effect (25% of words drawn from
  steering).
- **Flight** (`?live=true`): Cerebras `gpt-oss-120b` streams story continuations
  (120–300 words per call); a Gemini "decisions" API scores keyword relevance,
  realization confidence, and generates the dimension menus for future knobs.
  The story begins from a random opening (`STORY_OPENINGS`). Keys live in
  localStorage (`cerebras-api-key`, `gemini-api-key`).

## Known sharp edges observed while driving

- Blank page on load; nothing invites the first scrub.
- The knob's purpose (position = revealed text) is only legible via its
  `aria-label`, which sighted mouse users never see.
- Gesture vocabulary is entirely hidden: double-click vs double-click-hold vs
  drag vs press-pull have no affordances, tooltips, or legend.
- Future-knob fan interaction (dead zone → gate → swing → distance → drop →
  track → pin) took experimentation to discover and is easy to abort by
  releasing inside the dead zone (which deletes the knob).
- The press-pull steering zone is invisible; its only cue is the dot+tether that
  appears _after_ you enter it.
- Tray glyphs (`» ▼ ¶ box steer pin`) are cryptic without hover.
- No way to read the buffered-but-unrevealed text; the buffer count is the only
  hint that more exists.
- On narrow windows (~480 px) the text column shrinks to ~200 px and the rail
  still renders — usable but cramped.
