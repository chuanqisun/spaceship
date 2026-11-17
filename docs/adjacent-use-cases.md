# Adjacent Use Cases — Spaceship's Interaction Model Beyond Story

Spaceship's UX is three primitives wearing a spaceship costume:

1. **A position in a stream** — the knob/caret is _where you are_ in generated text.
2. **Steerable regeneration** — scrub back and futures rewrite themselves.
3. **Attention + dimension instrumentation** — boxes pin _what matters_, dials
   tune _how it reads_, and pins prove _which dial caused which sentence_.

None of that is story-specific. This document ideates where the same model
creates a usable product in business, life, and leisure — and what each domain
needs that the demo doesn't yet have.

---

## The reusable core

| Primitive                          | In Spaceship                               | Generalizes to                                                                   |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Caret/knob                         | Position in generated story                | Position in any generated artifact: brief, contract, recipe, itinerary, lesson   |
| Buffer + top-up                    | 300–400 words generated ahead              | Any lookahead horizon: next paragraph, next slide, next meeting's summary        |
| Scrub-back → truncate → regenerate | "Try a different past"                     | Non-destructive exploration: every rewind is cheap and reversible                |
| Attention boxes                    | Keywords the model must keep returning to  | Constraints, entities, KPIs, ingredients, names — _things that must not be lost_ |
| Future knobs (dimension fan)       | tone/pace/tension dials                    | Any enumerable stylistic or substantive dimension of the output                  |
| Realization → pin                  | Confidence the sentence delivered the dial | **Causal receipt**: proof a control actually changed the output                  |
| Left rail                          | Relevance + connection per line            | Per-section "why is the model watching this" transparency                        |
| Tray telemetry                     | w/s, latency, box/steer/pin counts         | Cost, latency, and intervention counters for agentic systems                     |

The pin mechanism deserves special attention: it's a **causal audit trail** for
generative UI — the first consumer-facing answer to "did my input actually do
anything?" That generalizes to every domain below.

---

## Business

### 1. Live narrated briefings

An agent narrates your morning — calendar, overnight metrics, inbox triage — as a
single stream you scrub through like a tape. Attention boxes pin the two metrics
that matter; dials tune depth (headline ↔ full analysis) and audience (you ↔
exec summary). _Needs:_ scheduled regeneration, persistence, share/export of the
"pin trail" as receipts.

### 2. Contract and document review

Scrub a generated plain-language summary of a contract alongside (or instead of)
the source. Select a clause → box it so every subsequent paragraph must reckon
with it. Dials: risk posture (cautious ↔ aggressive), audience (lawyer ↔
founder). Pins answer the killer question in review: _"which of my concerns
actually changed the summary?"_

### 3. Sales and customer-call rehearsal

A simulated counterpart streams dialogue; you box phrases you want it to keep
returning to ("budget", "timeline", the competitor's name) and dial objection
intensity, patience, technical depth. Scrub-back = "have them say that again,
harder." This is the highest-leverage business use: **rehearsal with a dialable
sparring partner**.

### 4. Decision memos with receipts

Generate a decision memo, tune dimensions (audience, depth, optimism), and let
pins accumulate as evidence of which passages responded to which dial — export
the pin trail as an appendix proving the memo reflects stated priorities.

### 5. Incident narration / on-call copilot

During an outage, an agent streams a narrated timeline. First responders scrub
back to re-hear context, box the error signature so the narrative keeps
returning to it, and dial verbosity down when execs join. Scrub-back maps
naturally to "rewind the timeline."

### 6. Accessibility-first document reader

For low-vision or cognitive-accessibility users, "reveal text at your own pace"
is not a gimmick — it's the product. The knob becomes a reading-speed control;
boxes become vocabulary anchors; dials control sentence complexity. The
custom cursor already demonstrates willingness to replace platform defaults
with a more legible instrument.

---

## Life

### 7. Journaling that writes back

You dictate or type a fragment; the app continues it. You scrub to a sentence
you like, box it ("keep coming back to this image"), and dial mood/energy for
the next paragraph. Scrub-back lets you reject the day the model drafted for
you. Attention boxes = motifs; pins = "this dial made it darker."

### 8. Recipe and meal improvisation

"I have chicken, rice, and a sad broccoli." The stream generates a recipe;
you box the ingredients that must appear (they're literal leads — the sim
already injects lead keywords into generation); dials tune time, spice, and
what-to-do-with-leftovers. Scrub to the step you like and pin the "30-minute"
dial to prove it shortened things.

### 9. Language learning stories

Generate a graded story; box target vocabulary so it recurs; dial grammar
complexity and gloss-density. The scrub mechanic doubles as a comprehension
check — you only reveal what you've parsed. Pins become spaced-repetition
signals ("this word keeps recurring because you boxed it").

### 10. Travel and itinerary narration

Scrub through a narrated trip before you take it; dial pace (relaxed ↔ packed)
and interest (food ↔ history). Attention boxes pin the neighborhood or museum
you care about. The artifact is shareable: send someone the story, not the
PDF itinerary.

### 11. Persuasion and email drafting

Draft a delicate message (a resignation, an apology, a ask). Box the sentence
you refuse to lose; dial warmth ↔ directness, length. Scrub through five
registers in seconds instead of five chat sessions. Pins show which version
kept your non-negotiable sentence intact.

### 12. Accessibility: low-vision and cognitive-load reading

As above but consumer-facing: any long document (terms of service, medical
instructions, academic paper) rendered as a self-paced stream with complexity
dials and vocabulary boxes.

---

## Leisure

### 13. Interactive fiction, done literally

The obvious home — the sim mode is already this. The missing layer is _agency
persistence_: save the story with its boxes, dials, and pins as a "flight
plan" others can re-fly. Leaderboard of most interesting pin trails.

### 14. Tabletop RPG narration

The DM streams narration; players' shouted inputs become attention boxes
("keep mentioning the letter!"); the DM's dials control tension and pacing.
Scrub-back = "rewind that encounter." Pins prove the table's interventions
shaped the story — great for post-session recap.

### 15. Music and lyric sketching

Stream lyrics or prose-poetry; box a hook phrase; dial rhyme density, rhyme
scheme, emotional valence. Scrub to a verse, pin the "dark" dial, and see
which lines it actually touched.

### 16. Ambient storytelling screensaver

Idle attract mode as product: a fireplace of self-steering micro-fiction with
procedural sound. Genuinely shippable as a menu-bar toy.

### 17. Dream journal / sleep-adjacent writing

Night-mode variant: generate surreal continuations of your day at low warmth;
box images that recurred in your head; dial strangeness. Morning-you scrubs
the night away.

### 18. Creative warm-ups for writers

"Describe this room as a heist / as a memory / as a threat" — dial the genre,
box a sensory detail, scrub through ten takes. The pin trail becomes a
"what changed" diff for workshop critique.

---

## What each domain needs that Spaceship lacks today

| Need                    | Today                          | Gap                                                               |
| ----------------------- | ------------------------------ | ----------------------------------------------------------------- |
| Persistence             | None — reload loses everything | Session save/export of text + boxes + dial settings               |
| Shareability            | Localhost only                 | URL-encoded "flight plans" (story seed + steering state)          |
| Causal receipts         | Pins exist but are ephemeral   | Export pin trail: dial → sentence evidence                        |
| Multi-stream            | One text column                | Tabs/panes for parallel drafts (business: 3 versions of the memo) |
| Cost/latency guardrails | Tray shows stats               | Budgets, model routing, "cheap mode" for leisure                  |
| Input modalities        | Type/stream only               | Voice, images, documents as stream sources                        |
| Onboarding              | None                           | Every domain needs the P0 fixes from the review first             |

## The strategic read

Spaceship is a **demonstration of a general interaction contract**: _humans hold
the position, models hold the generation, instruments mediate the steering._
The story is scaffolding. The durable asset is the pattern — and the pattern's
killer feature isn't the knobs, it's the **pin**: a legible, visual proof that
human intent reached the machine's output. Any product that can show "your dial
caused that sentence" has something no chat interface can offer. That's the
thing to protect and productize.
