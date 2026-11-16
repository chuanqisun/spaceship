# Spaceship — Usability Review & Improvement Proposals

A design critique of the current UX, written as a usability expert / Apple
designer would: findability, feedback, mapping, forgiveness, and delight — then
concrete proposals, then adjacent use cases that would make this interaction
model useful outside a demo.

Method: drove the running app with Playwright (scrub, expand, spawn, tune,
drop, pull, select, dialogs, narrow viewport), read every interaction module,
and stress-tested the gesture vocabulary end to end.

---

## 1. Diagnosis: why it was hard to test

The difficulty wasn't polish — it was **a hidden interaction model**. The app
has at least six distinct gestures (scrub, double-click expand, double-click
collapse, select-to-box, double-click-hold spawn, press-pull steer) plus a
multi-stage future-knob state machine (dead zone → gate → swing → distance →
drop → track → pin → park → delete), and **zero of it is signposted**. The
only documentation is one `aria-label` on a 14px button. A first-time user
sees an empty page with a tiny circle.

Apple's first principle — _the interface should disappear into the task_ — is
inverted here: the interface is invisible, so the task is undiscoverable.
The aesthetic (black field, hairlines, orange "hot" accent, mono type) is
coherent and distinctive; the problem is purely legibility of agency.

### Heuristic findings

| #   | Severity | Finding                                                                                                                                                                                                                                                                           |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Critical | **Blank first screen.** 400 words are buffered but nothing renders until the knob is dragged. No motion, no prompt, no example text. First-time users cannot form a hypothesis about what the knob does.                                                                          |
| H2  | Critical | **No gesture legend.** Every verb is a secret chord. Nielsen's "recognition rather than recall" fails completely.                                                                                                                                                                 |
| H3  | High     | **The core metaphor is unmapped.** "Knob position = revealed text" is spatially reasonable once seen, but the knob gives no hint it gates content (it's a ring with a pip; nothing suggests a playhead).                                                                          |
| H4  | High     | **Invisible steering zone.** Press-pull only exists in the empty region _past_ the caret — the opposite side of where users will naturally press (on the text). Wrong-side affordance.                                                                                            |
| H5  | High     | **Future-knob fan is expert-only.** Spawn requires a 400 ms double-press window + 400 ms hold. Then choosing requires crossing a 96 px gate in the right direction; releasing inside the 24 px dead zone _deletes_ the knob. Three invisible thresholds, one destructive outcome. |
| H6  | Medium   | **Mode dialog on first curiosity click.** Clicking `sim` opens a credential form — the most intimidating possible response to "what does this button do?" It should preview, not gate.                                                                                            |
| H7  | Medium   | **Cryptic telemetry.** `»665w/s ▼151ms ¶0+400 box0 steer0 pin0` is beautiful but illegible; abbr titles help only on hover, and hover is already crowded with bracket readouts.                                                                                                   |
| H8  | Medium   | **Destructive scrub-back is silent.** Dragging the knob back discards generated text and triggers a 400-word regeneration. There's no "are you sure / undo" and no visual diff of what was lost.                                                                                  |
| H9  | Medium   | **Attention boxes vs selection collision.** Text selects normally, but release converts the selection into a steering box — a user selecting to copy gets a steering artifact instead. Copy/paste is impossible.                                                                  |
| H10 | Low      | **Mobile/touch.** Custom cursor is disabled (correct), but all gestures depend on hover-nearness framing that doesn't exist on touch; the fan menu and press-pull are mouse-shaped.                                                                                               |
| H11 | Low      | **No persistence of session.** Reload loses the story, all boxes and knobs. Fine for a demo, fatal for real use.                                                                                                                                                                  |

## 2. Improvement proposals

Ordered by leverage. Each is small enough to land independently.

### P0 — Make the first screen teach itself

1. **Auto-reveal on load.** Start the knob moving (or begin with the first
   sentence already shown and the knob at its end). The single most important
   fix: _show, don't tell_. A 2-second ease-in of text appearing solves H1 and
   H3 simultaneously — the user sees the knob "unspooling" text and infers the
   scrub.
2. **One-line hint that fades.** A single `drag to steer` ghost label near the
   knob on first load, fading after first successful drag (localStorage flag).
   Apple Weather/Procreate do exactly this: motion first, caption second.
3. **Idle attract mode.** If the user hasn't touched anything in ~8 s, gently
   animate the knob a few words forward and back so the page visibly "breathes."
   This is the spaceship-screensaver instinct and it's free.

### P1 — Legible agency

4. **Gesture legend, on demand.** A `?` in the tray corner opening a `<dialog>`
   (the codebase already uses the native dialog API for `#live-keys` — reuse it)
   listing every gesture with a tiny animated diagram. Also surface it via
   long-press on the knob or pressing `h`.
5. **Progressive disclosure on the knob.** Hovering the knob could cycle a hint
   ("drag to scrub · 2×click for focus · hold for future"). Better: after the
   first expand, show a transient toast naming what happened ("3 focus boxes —
   2×click to clear").
6. **Rename the fan.** "Future knobs" is good poetry, bad UI. In the legend and
   tooltips call them what they do: _steering dials for what's next_.
7. **Show the pull zone.** When the pointer is anywhere right of the text
   column, faintly draw the "ahead" region boundary so users learn where
   press-pull lives _before_ pressing. Even a 1-px hairline extension of the
   column edge into the margin would teach the zone.

### P2 — Forgiveness and safety

8. **Undo for scrub-back.** Keep the truncated tail in memory (it's already
   generated — just don't delete it) for ~10 s; a small `↩ restore` chip in the
   tray offers it back. Regeneration stays available but isn't forced.
9. **Dead-zone shouldn't delete.** Releasing a spawned knob inside the dead zone
   should snap it back to "choose a direction" state or park it dormant — only
   _deliberate_ deletion (double-click, drop on main knob) should remove.
   Destructive-by-accident is the worst kind.
10. **Selection vs box disambiguation.** Require a minimum drag distance _and_ a
    modifier (or a "boxify" affordance on selection end) before converting a
    selection to an attention box; otherwise treat it as a normal selection so
    copy works. At minimum, add a one-time "selection became a focus box —
    ⌘C to copy instead" hint.
11. **Mode toggle preview.** First click on `sim` could show a non-modal hint
    ("switch to flight? needs API keys") rather than immediately opening the
    credential dialog. Or split into `sim` label + separate `launch` button.

### P3 — Depth and legibility of telemetry

12. **Decode the tray.** Expand glyphs into words on hover of the whole field,
    or add a one-time legend strip. `»` `▼` `¶` are insider notation.
13. **Buffer visualization.** The knob already has a 6-segment buffer arc —
    make the _unrevealed_ text visible as faint ghost text ahead of the caret
    (at ~10% opacity). Users could then see what they're steering toward,
    which is the entire point of the demo. This may be the single highest-value
    visual change after auto-reveal.
14. **Pin provenance.** When a future knob pins, briefly flash the sentence it
    landed on and the knob's label so the causal link (my dial → that sentence)
    is legible.

### P4 — Accessibility & reach

15. **Keyboard path.** `←/→` or `↑/↓` nudge the caret by word; `Enter` toggles
    attention expand; the fan could be keyboard-driven once spawned. Currently
    zero keyboard operability beyond tab order.
16. **Touch.** Long-press to spawn, drag to tune is feasible; press-pull needs a
    two-finger or edge-swipe variant. At minimum, ensure knob drag and box drag
    work (they do — `makeDraggable` uses pointer events) and hide the
    mouse-only tether/vector UI cleanly (already handled).
17. **Reduced motion / sound.** Honor `prefers-reduced-motion` for the sweep,
    spin, and pin animations; sound already has a toggle — persist it
    (currently resets per load).

## 3. What already works — don't break it

- The **custom cursor system** is genuinely novel and mostly self-explanatory:
  brackets-on-nearness is a learnable grammar. It just needs a legend.
- **Sound design** (ticks per word crossed, graduation ticks, spawn/pin chimes)
  is excellent sonification — it carries information vision can't. Keep it
  central.
- **The left rail** is a quiet masterpiece: relevance, rank, and connection
  meters per line. It needs one onboarding moment ("this rail shows what the
  model is watching") to land.
- **Native `<dialog>`** for keys is correct per AGENTS.md.
- **Sim/flight seam** (`TextSource`, `AsyncIterable` + `AbortSignal`) is exactly
  the right architecture — every improvement above is pure presentation and
  can be prototyped in sim mode.

## 4. Adjacent use cases — making this UX usable in business, life, leisure

The interaction model is _position-in-stream + steerable generation +
attention instrumentation_. That's far more general than story-writing. The
same three primitives (scrub, focus boxes, future dials) map onto:

### Business

- **Live briefings / status narration.** An LLM narrates your morning: calendar,
  metrics, inbox. Scrub back to re-hear yesterday's version; attention boxes pin
  the metric that matters; a future dial "tone: terse ↔ verbose" retunes the
  rest of the briefing live. The pin mechanism becomes _"this dial shaped that
  sentence"_ — an audit trail for generative UI.
- **Contract / clause review.** Scrub through a generated summary of a
  document; select a sentence → attention box forces the model to keep
  returning to that clause; future dials steer risk-register dimensions
  (liability ↔ flexibility). Positions in the stream = positions in the
  document.
- **Sales-call rehearsal.** Steer a simulated prospect's dialogue in realtime:
  dial "objection intensity," box the phrases you want the AI to keep circling.
  Scrub-back = "say that again differently."
- **Decision memos.** Generate a memo, then tune dimensions (audience:
  exec ↔ engineering; depth: shallow ↔ exhaustive) and _watch pinned sentences
  confirm which passages actually changed_ — a diff you can feel.

### Life

- **Morning pages / journaling.** The app writes _with_ you: it continues your
  entry; you scrub to a sentence you like and box it so the next paragraph
  rhymes with it; dials steer mood/energy. Scrub-back regenerates the day you
  didn't want.
- **Recipe / meal improvisation.** Scrub through a generated recipe; box "the
  ingredient I actually have"; dial "time: 15min ↔ 3hrs." Pin shows which
  sentences your constraints rewrote.
- **Language learning.** Generate a story at your level; box words you want
  recycled; dial grammar complexity. Scrubbing = comprehension check — you only
  reveal text as you understand it.
- **Travel planning narration.** "Describe this itinerary as we move the knob"
  — scrub through the trip before taking it; dial pace/interest to retune the
  narration.

### Leisure

- **Interactive fiction, literally.** This is the obvious home: the sim already
  does it. Attention boxes = "make the story keep coming back to the letter";
  future dials = tone/pace/distance; pins = "that dial caused that twist."
- **Music/lyrics sketching.** Stream lyrics or chord-progression prose; box a
  hook phrase; dial rhyme density / emotional valence.
- **Tabletop RPG narration.** The DM's voice, steered live by the table:
  attention on the player's name, dial tension up before the boss room.
- **Ambient storytelling / screensaver.** The idle-attract mode _is_ a product:
  a fireplace of self-steering micro-fiction with sound.

### The generalizable insight

Every one of these needs the same four things the codebase already models well:
a **position in a stream** (caret/knob), **regenerable futures**
(`stream.regenerate` + `truncate`), **named steering dimensions**
(`DimensionSource`), and **proof of causality** (realization tracking → pins).
The UI work is to make those four things _legible_ — which is what section 2 is
for. The business version likely wants the rail renamed "why the model is
watching this" and pins exported as a citation trail.

## 5. Suggested sequencing

1. Auto-reveal + first-drag hint + attract mode (P0.1–3) — one afternoon, huge delta.
2. Gesture legend dialog + dead-zone forgiveness + undo restore (P1.4, P2.8–9).
3. Ghost text ahead of caret + pull-zone hairline (P3.13, P1.7).
4. Keyboard + touch + persistence, in that order.

---

## 6. Remediation status (branch `001-usability-remediation`)

Implemented per `specs/001-usability-remediation/` (spec, plan, tasks — all 31
tasks complete; verified with Playwright scripts `scripts/ux-verify*.mjs`):

- **H1 blank first screen** → auto-reveal on load, transient first-use hint,
  idle attract loop (`src/text/onboarding.ts`).
- **H2 no gesture legend** → `h`/`?` native `<dialog id="legend">` + `?` tray
  button (`src/text/legend.ts`, keyboard in `src/text/keyboard.ts`).
- **H4 invisible steering zone** → `#zone-cue` hairline at the column edge while
  the pointer is in the ahead zone (`src/text/zone-cue.ts`).
- **H5 expert-only fan / destructive dead-zone** → releasing an unchosen knob
  inside the dead zone now keeps it in choosing state instead of deleting;
  pin flash highlights the shaped sentence (`pin-flash` Custom Highlight).
- **H6 mode dialog on first click** → armed `flight?` state when keys are
  stored; dialog only when keys are missing (`src/text/live-mode.ts`).
- **H7 cryptic telemetry** → plain-language `title` tooltips on all tray fields
  (`src/text/status-line.ts`).
- **H8 silent destructive scrub-back** → `↩ Nw` restore chip keeps the discarded
  buffer for 10 s and returns the caret to its pre-scrub rest position
  (`stream.restore`, snapshot-based so staged scrub-backs restore everything).
- **Selection-vs-box collision** → plain selection stays a selection; Alt-held
  selection becomes a box (`attention-knobs.ts`).
- **Keyboard/touch/persistence** → arrow-key word nudge, Enter toggles attention,
  `h` opens legend; sound preference persists (`text-sound`); session state
  (caret, boxes, future knobs) persists for 24 h (`src/text/session.ts`).
- **Ghost text** → ~26 upcoming words rendered at `--ink-5` ahead of the caret,
  pointer-transparent (`src/text/ghost-text.ts`).
- **Reduced motion** → `prefers-reduced-motion` CSS block plus JS gates on
  reveal pacing and attract.

Still open (accepted): the fan gesture remains the steepest interaction; the
steering zone is cued only while the pointer is inside it; narrow viewports are
usable but cramped.
