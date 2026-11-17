# 0004. Forgiving gestures and plain-language affordances

- Status: Accepted
- Date: 2026-11-17

## Context

`docs/usability-review.md` found the app's interaction model hidden: six-plus
gestures with no signposting, an invisible press-pull steering zone, a
multi-threshold future-knob fan whose dead-zone release deleted the knob, and
text selection that silently became a steering box when the user meant to copy.
Spec `001-usability-remediation` remediated these; this record captures the
interaction choices it settled on.

## Decision

- **Explicit modifier for selection → box.** A text selection stays a normal
  selection (copy works); holding `⌥` through the drag turns it into an
  attention box. Touch, which has no modifier, gets a floating `box` action
  instead.
- **Restore chip for scrub-back discards.** Dragging the knob back truncates
  and regenerates, but the discarded text is kept for 10 s and restorable via
  a `↩ Nw` tray chip that also returns the caret to its pre-scrub position.
- **Dead-zone knob release keeps the knob.** Releasing an unchosen future knob
  inside the dead zone leaves it in its choosing state instead of deleting it;
  only deliberate deletion (double-click, drop on the main knob) removes.
- **Visible affordances.** Ghost text previews ~26 upcoming words ahead of the
  caret, a hairline zone cue marks the press-pull steering zone while the
  pointer (or finger) is inside it, and a pinned future knob briefly flashes
  the sentence it shaped.
- **Native dialog legend.** Every gesture is listed in plain language in a
  `<dialog id="legend">`, opened by `h`/`?` or the tray `?` button.
- **Session persistence.** Caret position, attention boxes, and future-knob
  settings persist in localStorage (`spaceship.session`, 24 h TTL) so a
  reload resumes the session; the generated text itself regenerates.

Touch parity (its own gesture set: tap, hold, side buttons, `box` action) is
spec `002-mobile-responsive` scope; this record covers only the interaction
semantics spec 001 established.

## Consequences

- Mouse users must now hold `⌥` to turn a selection into a box — selection
  semantics changed for everyone, and the gesture must stay documented in the
  legend and hint.
- The restore window is bounded at 10 s; staged scrub-backs restore the full
  pre-scrub snapshot because the buffer stores `stream.text` at the first
  discard, not just the latest tail.
- Touch gets its own legend rows rather than sharing the pointer gestures;
  the zone cue doubles as the touch affordance since touch has no hover.
